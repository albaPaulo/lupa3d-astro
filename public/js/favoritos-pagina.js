// Único fetch que essa versão do site faz fora do build: como favoritos são
// por visitante (localStorage), não tem como gerar essa página no build —
// busca só os produtos favoritados na hora (não o catálogo inteiro).
let PRODUTOS_FAVORITOS = [];
let IDS_COM_QUEDA = new Set();
let IDS_ALVO_ATINGIDO = new Set();

// Preço-alvo é 100% local (localStorage) — não precisa de fetch, só compara
// com o preço que já veio junto dos favoritos. Conta Pix como válido: se o
// melhor preço disponível (normal ou Pix) já bateu o alvo, contou.
function computarAlvosAtingidos(produtos) {
  const alvos = getAlvos();
  const atingidos = new Set();
  for (const p of produtos) {
    const alvo = alvos[p.id];
    if (alvo == null) continue;
    const temPixMelhor = p.preco_pix != null && Number(p.preco_pix) < Number(p.preco);
    const melhorPreco = temPixMelhor ? Number(p.preco_pix) : Number(p.preco);
    if (melhorPreco <= Number(alvo)) atingidos.add(p.id);
  }
  return atingidos;
}

function atualizarAlertaAlvo() {
  const alerta = document.getElementById("favoritos-alerta-alvo");
  if (!alerta) return;
  const quantidade = PRODUTOS_FAVORITOS.filter((p) => IDS_ALVO_ATINGIDO.has(p.id)).length;
  if (quantidade === 0) {
    alerta.classList.add("oculto-tela");
    return;
  }
  const verbo = quantidade === 1 ? "atingiu" : "atingiram";
  alerta.textContent = `🎯 ${quantidade} dos seus favoritos ${verbo} o preço-alvo`;
  alerta.classList.remove("oculto-tela");
}

