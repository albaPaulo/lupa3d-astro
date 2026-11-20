// Mesma anon key pública usada em frontend/js/config.js do projeto atual —
// é segura de embutir aqui também, protegida pelas mesmas RLS policies.
const SUPABASE_URL = "https://ilsrwxqelasqarszdwqi.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_TOSsLFoeIquhRUbJndyVHw_SywCmBbV";

function headers() {
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
}

// Cada page (home, categoria, ofertas, loja, produto, mais-clicados,
// novidades, feed.xml) busca produtos/histórico/config de forma independente
// no getStaticPaths/frontmatter dela — sem isso, uma build só do site refaz
// a MESMA busca (a tabela de histórico inteira, ~dezenas de milhares de
// linhas) até 8 vezes, foi o que estourou a cota de egress do projeto. O
// cache é por chamada do processo de build (guarda a Promise, não só o
// resultado, pra chamadas concorrentes antes da primeira resolver
// compartilharem a mesma request em voo) e nunca é usado no navegador do
// visitante — zera a cada build novo, então o dado sempre é o mais recente.
function memoizar(fn) {
  const cache = new Map();
  return (...args) => {
    const chave = JSON.stringify(args);
    if (!cache.has(chave)) cache.set(chave, fn(...args));
    return cache.get(chave);
  };
}

async function fetchConfiguracoesSemCache() {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/configuracoes?select=chave,valor`, { headers: headers() });
  if (!resp.ok) throw new Error(`Falha ao buscar configurações: ${resp.status}`);
  const linhas = await resp.json();
  const config = {};
  for (const { chave, valor } of linhas) config[chave] = valor;
  return config;
}
export const fetchConfiguracoes = memoizar(fetchConfiguracoesSemCache);

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
async function fetchProdutosBrutosSemCache({ incluirIndisponiveis = false } = {}) {
  const TAMANHO_PAGINA = 1000;
  let offset = 0;
  const todos = [];
  const filtroDisponivel = incluirIndisponiveis ? "" : "&disponivel=eq.true";
  while (true) {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/produtos?select=*${filtroDisponivel}&oculto=eq.false&order=destaque.desc,atualizado_em.desc`,
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
// Chamada sempre com o mesmo formato de argumento (objeto explícito) pelas
// duas linhas de fetchProdutos() logo abaixo — chave de cache consistente.
const fetchProdutosBrutos = memoizar(fetchProdutosBrutosSemCache);

// incluirIndisponiveis: usado só pela página de produto, pra manter no ar o
// link de um produto que ficou sem estoque (mostrando "indisponível" em vez
// de sumir com a página) — home/categoria/loja/comparação continuam usando
// o padrão (só disponível), essa opção nunca deve vazar pra listagem.
export async function fetchProdutos({ incluirIndisponiveis = false } = {}) {
  const [produtos, config] = await Promise.all([fetchProdutosBrutos({ incluirIndisponiveis }), fetchConfiguracoes()]);
  const desativadas = categoriasDesativadasSet(config);
  const afiliadosAtivos = config.mostrar_produtos_afiliados !== "false";
  // categoria_manual (edição no admin) vence a categoria detectada pelo
  // scraper — aplicado aqui, uma vez só, pra todo o site público (home,
  // /categoria/, /loja/, produto, sitemap) já receber o valor efetivo sem
  // precisar repetir essa checagem em cada página. Produto de afiliado some
  // do site inteiro quando o toggle está desligado — kill switch rápido sem
  // precisar reverter código.
  return produtos
    .map((p) => (p.categoria_manual ? { ...p, categoria: p.categoria_manual } : p))
    .filter((p) => !desativadas.has(p.categoria))
    .filter((p) => afiliadosAtivos || !p.afiliado);
}

async function fetchSecoesSemCache() {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/secoes_home?select=*&ativo=eq.true&order=ordem.asc`, {
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Falha ao buscar seções: ${resp.status}`);
  return resp.json();
}
export const fetchSecoes = memoizar(fetchSecoesSemCache);

