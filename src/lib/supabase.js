// Mesma anon key pública usada em frontend/js/config.js do projeto atual —
// é segura de embutir aqui também, protegida pelas mesmas RLS policies.
const SUPABASE_URL = "https://ilsrwxqelasqarszdwqi.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_TOSsLFoeIquhRUbJndyVHw_SywCmBbV";

function headers() {
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
}

export async function fetchConfiguracoes() {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/configuracoes?select=chave,valor`, { headers: headers() });
  if (!resp.ok) throw new Error(`Falha ao buscar configurações: ${resp.status}`);
  const linhas = await resp.json();
  const config = {};
  for (const { chave, valor } of linhas) config[chave] = valor;
  return config;
}

function categoriasDesativadasSet(config) {
  return new Set((config.categorias_desativadas || "").split(",").map((c) => c.trim()).filter(Boolean));
}

// Roda no servidor, durante o build — não no navegador do visitante. Filtra
// categorias desativadas no admin, igual o site atual faz (senão o Astro
// geraria página estática pra um produto que o painel marcou pra não
// aparecer, e ela ficaria visível mesmo sem estar linkada em lugar nenhum).
// Busca todos os produtos paginando por Range (igual fetchHistoricoTodos) —
// sem isso, a API do Supabase corta silenciosamente em 1000 linhas (limite
// padrão do PostgREST), e como a ordenação é por mais recém-atualizado,
// lojas inteiras cujos produtos foram salvos mais cedo no scraper somem da
// listagem sem gerar nenhum erro.
async function fetchProdutosBrutos() {
  const TAMANHO_PAGINA = 1000;
  let offset = 0;
  const todos = [];
  while (true) {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/produtos?select=*&disponivel=eq.true&oculto=eq.false&order=destaque.desc,atualizado_em.desc`,
      { headers: { ...headers(), Range: `${offset}-${offset + TAMANHO_PAGINA - 1}` } }
    );
    if (!resp.ok) throw new Error(`Falha ao buscar produtos: ${resp.status}`);
    const lote = await resp.json();
    todos.push(...lote);
    if (lote.length < TAMANHO_PAGINA) break;
    offset += TAMANHO_PAGINA;
  }
  return todos;
}

export async function fetchProdutos() {
  const [produtos, config] = await Promise.all([fetchProdutosBrutos(), fetchConfiguracoes()]);
  const desativadas = categoriasDesativadasSet(config);
  // categoria_manual (edição no admin) vence a categoria detectada pelo
  // scraper — aplicado aqui, uma vez só, pra todo o site público (home,
  // /categoria/, /loja/, produto, sitemap) já receber o valor efetivo sem
  // precisar repetir essa checagem em cada página.
  return produtos
    .map((p) => (p.categoria_manual ? { ...p, categoria: p.categoria_manual } : p))
    .filter((p) => !desativadas.has(p.categoria));
}

export async function fetchSecoes() {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/secoes_home?select=*&ativo=eq.true&order=ordem.asc`, {
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Falha ao buscar seções: ${resp.status}`);
  return resp.json();
}

export async function fetchLojas() {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/lojas?select=*`, { headers: headers() });
  if (!resp.ok) throw new Error(`Falha ao buscar lojas: ${resp.status}`);
  return resp.json();
}

export const REDES_LOJA = [
  { chave: "instagram_url", label: "Instagram", emoji: "📷" },
  { chave: "facebook_url", label: "Facebook", emoji: "📘" },
  { chave: "linkedin_url", label: "LinkedIn", emoji: "💼" },
  { chave: "site_url", label: "Site oficial", emoji: "🌐" },
];

export const EMOJI_CATEGORIA = { resina: "🧪", filamento: "🧵", acessorio: "🛠️", pigmento: "🎨", impressora: "🖨️" };

export const LABEL_CATEGORIA = {
  resina: "Resina",
  filamento: "Filamento",
  acessorio: "Acessório",
  pigmento: "Pigmento",
  impressora: "Impressora",
};

// Tira acento (NFD + remove marcas diacríticas) e deixa minúsculo — pra
// "lavavel" (sem acento, como a maioria digita) achar "Lavável". Usado tanto
// aqui no build (atributo data-nome do card) quanto no client-side
// (interativo.js tem sua própria cópia, já que não roda no navegador).
export function normalizarBusca(texto) {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function formatarPreco(valor) {
  if (valor == null) return "-";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function materialEfetivo(p) {
  return p.material_manual || p.material || null;
}

export function kitEfetivo(p) {
  return p.kit_manual ?? p.kit ?? false;
}

// Busca a tabela inteira de uma vez (paginada) em vez de uma chamada por
// produto — com ~22 mil linhas isso é uma dúzia de requests no build, contra
// centenas de requests (um por produto) se buscássemos individualmente.
export async function fetchHistoricoTodos() {
  const TAMANHO_PAGINA = 1000;
  let offset = 0;
  const todos = [];
  while (true) {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/historico_precos?select=produto_id,preco,preco_pix,capturado_em&order=capturado_em.asc`,
      { headers: { ...headers(), Range: `${offset}-${offset + TAMANHO_PAGINA - 1}` } }
    );
    if (!resp.ok) throw new Error(`Falha ao buscar histórico: ${resp.status}`);
    const lote = await resp.json();
    todos.push(...lote);
    if (lote.length < TAMANHO_PAGINA) break;
    offset += TAMANHO_PAGINA;
  }
  return todos;
}

export function buildHistoricoPorProduto(historicoTodos) {
  const mapa = new Map();
  for (const h of historicoTodos) {
    if (!mapa.has(h.produto_id)) mapa.set(h.produto_id, []);
    mapa.get(h.produto_id).push(h);
  }
  return mapa;
}

// Mesma heurística do site atual: mesma categoria, loja diferente, mesmo
// kit/não-kit, mesmo material quando detectado — no máximo 1 produto por
// loja (o mais barato dela), até 6 no total.
export function produtosParecidos(produtos, p, faixaPrecoAtiva) {
  const material = materialEfetivo(p);
  const kitAtual = kitEfetivo(p);

  let candidatos = produtos.filter(
    (outro) =>
      outro.id !== p.id &&
      outro.categoria === p.categoria &&
      outro.loja !== p.loja &&
      kitEfetivo(outro) === kitAtual &&
      (material ? materialEfetivo(outro) === material : true)
  );

  // sem subcategoria detectada, filtra por faixa de preço (metade a o dobro)
  // pra manter a comparação relevante — desativável no admin
  // (parecidos_faixa_preco_ativa) porque em categorias com poucos produtos
  // ela pode zerar os resultados.
  if (!material && faixaPrecoAtiva) {
    const precoMin = p.preco * 0.5;
    const precoMax = p.preco * 2;
    candidatos = candidatos.filter((outro) => outro.preco >= precoMin && outro.preco <= precoMax);
  }

  const maisBaratoPorLoja = new Map();
  for (const item of candidatos) {
    const atual = maisBaratoPorLoja.get(item.loja);
    if (!atual || item.preco < atual.preco) {
      maisBaratoPorLoja.set(item.loja, item);
    }
  }

  return [...maisBaratoPorLoja.values()].sort((a, b) => a.preco - b.preco).slice(0, 6);
}