// Não temos alerta por e-mail — mas já rastreamos o histórico de preço de
// cada produto, então dá pra comparar o preço atual com o maior já visto
// (mesma definição de "queda" usada no selo de desconto da página do
// produto) e avisar direto na tela quem dos favoritos baixou.
async function buscarQuedasFavoritos(produtos) {
  if (produtos.length === 0) return new Set();

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.LUPA3D_CONFIG;
  const ids = produtos.map((p) => p.id);
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/historico_precos?select=produto_id,preco&produto_id=in.(${ids.join(",")})`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!resp.ok) return new Set();
    const historico = await resp.json();

    const maximoPorProduto = new Map();
    for (const h of historico) {
      const atual = maximoPorProduto.get(h.produto_id) ?? -Infinity;
      if (h.preco > atual) maximoPorProduto.set(h.produto_id, h.preco);
    }

    const comQueda = new Set();
    for (const p of produtos) {
      const maximo = maximoPorProduto.get(p.id);
      if (maximo != null && Number(p.preco) < maximo) comQueda.add(p.id);
    }
    return comQueda;
  } catch {
    return new Set();
  }
}

function atualizarAlertaQueda() {
  const alerta = document.getElementById("favoritos-alerta-queda");
  if (!alerta) return;
  // Conta só quem ainda está na lista (não os que já foram desfavoritados).
  const quantidade = PRODUTOS_FAVORITOS.filter((p) => IDS_COM_QUEDA.has(p.id)).length;
  if (quantidade === 0) {
    alerta.classList.add("oculto-tela");
    return;
  }
  const verbo = quantidade === 1 ? "baixou" : "baixaram";
  alerta.textContent = `📉 ${quantidade} dos seus favoritos ${verbo} de preço`;
  alerta.classList.remove("oculto-tela");
}

function cardHTMLCliente(p) {
  const material = p.material_manual || p.material || "";
  const kit = p.kit_manual ?? p.kit ?? false;
  const temPix = p.preco_pix != null && Number(p.preco_pix) < Number(p.preco);
  const caiuPreco = IDS_COM_QUEDA.has(p.id);
  const atingiuAlvo = IDS_ALVO_ATINGIDO.has(p.id);
  const imagem = p.imagem_url
    ? `<img src="${escapeHTMLJS(p.imagem_url)}" alt="${escapeHTMLJS(p.nome)}" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="card-imagem-vazia">📦</span>`;

  return `
    <article class="card" data-id="${p.id}" data-nome="${escapeHTMLJS(normalizarBuscaJS(p.nome))}" data-categoria="${escapeHTMLJS(p.categoria || "")}" data-material="${escapeHTMLJS(material)}" data-pix="${temPix ? "1" : "0"}" data-preco="${p.preco}" data-cliques="${p.cliques_total || 0}" data-criado="${p.criado_em || ""}">
      <button class="btn-favorito" data-id="${p.id}" title="Favoritar" aria-label="Favoritar" aria-pressed="false">☆</button>
      ${p.destaque ? `<span class="badge-destaque">🔥</span>` : ""}
      ${kit ? `<span class="badge-kit">Kit/Combo</span>` : ""}
      ${atingiuAlvo ? `<span class="badge-menor-preco">🎯 Atingiu seu preço-alvo!</span>` : caiuPreco ? `<span class="badge-menor-preco">📉 Baixou de preço</span>` : ""}
      ${p.afiliado ? `<span class="badge-afiliado" title="Link de afiliado — o LUPA3D pode receber uma comissão nessa compra, sem custo extra pra você">Afiliado</span>` : ""}
      <div class="card-imagem">${imagem}</div>
      <div class="card-corpo">
        <h3 class="card-nome">${escapeHTMLJS(p.nome)}</h3>
        ${material ? `<span class="card-material">${escapeHTMLJS(material)}</span>` : ""}
        <div class="card-precos">
          <span class="card-preco">${formatarPrecoJS(p.preco)}</span>
          ${p.preco_pix ? `<span class="card-preco-pix">${formatarPrecoJS(p.preco_pix)} no Pix</span>` : ""}
        </div>
        <div class="card-loja-linha">
          <span class="card-loja-nome">${escapeHTMLJS(p.loja)}</span>
        </div>
        <div class="card-acoes">
          <a href="/produto/${p.id}/" class="btn-ver-oferta">Ver detalhes</a>
          <button type="button" class="btn-comparar-toggle" data-id="${p.id}" title="Comparar" aria-label="Comparar" aria-pressed="false">⇄</button>
        </div>
      </div>
    </article>
  `;
}

function popularFiltrosFavoritos(produtos) {
  const categorias = [...new Set(produtos.map((p) => p.categoria).filter(Boolean))].sort();
  const materiais = [...new Set(produtos.map((p) => p.material_manual || p.material).filter(Boolean))].sort();
  const selCategoria = document.getElementById("filtro-categoria");
  const selMaterial = document.getElementById("filtro-material");
  if (selCategoria) {
    selCategoria.innerHTML =
      `<option value="">Todas as categorias</option>` + categorias.map((c) => `<option value="${escapeHTMLJS(c)}">${escapeHTMLJS(c)}</option>`).join("");
  }
  if (selMaterial) {
    selMaterial.innerHTML =
      `<option value="">Todos os materiais</option>` + materiais.map((m) => `<option value="${escapeHTMLJS(m)}">${escapeHTMLJS(m)}</option>`).join("");
  }
}

function renderizarGridFavoritos() {
  const grid = document.getElementById("grid");
  const status = document.getElementById("status");
  const compartilharWrap = document.getElementById("favoritos-compartilhar");
  if (!grid) return;

  if (PRODUTOS_FAVORITOS.length === 0) {
    grid.innerHTML = "";
    if (status) {
      status.textContent = "Você ainda não favoritou nenhum produto — clique na estrela ☆ de um card pra guardar aqui.";
      status.classList.remove("status-carregando");
    }
    compartilharWrap?.classList.add("oculto-tela");
    return;
  }

  if (status) status.textContent = "";
  grid.innerHTML = PRODUTOS_FAVORITOS.map(cardHTMLCliente).join("");
  compartilharWrap?.classList.remove("oculto-tela");
  atualizarLinksCompartilhar();
  hidratarFavoritos();
  hidratarComparacao();
  aplicarFiltros();
  atualizarAlertaQueda();
  atualizarAlertaAlvo();
}

async function aplicarColunasGrid() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.LUPA3D_CONFIG;
  const grid = document.getElementById("grid");
  if (!grid) return;
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/configuracoes?select=valor&chave=eq.colunas_grid`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    const linhas = await resp.json();
    const colunas = Math.min(6, Math.max(2, parseInt(linhas[0]?.valor, 10) || 3));
    grid.style.setProperty("--colunas-grid", colunas);
  } catch {
    // sem config, fica no padrão do CSS (3 colunas)
  }
}