async function fetchLojasSemCache() {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/lojas?select=*`, { headers: headers() });
  if (!resp.ok) throw new Error(`Falha ao buscar lojas: ${resp.status}`);
  return resp.json();
}
export const fetchLojas = memoizar(fetchLojasSemCache);

// Loja com mais de uma unidade física guarda os estados separados por
// vírgula (ex: "SP, RJ") — usado pelo filtro de localização nas páginas de
// listagem, cruzando produto (data-loja no card) com o(s) estado(s) da loja.
export async function fetchLojaEstadoMap() {
  const lojas = await fetchLojas();
  return Object.fromEntries(
    lojas.map((l) => [
      l.nome,
      (l.estado || "").split(",").map((uf) => uf.trim().toUpperCase()).filter(Boolean),
    ])
  );
}

// Redimensiona/comprime via Netlify Image CDN as fotos de produto, que vêm
// hotlinkadas direto do CDN de cada loja no tamanho original (às vezes bem
// maior que o exibido). Domínios de origem liberados em netlify.toml.
export function otimizarImagem(url, largura) {
  if (!url) return url;
  return `/.netlify/images?url=${encodeURIComponent(url)}&w=${largura}&q=75`;
}

export const REDES_LOJA = [
  { chave: "instagram_url", label: "Instagram", emoji: "📷" },
  { chave: "facebook_url", label: "Facebook", emoji: "📘" },
  { chave: "linkedin_url", label: "LinkedIn", emoji: "💼" },
  { chave: "site_url", label: "Site oficial", emoji: "🌐" },
];

export const EMOJI_CATEGORIA = { resina: "🧪", filamento: "🧵", acessorio: "🛠️", pigmento: "🎨", impressora: "🖨️" };

export const LABEL_CATEGORIA = {
  resina: "Resina 3D",
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
async function fetchHistoricoTodosSemCache() {
  const TAMANHO_PAGINA = 1000;
  let offset = 0;
  const todos = [];
  // Pontos marcados como ignorados (dado errado de coleta, migration_029) ficam
  // no banco mas fora de gráficos/badges/descontos. Se a coluna ainda não
  // existir (migration não rodada), cai pra consulta sem o filtro em vez de
  // quebrar o build.
  let filtroIgnorado = "&ignorado=eq.false";
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/historico_precos?select=produto_id,preco,preco_pix,capturado_em&order=capturado_em.asc`;
    const opcoes = { headers: { ...headers(), Range: `${offset}-${offset + TAMANHO_PAGINA - 1}` } };
    let resp = await fetch(url + filtroIgnorado, opcoes);
    if (resp.status === 400 && filtroIgnorado) {
      filtroIgnorado = "";
      resp = await fetch(url, opcoes);
    }
    if (!resp.ok) throw new Error(`Falha ao buscar histórico: ${resp.status}`);
    const lote = await resp.json();
    todos.push(...lote);
    if (lote.length < TAMANHO_PAGINA) break;
    offset += TAMANHO_PAGINA;
  }
  return todos;
}
export const fetchHistoricoTodos = memoizar(fetchHistoricoTodosSemCache);

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
// loja (o mais barato dela), até 6 no total. Também exige mesmo "canal"
// (afiliado ou não) — produto de marketplace/afiliado só compara com outro
// de marketplace, nunca com loja direta. Sem essa trava, o preço mais alto
// de uma listagem de afiliado (comissão embutida) apareceria competindo
// com a loja direta, criando conflito de interesse (a comissão incentivaria
// promover justamente a oferta que NÃO é a mais barata).
// Peso/volume do produto (colunas quantidade/unidade, preenchidas pelo scraper:
// nome do produto ou variação da página). Filamento sem dado é assumido 1 kg
// (90% dos filamentos com peso conhecido são de 1 kg) e marcado como
// estimado; resina sem dado fica sem quantidade — nunca se chuta resina.
const CATEGORIAS_COM_QUANTIDADE = new Set(["filamento", "resina"]);

export function quantidadeEfetiva(p) {
  if (!CATEGORIAS_COM_QUANTIDADE.has(p.categoria)) return null;
  if (p.quantidade != null && p.unidade) {
    return { quantidade: Number(p.quantidade), unidade: p.unidade, estimada: false };
  }
  if (p.categoria === "filamento") return { quantidade: 1000, unidade: "g", estimada: true };
  return null;
}

// Preço por kg (ou por litro, se o produto é em ml) — base de comparação justa
// entre embalagens. null quando não dá pra saber o peso.
export function precoPorKg(p) {
  const q = quantidadeEfetiva(p);
  if (!q || !(q.quantidade > 0)) return null;
  return {
    valor: (Number(p.preco) * 1000) / q.quantidade,
    unidade: q.unidade === "ml" ? "L" : "kg",
    estimada: q.estimada,
  };
}

