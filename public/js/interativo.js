// Camada de interatividade client-side (progressive enhancement) sobre o
// HTML já renderizado estaticamente no build. Favoritos e comparação
// continuam 100% client-side (localStorage), igual ao site atual — a
// diferença é que aqui o HTML já chega pronto (sem favorito/comparação
// marcados, já que isso é por visitante) e esse script só "liga" o estado
// certo depois que a página carrega.

function escapeHTMLJS(valor) {
  if (valor == null) return "";
  const mapa = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(valor).replace(/[&<>"']/g, (c) => mapa[c]);
}

function formatarPrecoJS(valor) {
  if (valor == null) return "-";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Tira acento e deixa minúsculo — pra "lavavel" (sem acento, como a maioria
// digita) achar "Lavável". Mesma lógica de normalizarBusca() em
// src/lib/supabase.js, duplicada aqui porque esse arquivo roda no navegador
// (não passa pelo build do Astro).
function normalizarBuscaJS(texto) {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

// "Standard"/"Padrão"/"Geral"/"General"/"Básica"/"Basic" são o mesmo tipo de
// resina em nomes diferentes (mesma lista de sinônimos usada pra normalizar
// a tag de material no admin) — sem isso, buscar "resina standard" não
// achava produtos chamados "Resina Padrão" e vice-versa. Já em minúsculo e
// sem acento (mesmo tratamento de normalizarBuscaJS).
const GRUPOS_SINONIMOS_BUSCA = [["standard", "padrao", "geral", "general", "basica", "basic"]];

function palavrasEquivalentes(palavra) {
  return GRUPOS_SINONIMOS_BUSCA.find((grupo) => grupo.includes(palavra)) || [palavra];
}

// Busca por palavra, não por frase inteira — "resina stand" precisa achar
// "Resina Premium Standard" e "Resina 3D Standard 4.0", que têm outras
// palavras no meio e não bateriam com um simples .includes(frase completa).
function nomeCorrespondeABusca(nomeLowerCase, termoLowerCase) {
  return termoLowerCase
    .split(/\s+/)
    .filter(Boolean)
    .every((palavra) => palavrasEquivalentes(palavra).some((sinonimo) => nomeLowerCase.includes(sinonimo)));
}

function atualizarBotaoFavorito(btn) {
  const id = Number(btn.dataset.id);
  const ativo = isFavorito(id);
  btn.classList.toggle("ativo", ativo);
  btn.setAttribute("aria-pressed", String(ativo));
  btn.textContent = ativo ? "★" : "☆";
}

function atualizarContadorFavoritos() {
  document.querySelectorAll("[data-contador-favoritos]").forEach((el) => {
    el.textContent = getFavoritos().length;
  });
}

function hidratarFavoritos() {
  document.querySelectorAll(".btn-favorito[data-id]").forEach(atualizarBotaoFavorito);
  atualizarContadorFavoritos();
}

function atualizarBarraComparacao() {
  const barra = document.getElementById("barra-comparacao");
  const contador = document.getElementById("contador-comparacao");
  if (!barra || !contador) return;
  const n = getComparacao().length;
  contador.textContent = n;
  barra.classList.toggle("visivel", n >= 2);
}

function hidratarComparacao() {
  const selecionados = getComparacao();
  document.querySelectorAll(".checkbox-comparar input[data-id]").forEach((input) => {
    input.checked = selecionados.includes(Number(input.dataset.id));
  });
  atualizarBarraComparacao();
}

async function buscarProdutosPorIds(ids) {
  if (ids.length === 0) return [];
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.LUPA3D_CONFIG;
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/produtos?select=id,nome,loja,preco,preco_pix,categoria,url&id=in.(${ids.join(",")})`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  if (!resp.ok) throw new Error("Falha ao buscar produtos pra comparação");
  return resp.json();
}

async function abrirModalComparacao() {
  const modal = document.getElementById("modal-comparacao");
  const conteudo = document.getElementById("modal-comparacao-conteudo");
  if (!modal || !conteudo) return;

  conteudo.innerHTML = `<p>Carregando comparação...</p>`;
  modal.classList.add("visivel");

  const ids = getComparacao();
  let produtos;
  try {
    produtos = await buscarProdutosPorIds(ids);
  } catch (e) {
    conteudo.innerHTML = `<p>Não foi possível carregar a comparação agora.</p>`;
    return;
  }

  const linhas = [
    ["Loja", (p) => escapeHTMLJS(p.loja)],
    ["Preço", (p) => formatarPrecoJS(p.preco)],
    ["Preço Pix", (p) => (p.preco_pix ? formatarPrecoJS(p.preco_pix) : "-")],
    ["Categoria", (p) => p.categoria || "-"],
    ["", (p) => `<a href="${escapeHTMLJS(p.url)}" target="_blank" rel="noopener">Ver na loja &rarr;</a>`],
  ];

  const cabecalho = produtos.map((p) => `<th>${escapeHTMLJS(p.nome)}</th>`).join("");
  const corpo = linhas
    .map(
      ([rotulo, fn]) => `
      <tr>
        <th>${rotulo}</th>
        ${produtos.map((p) => `<td>${fn(p)}</td>`).join("")}
      </tr>`
    )
    .join("");

  conteudo.innerHTML = `
    <table class="tabela-comparacao">
      <thead><tr><th></th>${cabecalho}</tr></thead>
      <tbody>${corpo}</tbody>
    </table>
  `;
}

function fecharModalComparacao() {
  document.getElementById("modal-comparacao")?.classList.remove("visivel");
}

function ligarEventosInterativos() {
  document.addEventListener("click", (ev) => {
    const btnFav = ev.target.closest(".btn-favorito[data-id]");
    if (btnFav) {
      toggleFavorito(Number(btnFav.dataset.id));
      atualizarBotaoFavorito(btnFav);
      atualizarContadorFavoritos();
      return;
    }

    const parecidoItem = ev.target.closest(".parecido-item[data-href]");
    if (parecidoItem && !ev.target.closest(".checkbox-comparar")) {
      window.location.href = parecidoItem.dataset.href;
      return;
    }

    // Card inteiro é clicável (não só o botão "Ver detalhes") — exceto a
    // área do checkbox de comparar e o próprio link, que já navegam sozinhos.
    const card = ev.target.closest(".card[data-href]");
    if (card && !ev.target.closest(".checkbox-comparar, a")) {
      window.location.href = card.dataset.href;
      return;
    }

    if (ev.target.closest("#btn-comparar")) {
      abrirModalComparacao();
      return;
    }
    if (ev.target.closest("#btn-limpar-comparacao")) {
      limparComparacao();
      hidratarComparacao();
      return;
    }
    if (ev.target.closest("#btn-compartilhar-comparacao")) {
      const ids = getComparacao();
      const url = `${window.location.origin}/?comparar=${ids.join(",")}`;
      navigator.clipboard?.writeText(url);
      alert("Link de comparação copiado!");
      return;
    }
    if (ev.target.closest("#modal-fechar") || ev.target.id === "modal-comparacao") {
      fecharModalComparacao();
      return;
    }
  });

  document.addEventListener("change", (ev) => {
    const input = ev.target.closest(".checkbox-comparar input[data-id]");
    if (!input) return;
    const resultado = toggleComparacao(Number(input.dataset.id));
    if (resultado.cheio && !resultado.adicionado) {
      input.checked = false;
      alert("Você já selecionou o máximo de 4 produtos pra comparar.");
      return;
    }
    atualizarBarraComparacao();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") fecharModalComparacao();
  });
}

function restaurarEstadoDaURL() {
  const params = new URLSearchParams(window.location.search);

  const comparar = params.get("comparar");
  if (comparar) {
    definirComparacao(comparar.split(",").map(Number).filter((n) => !Number.isNaN(n)));
  }

  const favoritos = params.get("favoritos");
  if (favoritos) {
    adicionarFavoritos(favoritos.split(",").map(Number).filter((n) => !Number.isNaN(n)));
  }
}

// Adia a chamada até `atraso`ms sem uma nova chamada — evita refiltrar a
// cada tecla digitada na busca.
function debounce(fn, atraso) {
  let temporizador;
  return (...args) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => fn(...args), atraso);
  };
}

// Mesmo padrão do site atual: mostra só um pedaço dos resultados, com um
// botão "Ver mais!" pra ir revelando o resto — sem isso a home despeja
// centenas de cards na tela de uma vez só.
const INCREMENTO_EXIBICAO = 24;
let LIMITE_EXIBICAO = INCREMENTO_EXIBICAO;

// Filtra/ordena/limita os cards que já estão no DOM (renderizados no build)
// — sem buscar nada de novo, só mostra/esconde e reordena os nós existentes.
function aplicarFiltros(resetarLimite = true) {
  const grid = document.getElementById("grid");
  if (!grid) return;

  if (resetarLimite) LIMITE_EXIBICAO = INCREMENTO_EXIBICAO;

  const busca = normalizarBuscaJS(document.getElementById("busca")?.value || "").trim();
  const categoria = document.getElementById("filtro-categoria")?.value || "";
  const material = document.getElementById("filtro-material")?.value || "";
  const ordenar = document.getElementById("ordenar")?.value || "";

  const soPix = document.getElementById("filtro-pix")?.checked || false;
  const precoMinStr = document.getElementById("filtro-preco-min")?.value || "";
  const precoMaxStr = document.getElementById("filtro-preco-max")?.value || "";
  const precoMin = precoMinStr !== "" ? Number(precoMinStr) : null;
  const precoMax = precoMaxStr !== "" ? Number(precoMaxStr) : null;

  document.querySelectorAll(".tag-material").forEach((tag) => {
    tag.classList.toggle("ativo", tag.dataset.material === material);
  });

  const cards = [...grid.querySelectorAll(".card")];
  const combinam = [];

  for (const card of cards) {
    const precoCard = Number(card.dataset.preco);
    const okBusca = !busca || nomeCorrespondeABusca(card.dataset.nome, busca);
    const okCategoria = !categoria || card.dataset.categoria === categoria;
    const okMaterial = !material || card.dataset.material === material;
    const okPix = !soPix || card.dataset.pix === "1";
    const okPrecoMin = precoMin == null || precoCard >= precoMin;
    const okPrecoMax = precoMax == null || precoCard <= precoMax;
    if (okBusca && okCategoria && okMaterial && okPix && okPrecoMin && okPrecoMax) combinam.push(card);
    else card.classList.add("oculto-tela");
  }

  const comparadores = {
    preco_asc: (a, b) => Number(a.dataset.preco) - Number(b.dataset.preco),
    preco_desc: (a, b) => Number(b.dataset.preco) - Number(a.dataset.preco),
    cliques: (a, b) => Number(b.dataset.cliques) - Number(a.dataset.cliques),
    recentes: (a, b) => new Date(b.dataset.criado || 0) - new Date(a.dataset.criado || 0),
  };
  const comparador = comparadores[ordenar];
  if (comparador) combinam.sort(comparador);
  for (const card of combinam) grid.appendChild(card);

  combinam.forEach((card, i) => card.classList.toggle("oculto-tela", i >= LIMITE_EXIBICAO));

  document.getElementById("btn-ver-mais")?.classList.toggle("oculto-tela", combinam.length <= LIMITE_EXIBICAO);

  atualizarChipsFiltros();
}

// Mostra os filtros ativos (busca/categoria/material/Pix) como pílulas
// removíveis individualmente — "ordenar" fica de fora, não é bem um filtro.
function atualizarChipsFiltros() {
  const container = document.getElementById("filtros-ativos");
  if (!container) return;

  const busca = document.getElementById("busca");
  const categoria = document.getElementById("filtro-categoria");
  const material = document.getElementById("filtro-material");
  const pix = document.getElementById("filtro-pix");
  const precoMin = document.getElementById("filtro-preco-min");
  const precoMax = document.getElementById("filtro-preco-max");

  const ativos = [];
  if (busca?.value.trim()) ativos.push({ campo: "busca", texto: `"${busca.value.trim()}"` });
  if (categoria?.value) ativos.push({ campo: "filtro-categoria", texto: categoria.value });
  if (material?.value) ativos.push({ campo: "filtro-material", texto: material.value });
  if (pix?.checked) ativos.push({ campo: "filtro-pix", texto: "Desconto no Pix" });
  if (precoMin?.value) ativos.push({ campo: "filtro-preco-min", texto: `Mín. R$ ${precoMin.value}` });
  if (precoMax?.value) ativos.push({ campo: "filtro-preco-max", texto: `Máx. R$ ${precoMax.value}` });

  if (ativos.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML =
    ativos
      .map(
        (f) => `
      <span class="filtro-chip" data-campo="${f.campo}">
        ${escapeHTMLJS(f.texto)}
        <button type="button" aria-label="Remover filtro">✕</button>
      </span>
    `
      )
      .join("") + `<button type="button" class="filtro-limpar-todos">Limpar todos</button>`;
}

function limparCampoFiltro(campo) {
  const el = document.getElementById(campo);
  if (!el) return;
  if (campo === "filtro-pix") el.checked = false;
  else el.value = "";
}

function ligarFiltros() {
  const busca = document.getElementById("busca");
  if (busca) busca.addEventListener("input", debounce(() => aplicarFiltros(true), 250));

  for (const id of ["filtro-categoria", "filtro-material", "ordenar"]) {
    document.getElementById(id)?.addEventListener("change", () => aplicarFiltros(true));
  }
  document.getElementById("filtro-pix")?.addEventListener("change", () => aplicarFiltros(true));

  for (const id of ["filtro-preco-min", "filtro-preco-max"]) {
    document.getElementById(id)?.addEventListener("input", debounce(() => aplicarFiltros(true), 250));
  }

  // "Mais filtros" só existe na home — material/ordenar/Pix ficam escondidos
  // até o usuário pedir.
  const btnMaisFiltros = document.getElementById("btn-mais-filtros");
  const controlesAvancados = document.getElementById("controles-avancados");
  btnMaisFiltros?.addEventListener("click", () => {
    const aberto = controlesAvancados.classList.toggle("oculto-tela") === false;
    btnMaisFiltros.setAttribute("aria-expanded", String(aberto));
    btnMaisFiltros.textContent = aberto ? "🔍 Menos filtros" : "🔍 Mais filtros";
  });

  // Tags de material (categoria/[categoria].astro) — reaproveita o mesmo
  // <select> e aplicarFiltros() do filtro de material normal.
  document.querySelector(".tags-material")?.addEventListener("click", (ev) => {
    const tag = ev.target.closest(".tag-material");
    if (!tag) return;
    const select = document.getElementById("filtro-material");
    if (!select) return;
    select.value = select.value === tag.dataset.material ? "" : tag.dataset.material;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });

  document.getElementById("btn-ver-mais")?.addEventListener("click", () => {
    LIMITE_EXIBICAO += INCREMENTO_EXIBICAO;
    aplicarFiltros(false);
  });

  document.getElementById("filtros-ativos")?.addEventListener("click", (ev) => {
    if (ev.target.closest(".filtro-limpar-todos")) {
      for (const campo of ["busca", "filtro-categoria", "filtro-material", "filtro-pix", "filtro-preco-min", "filtro-preco-max"]) {
        limparCampoFiltro(campo);
      }
      aplicarFiltros(true);
      return;
    }
    const chip = ev.target.closest(".filtro-chip");
    if (chip && ev.target.closest("button")) {
      limparCampoFiltro(chip.dataset.campo);
      aplicarFiltros(true);
    }
  });
}

// Sugestões de busca em tempo real — reaproveita os produtos que já estão
// na página (build-time), sem buscar nada novo. Cobre a home inteira, a
// loja (só produtos dela) ou favoritos, dependendo de onde a busca está.
function buscarSugestoes(termo) {
  const vistos = new Set();
  const resultados = [];
  for (const card of document.querySelectorAll(".card[data-nome]")) {
    if (vistos.has(card.dataset.id)) continue;
    if (!nomeCorrespondeABusca(card.dataset.nome, termo)) continue;
    vistos.add(card.dataset.id);
    resultados.push({
      href: card.dataset.href,
      nome: card.querySelector(".card-nome")?.textContent || "",
      preco: card.querySelector(".card-preco")?.textContent || "",
      loja: (card.querySelector(".card-vendido-por")?.textContent || "").replace(/^Vendido por\s*/, ""),
      imagem: card.querySelector(".card-imagem img")?.src || "",
    });
  }
  return resultados;
}

function renderizarSugestoes(lista) {
  const box = document.getElementById("busca-sugestoes");
  if (!box) return;
  if (lista.length === 0) {
    box.classList.add("oculto-tela");
    box.innerHTML = "";
    return;
  }
  box.innerHTML = lista
    .map(
      (p) => `
      <a href="${escapeHTMLJS(p.href)}" class="busca-sugestao">
        ${p.imagem
          ? `<img src="${escapeHTMLJS(p.imagem)}" class="busca-sugestao-imagem" alt="" loading="lazy">`
          : `<span class="busca-sugestao-imagem"></span>`}
        <span class="busca-sugestao-texto">
          <span class="busca-sugestao-nome">${escapeHTMLJS(p.nome)}</span><br>
          <span class="busca-sugestao-detalhe">${escapeHTMLJS(p.loja)}</span>
        </span>
        <span class="busca-sugestao-preco">${escapeHTMLJS(p.preco)}</span>
      </a>
    `
    )
    .join("");
  box.classList.remove("oculto-tela");
}

function ligarSugestoesBusca() {
  const input = document.getElementById("busca");
  const box = document.getElementById("busca-sugestoes");
  if (!input || !box) return;

  input.addEventListener(
    "input",
    debounce(() => {
      const termo = normalizarBuscaJS(input.value).trim();
      renderizarSugestoes(termo ? buscarSugestoes(termo) : []);
    }, 200)
  );

  input.addEventListener("focus", () => {
    const termo = normalizarBuscaJS(input.value).trim();
    if (termo) renderizarSugestoes(buscarSugestoes(termo));
  });

  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".busca-grande")) box.classList.add("oculto-tela");
  });

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") box.classList.add("oculto-tela");
  });
}

// Banner de aviso e modo manutenção precisam ser conferidos ao vivo (não no
// build) — sem isso, ligar o modo manutenção no admin só valeria a partir do
// próximo rebuild, não imediatamente, que é o objetivo desse tipo de aviso.
async function verificarConfigSite() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.LUPA3D_CONFIG;
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/configuracoes?select=chave,valor&chave=in.(aviso_banner,manutencao)`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    const linhas = await resp.json();
    const config = {};
    for (const { chave, valor } of linhas) config[chave] = valor;

    const banner = document.getElementById("banner-aviso");
    if (banner && config.aviso_banner) {
      banner.textContent = config.aviso_banner;
      banner.classList.remove("oculto-tela");
    }

    if (config.manutencao === "true") {
      const grid = document.getElementById("grid");
      if (grid) {
        const aviso = document.createElement("p");
        aviso.textContent = "Estamos atualizando o site — volte em breve.";
        aviso.style.textAlign = "center";
        aviso.style.padding = "3rem 1rem";
        grid.replaceWith(aviso);
      }
      document.querySelectorAll(".secao-home, .titulo-secao-grid-linha, .categorias-nav").forEach((el) => el.remove());
    }
  } catch {
    // sem config, segue normal
  }
}

restaurarEstadoDaURL();
hidratarFavoritos();
hidratarComparacao();
ligarEventosInterativos();
ligarFiltros();
ligarSugestoesBusca();
aplicarFiltros(true);
verificarConfigSite();