async function carregarFavoritos() {
  const status = document.getElementById("status");
  const ids = getFavoritos();

  aplicarColunasGrid();

  if (ids.length === 0) {
    renderizarGridFavoritos();
    return;
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.LUPA3D_CONFIG;
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/produtos?select=*&id=in.(${ids.join(",")})`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!resp.ok) throw new Error("Falha ao buscar favoritos");
    const brutos = await resp.json();
    // categoria_manual (edição no admin) vence a categoria detectada pelo
    // scraper, igual no site (fetchProdutos em src/lib/supabase.js) — essa
    // página busca os produtos direto do Supabase, então precisa repetir.
    PRODUTOS_FAVORITOS = brutos.map((p) => (p.categoria_manual ? { ...p, categoria: p.categoria_manual } : p));
  } catch (e) {
    if (status) status.textContent = "Não foi possível carregar seus favoritos agora.";
    return;
  }

  IDS_COM_QUEDA = await buscarQuedasFavoritos(PRODUTOS_FAVORITOS);
  IDS_ALVO_ATINGIDO = computarAlvosAtingidos(PRODUTOS_FAVORITOS);
  popularFiltrosFavoritos(PRODUTOS_FAVORITOS);
  renderizarGridFavoritos();
}

// public/js/*.js não passa pelo bundler do Astro (é servido como arquivo
// estático), então não dá pra importar src/lib/compartilhar.js aqui — a
// mesma lógica de montar os links por rede é repetida (igual normalizarBuscaJS
// já faz nesse arquivo pros outros helpers client-side).
function atualizarLinksCompartilhar() {
  const container = document.getElementById("favoritos-compartilhar");
  if (!container) return;

  const ids = getFavoritos();
  const url = `${window.location.origin}/favoritos/?favoritos=${ids.join(",")}`;
  const texto = "Confira meus produtos favoritos no LUPA3D";

  const urlsPorRede = {
    WhatsApp: `https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`)}`,
    Telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(texto)}`,
    Facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    X: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(texto)}`,
  };

  container.querySelectorAll("[data-rede]").forEach((a) => {
    a.href = urlsPorRede[a.dataset.rede] || "#";
  });
}

function ligarCompartilharFavoritos() {
  document.getElementById("btn-compartilhar-favoritos")?.addEventListener("click", () => {
    const ids = getFavoritos();
    const url = `${window.location.origin}/favoritos/?favoritos=${ids.join(",")}`;
    navigator.clipboard?.writeText(url);
    alert("Link de favoritos copiado!");
  });
}

// Nesta página (só aqui), desfavoritar precisa tirar o card da lista — nas
// outras páginas o card continua na grade normalmente.
document.addEventListener("click", (ev) => {
  if (!ev.target.closest(".btn-favorito[data-id]")) return;
  const idsAtuais = new Set(getFavoritos());
  PRODUTOS_FAVORITOS = PRODUTOS_FAVORITOS.filter((p) => idsAtuais.has(p.id));
  renderizarGridFavoritos();
});

ligarCompartilharFavoritos();
carregarFavoritos();