// "1 kg", "500 g", "1 L", "500 ml"
export function formatarQuantidade({ quantidade, unidade }) {
  const grande = quantidade >= 1000;
  const valor = grande ? quantidade / 1000 : quantidade;
  const rotulo = unidade === "ml" ? (grande ? "L" : "ml") : (grande ? "kg" : "g");
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${rotulo}`;
}

// Mínimo de comparáveis pra mostrar a seção "em outras lojas" de filamento/resina:
// uma lista de 1-2 itens não diz nada sobre o preço de mercado.
const MINIMO_COMPARAVEIS = 3;

export function produtosParecidos(produtos, p, faixaPrecoAtiva) {
  const material = materialEfetivo(p);
  const kitAtual = kitEfetivo(p);

  // Filamento e resina só se comparam com MESMO material e MESMO peso/volume —
  // senão a lista misturava resina dental com standard, 300 g com 1 kg, etc.
  // Sem material ou (resina) sem peso conhecido, não há o que comparar: lista
  // vazia, e a página esconde a seção.
  if (CATEGORIAS_COM_QUANTIDADE.has(p.categoria)) {
    const qAtual = quantidadeEfetiva(p);
    if (!material || !qAtual) return [];

    const comparaveis = produtos.filter((outro) => {
      if (
        outro.id === p.id ||
        outro.categoria !== p.categoria ||
        outro.loja === p.loja ||
        Boolean(outro.afiliado) !== Boolean(p.afiliado) ||
        kitEfetivo(outro) !== kitAtual ||
        materialEfetivo(outro) !== material
      ) {
        return false;
      }
      const q = quantidadeEfetiva(outro);
      return q && q.unidade === qAtual.unidade && q.quantidade === qAtual.quantidade;
    });

    const maisBaratoDaLoja = new Map();
    for (const item of comparaveis) {
      const atual = maisBaratoDaLoja.get(item.loja);
      if (!atual || item.preco < atual.preco) maisBaratoDaLoja.set(item.loja, item);
    }
    const lista = [...maisBaratoDaLoja.values()].sort((a, b) => a.preco - b.preco).slice(0, 6);
    return lista.length >= MINIMO_COMPARAVEIS ? lista : [];
  }

  let candidatos = produtos.filter(
    (outro) =>
      outro.id !== p.id &&
      outro.categoria === p.categoria &&
      outro.loja !== p.loja &&
      Boolean(outro.afiliado) === Boolean(p.afiliado) &&
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

const LIMIAR_ABAIXO_MERCADO = 0.85; // preço <= 85% da mediana do grupo
const MINIMO_GRUPO_MERCADO = 3; // mediana de 1-2 produtos não significa nada

// Compara o preço do produto com a mediana de outros produtos do mesmo
// "grupo" (categoria + material + kit/não-kit + afiliado/direto — mesma
// definição de "parecido" usada em produtosParecidos, só que em lote pra
// todo o catálogo de uma vez, em vez de sob demanda por produto). Diferente
// dos badges de menor preço (que comparam com o histórico do PRÓPRIO
// produto), este compara com a concorrência agora — "mais barato que os
// outros", não "mais barato do que já foi".
export function calcularBadgesAbaixoMercado(produtos) {
  const chaveGrupo = (p) => `${p.categoria}|${materialEfetivo(p) || ""}|${kitEfetivo(p)}|${Boolean(p.afiliado)}`;

  const precosPorGrupo = new Map();
  for (const p of produtos) {
    if (!p.categoria) continue;
    const chave = chaveGrupo(p);
    if (!precosPorGrupo.has(chave)) precosPorGrupo.set(chave, []);
    precosPorGrupo.get(chave).push(Number(p.preco));
  }

  const medianaPorGrupo = new Map();
  for (const [chave, precos] of precosPorGrupo) {
    if (precos.length < MINIMO_GRUPO_MERCADO) continue;
    const ordenado = [...precos].sort((a, b) => a - b);
    const meio = Math.floor(ordenado.length / 2);
    medianaPorGrupo.set(chave, ordenado.length % 2 ? ordenado[meio] : (ordenado[meio - 1] + ordenado[meio]) / 2);
  }

  const idsAbaixoMercado = new Set();
  for (const p of produtos) {
    if (!p.categoria) continue;
    const mediana = medianaPorGrupo.get(chaveGrupo(p));
    if (mediana != null && Number(p.preco) <= mediana * LIMIAR_ABAIXO_MERCADO) {
      idsAbaixoMercado.add(p.id);
    }
  }
  return idsAbaixoMercado;
}
