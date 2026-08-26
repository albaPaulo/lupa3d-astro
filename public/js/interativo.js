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

// Sinônimos de material (mesma resina/filamento, nome diferente por loja) —
// mesmos grupos usados pra normalizar a tag manual no admin e detectar
// material no scraper. Grupo pode ter frase de mais de uma palavra ("uso
// geral", "abs like", "rubber like"), por isso a normalização troca a frase
// inteira ANTES de separar por palavra — checar palavra por palavra não
// funcionaria pra sinônimo de duas palavras. Primeiro item de cada grupo é a
// forma canônica; o resto é variante. Já em minúsculo/sem acento (mesmo
// tratamento de normalizarBuscaJS).
const GRUPOS_SINONIMOS_BUSCA = [
  ["resina", "resina 3d"],
  ["abs-like", "abs like", "iron", "resistente", "resistencia", "rigida"],
  ["standard", "padrao", "basic", "basica", "general", "geral", "uso geral"],
  ["cristal", "translucida", "transparente", "clear", "incolor"],
  ["high speed", "alta velocidade", "rapida"],
  ["flexivel", "flex", "rubber like", "rubber"],
  ["lavavel", "lavavel a agua", "lavavel em agua", "poseidon", "wash water", "wash", "water"],
];

// Frases mais longas primeiro na alternância do regex: sem isso "rubber"
// (mais curto) venceria a alternativa "rubber like" na mesma posição.
// Um regex de UM PASSE SÓ (em vez de trocar variante por variante em loop,
// string após string) evita autocorrupção — trocar "rubber like" por
// "flexivel" e DEPOIS trocar "flex" por "flexivel" de novo faria o already-
// canonicalizado "flexivel" virar "flexivelivel", porque "flex" é prefixo
// dele. \b (borda de palavra) também evita que "flex" case dentro da
// palavra "flexivel" quando ela já aparece assim no texto original.
function escapeRegExpJS(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const _SUBSTITUICOES_SINONIMOS = GRUPOS_SINONIMOS_BUSCA.flatMap((grupo) =>
  grupo.slice(1).map((variante) => [variante, grupo[0]])
).sort((a, b) => b[0].length - a[0].length);

const _MAPA_SINONIMOS = new Map(_SUBSTITUICOES_SINONIMOS);
const _REGEX_SINONIMOS = new RegExp(
  "\\b(?:" + _SUBSTITUICOES_SINONIMOS.map(([variante]) => escapeRegExpJS(variante)).join("|") + ")\\b",
  "g"
);

function canonicalizarSinonimos(texto) {
  return texto.replace(_REGEX_SINONIMOS, (match) => _MAPA_SINONIMOS.get(match) || match);
}

// Busca por palavra, não por frase inteira — "resina stand" precisa achar
// "Resina Premium Standard" e "Resina 3D Standard 4.0", que têm outras
// palavras no meio e não bateriam com um simples .includes(frase completa).
function nomeCorrespondeABusca(nomeLowerCase, termoLowerCase) {
  const nome = canonicalizarSinonimos(nomeLowerCase);
  const termo = canonicalizarSinonimos(termoLowerCase);
  return termo
    .split(/\s+/)
    .filter(Boolean)
    .every((palavra) => nome.includes(palavra));
}

// Texto completo pesquisável de um card — nome, loja, categoria e material,
// não só o nome. Sem isso, buscar "resistente" (sinônimo de ABS-Like) só
// achava produto que tivesse essa palavra no NOME, e não todo produto cujo
// material já detectado é ABS-Like.
function haystackDoCard(card) {
  return [
    card.dataset.nome,
    normalizarBuscaJS(card.dataset.loja || ""),
    card.dataset.categoria || "",
    normalizarBuscaJS(card.dataset.material || ""),
  ].join(" ");
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

function atualizarBotaoComparar(btn) {
  const id = Number(btn.dataset.id);
  const ativo = isNaComparacao(id);
  btn.classList.toggle("ativo", ativo);
  btn.setAttribute("aria-pressed", String(ativo));
  btn.textContent = ativo ? "✓" : "⇄";
  const rotulo = ativo ? "Remover da comparação" : "Comparar";
  btn.title = rotulo;
  btn.setAttribute("aria-label", rotulo);
}

function hidratarComparacao() {
  document.querySelectorAll(".btn-comparar-toggle[data-id]").forEach(atualizarBotaoComparar);
  atualizarBarraComparacao();
}

async function buscarProdutosPorIds(ids) {
  if (ids.length === 0) return [];
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.LUPA3D_CONFIG;
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/produtos?select=id,nome,loja,preco,preco_pix,categoria,url,imagem_url&id=in.(${ids.join(",")})`,
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

  const cabecalho = produtos
    .map(
      (p) => `
      <th>
        <div class="comparacao-cabecalho">
          ${
            p.imagem_url
              ? `<img src="${escapeHTMLJS(p.imagem_url)}" alt="${escapeHTMLJS(p.nome)}" class="comparacao-imagem" loading="lazy" referrerpolicy="no-referrer">`
              : ""
          }
          <span>${escapeHTMLJS(p.nome)}</span>
        </div>
      </th>`
    )
    .join("");
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

    const btnComparar = ev.target.closest(".btn-comparar-toggle[data-id]");
    if (btnComparar) {
      const resultado = toggleComparacao(Number(btnComparar.dataset.id));
      if (resultado.cheio && !resultado.adicionado) {
        alert("Você já selecionou o máximo de 4 produtos pra comparar.");
        return;
      }
      atualizarBotaoComparar(btnComparar);
      atualizarBarraComparacao();
      return;
    }

    const parecidoItem = ev.target.closest(".parecido-item[data-href]");
    if (parecidoItem && !ev.target.closest(".btn-comparar-toggle")) {
      window.location.href = parecidoItem.dataset.href;
      return;
    }

    // Card inteiro é clicável (não só o botão "Ver detalhes") — exceto o
    // botão de comparar e o próprio link, que já navegam/agem sozinhos.
    const card = ev.target.closest(".card[data-href]");
    if (card && !ev.target.closest(".btn-comparar-toggle, a")) {
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

  // Preenche a busca a partir da URL (?busca=...) — usado quando a home
  // (sem grade própria pra filtrar) redireciona a pesquisa pra uma página
  // de categoria, que já busca em cima do catálogo dela.
  const busca = params.get("busca");
  if (busca) {
    const inputBusca = document.getElementById("busca");
    if (inputBusca) inputBusca.value = busca;
  }
}

// Páginas sem grade própria (hoje só a home) não têm o que filtrar no
// lugar — a busca aí redireciona pra uma página de categoria já com o
// termo preenchido (?busca=...), que faz a busca de verdade.
function ligarBuscaComRedirecionamento() {
  const input = document.getElementById("busca");
  const destino = input?.dataset.buscaDestino;
  if (!input || !destino) return;

  const categoriasDisponiveis = (input.dataset.categorias || "").split(",").filter(Boolean);

  // Se o termo digitado já menciona uma categoria pelo nome ("resina
  // padrao"), manda pra ela em vez de sempre cair na categoria padrão (a
  // primeira em ordem alfabética) — sem isso, buscar algo de resina na home
  // podia jogar a pessoa em /categoria/filamento/ só por "filamento" vir
  // antes na lista.
  function destinoParaTermo(termo) {
    const normalizado = normalizarBuscaJS(termo);
    const categoriaMencionada = categoriasDisponiveis.find((c) => new RegExp(`\\b${c}\\b`).test(normalizado));
    return categoriaMencionada ? `/categoria/${categoriaMencionada}/` : destino;
  }

  const irParaDestino = () => {
    const termo = input.value.trim();
    window.location.href = termo ? `${destinoParaTermo(termo)}?busca=${encodeURIComponent(termo)}` : destino;
  };

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") irParaDestino();
  });
  document.querySelector(".busca-icone")?.addEventListener("click", irParaDestino);
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

// Resumo das propriedades físicas de cada material — mostrado na caixa
// entre as tags e o botão "Mais filtros" quando o usuário seleciona uma tag.
const DESCRICAO_MATERIAL = {
  "PLA": "Biodegradável e fácil de imprimir, mas menos resistente a calor e impacto — ótimo para peças decorativas e protótipos.",
  "ABS": "Resistente a impacto e calor, mas encolhe ao esfriar e solta odor durante a impressão — recomendado em ambiente ventilado.",
  "PETG": "Bom equilíbrio entre resistência e facilidade de impressão, resiste bem à umidade — menos rígido que o ABS.",
  "TPU": "Flexível e elástico, com alta resistência à abrasão — usado em peças que precisam dobrar ou amortecer impacto.",
  "ASA": "Parecido com o ABS, mas com alta resistência a raios UV e intempéries — indicado para peças de uso externo.",
  "Nylon": "Muito resistente a desgaste e impacto, com boa flexibilidade — absorve umidade do ar, exige armazenamento seco.",
  "Tritan": "Resistente a impacto e com boa transparência, atóxico — usado em peças que exigem durabilidade e segurança alimentar.",
  "Standard": "Resina de uso geral, boa definição de detalhes — mais rígida e menos resistente a impacto que as resinas especiais.",
  "Dental": "Biocompatível, formulada para moldes, guias e modelos odontológicos — atende normas específicas da área.",
  "Lavável à Água": "Dispensa álcool isopropílico na limpeza pós-impressão — lava direto com água, facilitando o pós-processamento.",
  "Flexível": "Elástica e resistente a dobras — ideal para peças que precisam ceder sem quebrar.",
  "Semi-flexível": "Meio-termo entre resina rígida e flexível — cede um pouco sob pressão sem perder tanto detalhe.",
  "ABS-Like": "Simula a resistência mecânica do ABS — peças mais duráveis a impacto do que a resina padrão.",
  "Alta Temperatura": "Suporta temperaturas mais altas sem deformar — usada em moldes e peças funcionais expostas a calor.",
  "Elástica": "Alta elasticidade e resiliência, volta à forma original após deformar — parecida com borracha.",
  "High Speed": "Formulada pra curar mais rápido sob luz UV, reduzindo o tempo de impressão camada a camada.",
  "Cristal": "Translúcida/transparente — usada quando o efeito visual de transparência importa na peça final.",
  "Fluorescente": "Brilha sob luz UV/negra — usada mais pelo efeito visual do que pela resistência mecânica.",
  "Calcinável": "Queima sem deixar resíduos — feita para fundição de metais, comum em joalheria e odontologia.",
  "Termocrômica": "Muda de cor conforme a temperatura — efeito decorativo/sensorial.",
  "Condutiva": "Conduz eletricidade — usada em aplicações que exigem contato elétrico na peça impressa.",
};

// Mostra/esconde a caixa de descrição conforme o material selecionado no
// momento (via tag ou via <select>) — chamado sempre que os filtros mudam,
// pra ficar em sincronia mesmo quando o material é limpo por outro caminho
// (chip removido, "Limpar todos", categoria que invalida o material).
function atualizarDescricaoMaterial() {
  const caixa = document.getElementById("descricao-material");
  if (!caixa) return;

  const material = document.getElementById("filtro-material")?.value || "";
  const descricao = DESCRICAO_MATERIAL[material];

  if (!material || !descricao) {
    caixa.classList.add("oculto-tela");
    caixa.innerHTML = "";
    return;
  }

  caixa.innerHTML = `<strong>${escapeHTMLJS(material)}</strong> — ${escapeHTMLJS(descricao)}`;
  caixa.classList.remove("oculto-tela");
}

const LIMIAR_CARREGAMENTO_LENTO = 150;
let carregandoGrid = false;

function mostrarIndicadorGrid() {
  const grid = document.getElementById("grid");
  if (!grid || carregandoGrid) return;
  carregandoGrid = true;
  if (!document.querySelector(".grid-carregando-aviso")) {
    const aviso = document.createElement("div");
    aviso.className = "grid-carregando-aviso";
    aviso.innerHTML = `<span class="spinner-circular" aria-hidden="true"></span> Carregando produtos...`;
    grid.parentElement.insertBefore(aviso, grid);
  }
}

function esconderIndicadorGrid() {
  document.querySelector(".grid-carregando-aviso")?.remove();
  carregandoGrid = false;
}

// Trocar categoria/material/ordenação/busca chama aplicarFiltros, que
// percorre e reordena todos os cards da categoria de forma síncrona — em
// grades grandes (até ~800 cards em "Filamento") isso trava a tela por um
// instante. Só mostra o aviso quando a grade é grande o bastante pra isso
// ser perceptível — numa grade pequena o trabalho termina rápido demais
// pro aviso nem chegar a aparecer, e mostrar mesmo assim só piscaria a
// tela à toa. O setTimeout garante que o navegador pinta o aviso antes de
// travar a thread principal com o trabalho pesado.
function rodarComIndicadorSeGrande(fn) {
  if (carregandoGrid) return;
  const grid = document.getElementById("grid");
  const totalCards = grid ? grid.querySelectorAll(".card").length : 0;

  if (totalCards < LIMIAR_CARREGAMENTO_LENTO) {
    fn();
    return;
  }

  mostrarIndicadorGrid();
  setTimeout(() => {
    fn();
    esconderIndicadorGrid();
  }, 20);
}

// Filtra/ordena/limita os cards que já estão no DOM (renderizados no build)
// — sem buscar nada de novo, só mostra/esconde e reordena os nós existentes.
function aplicarFiltros(resetarLimite = true) {
  const grid = document.getElementById("grid");
  if (!grid) return;

  if (resetarLimite) LIMITE_EXIBICAO = INCREMENTO_EXIBICAO;

  const busca = normalizarBuscaJS(document.getElementById("busca")?.value || "").trim();
  const categoria = document.getElementById("filtro-categoria")?.value || "";
  const selectMaterial = document.getElementById("filtro-material");
  let material = selectMaterial?.value || "";
  const ordenar = document.getElementById("ordenar")?.value || "";

  const soPix = document.getElementById("filtro-pix")?.checked || false;
  const estado = document.getElementById("filtro-estado")?.value || "";
  const precoMaxStr = document.getElementById("filtro-preco-max")?.value || "";
  const precoMax = precoMaxStr !== "" ? Number(precoMaxStr) : null;

  // Cada tag de material sabe (via data-categorias) em quais categorias ela
  // aparece de verdade — só relevante quando a página tem os dois filtros
  // juntos (loja/[nome].astro); nas páginas de categoria/home a tag não tem
  // esse atributo (ou não tem #filtro-categoria pra mudar), então nada muda.
  // Se o material escolhido deixa de existir na categoria selecionada, limpa
  // o filtro de material — senão a grade trava em "0 resultados" sem
  // explicação nenhuma pra quem está vendo.
  let materialAindaValido = !material;
  document.querySelectorAll(".tag-material").forEach((tag) => {
    const categoriasTag = (tag.dataset.categorias || "").split(",").filter(Boolean);
    const relevante = !categoria || categoriasTag.length === 0 || categoriasTag.includes(categoria);
    tag.classList.toggle("oculto-tela", !relevante);
    if (tag.dataset.material === material && relevante) materialAindaValido = true;
  });
  if (!materialAindaValido) {
    material = "";
    if (selectMaterial) selectMaterial.value = "";
  }

  document.querySelectorAll(".tag-material").forEach((tag) => {
    tag.classList.toggle("ativo", tag.dataset.material === material);
  });

  // Atalhos de categoria como filtro (loja/[nome].astro) — só os que têm
  // data-categoria, pra não mexer nos <a> de verdade (home/categoria, que
  // navegam pra /categoria/X/ em vez de filtrar no lugar).
  document.querySelectorAll(".atalho-categoria[data-categoria]").forEach((btn) => {
    btn.classList.toggle("ativo", btn.dataset.categoria === categoria);
  });

  const cards = [...grid.querySelectorAll(".card")];
  const combinam = [];

  for (const card of cards) {
    const precoCard = Number(card.dataset.preco);
    const okBusca = !busca || nomeCorrespondeABusca(haystackDoCard(card), busca);
    const okCategoria = !categoria || card.dataset.categoria === categoria;
    const okMaterial = !material || card.dataset.material === material;
    const okPix = !soPix || card.dataset.pix === "1";
    // Cruza a loja do card com o mapa loja->estado(s) injetado pela página
    // (window.LUPA3D_LOJA_ESTADO) — loja com mais de uma unidade aparece em
    // qualquer estado dela. Sem dado de estado pra essa loja, o card só some
    // quando um estado específico está selecionado (não afeta "Todos").
    const ufsLoja = window.LUPA3D_LOJA_ESTADO?.[card.dataset.loja] || [];
    const okEstado = !estado || ufsLoja.includes(estado);
    const okPrecoMax = precoMax == null || precoCard <= precoMax;
    if (okBusca && okCategoria && okMaterial && okPix && okEstado && okPrecoMax) combinam.push(card);
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
  atualizarDescricaoMaterial();
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
  const estado = document.getElementById("filtro-estado");
  const precoMax = document.getElementById("filtro-preco-max");

  const ativos = [];
  if (busca?.value.trim()) ativos.push({ campo: "busca", texto: `"${busca.value.trim()}"` });
  if (categoria?.value) ativos.push({ campo: "filtro-categoria", texto: categoria.value });
  if (material?.value) ativos.push({ campo: "filtro-material", texto: material.value });
  if (pix?.checked) ativos.push({ campo: "filtro-pix", texto: "Desconto no Pix" });
  if (estado?.value) ativos.push({ campo: "filtro-estado", texto: `📍 ${estado.value}` });
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
  if (busca) busca.addEventListener("input", debounce(() => rodarComIndicadorSeGrande(() => aplicarFiltros(true)), 250));

  for (const id of ["filtro-categoria", "filtro-material", "ordenar", "filtro-estado"]) {
    document.getElementById(id)?.addEventListener("change", () => rodarComIndicadorSeGrande(() => aplicarFiltros(true)));
  }
  document.getElementById("filtro-pix")?.addEventListener("change", () => rodarComIndicadorSeGrande(() => aplicarFiltros(true)));

  document.getElementById("filtro-preco-max")?.addEventListener("input", debounce(() => rodarComIndicadorSeGrande(() => aplicarFiltros(true)), 250));

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

  // Atalhos de categoria como filtro (loja/[nome].astro) — <button>, não
  // <a>, então não interfere com os de home/categoria (que são link de
  // navegação de verdade e devem seguir o href normalmente).
  document.querySelector(".atalhos-categoria")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button.atalho-categoria");
    if (!btn) return;
    const select = document.getElementById("filtro-categoria");
    if (!select) return;
    select.value = select.value === btn.dataset.categoria ? "" : btn.dataset.categoria;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });

  document.getElementById("btn-ver-mais")?.addEventListener("click", () => {
    rodarComIndicadorSeGrande(() => {
      LIMITE_EXIBICAO += INCREMENTO_EXIBICAO;
      aplicarFiltros(false);
    });
  });

  document.getElementById("filtros-ativos")?.addEventListener("click", (ev) => {
    if (ev.target.closest(".filtro-limpar-todos")) {
      for (const campo of ["busca", "filtro-categoria", "filtro-material", "filtro-pix", "filtro-estado", "filtro-preco-max"]) {
        limparCampoFiltro(campo);
      }
      rodarComIndicadorSeGrande(() => aplicarFiltros(true));
      return;
    }
    const chip = ev.target.closest(".filtro-chip");
    if (chip && ev.target.closest("button")) {
      limparCampoFiltro(chip.dataset.campo);
      rodarComIndicadorSeGrande(() => aplicarFiltros(true));
    }
  });
}

// Sugestões de busca em tempo real — reaproveita os produtos que já estão
// na página (build-time), sem buscar nada novo. Cobre a loja (só produtos
// dela), categoria, ofertas e favoritos, dependendo de onde a busca está.
// Casa com nome, loja OU categoria — "resina" ou o nome de uma loja também
// sugerem produto, não só o nome do produto em si.
function buscarSugestoes(termo, limite = 8) {
  const vistos = new Set();
  const resultados = [];
  for (const card of document.querySelectorAll(".card[data-nome]")) {
    if (resultados.length >= limite) break;
    if (vistos.has(card.dataset.id)) continue;
    if (!nomeCorrespondeABusca(haystackDoCard(card), termo)) continue;
    vistos.add(card.dataset.id);
    resultados.push({
      href: card.dataset.href,
      nome: card.querySelector(".card-nome")?.textContent || "",
      preco: card.querySelector(".card-preco")?.textContent || "",
      loja: card.dataset.loja || "",
      imagem: card.querySelector(".card-imagem img")?.src || "",
    });
  }
  return resultados;
}

// A home não tem mais grade completa no HTML (só as seções fixas, uns 15-20
// produtos) — busca local não acha o catálogo inteiro lá. Pra manter a
// sugestão funcionando com todo o catálogo mesmo assim, busca direto na
// Supabase (mesma anon key pública já usada pra comparação/config), casando
// nome, loja OU material (efetivo/manual) com cada palavra digitada. O termo
// passa pelos mesmos sinônimos de material da busca local antes de virar
// filtro, pra "resistente" também achar produto marcado como ABS-Like mesmo
// sem essa palavra no nome.
// A palavra já chega sem acento (normalizarBuscaJS já rodou antes), mas o
// nome guardado no banco tem acento de verdade ("Prático", "Água") — ilike
// sozinho não ignora acento, só maiúscula/minúscula. Troca cada vogal/"c" da
// palavra por uma classe de regex com todas as variações acentuadas, e busca
// via imatch (~* — regex case-insensitive) em vez de ilike simples.
const _CLASSES_ACENTO = { a: "aàáâãä", e: "eèéêë", i: "iìíîï", o: "oòóôõö", u: "uùúûü", c: "cç" };

function escapeRegexPostgres(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function paraPadraoSemAcento(palavra) {
  return escapeRegexPostgres(palavra).replace(/[aeiouc]/g, (c) => `[${_CLASSES_ACENTO[c]}]`);
}

async function buscarSugestoesRemoto(termo, limite = 8) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.LUPA3D_CONFIG;
  const palavras = canonicalizarSinonimos(termo)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((p) => p.replace(/[%,()]/g, ""));
  if (palavras.length === 0) return [];

  const filtroCampo = (campo) => palavras.map((p) => `${campo}.imatch.${encodeURIComponent(paraPadraoSemAcento(p))}`).join(",");
  const url =
    `${SUPABASE_URL}/rest/v1/produtos?select=id,nome,preco,loja,imagem_url` +
    // Sem isso, produto sem estoque ou escondido pelo admin (oculto=true)
    // aparecia normalmente aqui — essa consulta é direta no banco, não passa
    // pelo fetchProdutos() do build que já faz esse filtro pro resto do site.
    `&disponivel=eq.true&oculto=eq.false` +
    `&or=(and(${filtroCampo("nome")}),and(${filtroCampo("loja")}),and(${filtroCampo("material_manual")}),and(${filtroCampo("material")}))` +
    `&order=cliques_total.desc.nullslast&limit=${limite}`;

  try {
    const resp = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
    if (!resp.ok) return [];
    const linhas = await resp.json();
    return linhas.map((p) => ({
      href: `/produto/${p.id}/`,
      nome: p.nome,
      preco: formatarPrecoJS(p.preco),
      loja: p.loja,
      imagem: p.imagem_url ? `/.netlify/images?url=${encodeURIComponent(p.imagem_url)}&w=80&q=75` : "",
    }));
  } catch {
    return [];
  }
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

  const temGradeLocal = !!document.getElementById("grid");
  // Descarta resposta de uma busca remota que já não é mais a mais recente
  // (usuário continuou digitando enquanto o fetch anterior ainda voltava).
  let ultimaConsulta = 0;

  async function buscarEExibir(termo) {
    if (!termo) {
      renderizarSugestoes([]);
      return;
    }
    if (temGradeLocal) {
      renderizarSugestoes(buscarSugestoes(termo));
      return;
    }
    const consultaAtual = ++ultimaConsulta;
    const resultados = await buscarSugestoesRemoto(termo);
    if (consultaAtual === ultimaConsulta) renderizarSugestoes(resultados);
  }

  input.addEventListener(
    "input",
    debounce(() => buscarEExibir(normalizarBuscaJS(input.value).trim()), 200)
  );

  input.addEventListener("focus", () => {
    const termo = normalizarBuscaJS(input.value).trim();
    if (termo) buscarEExibir(termo);
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

// Claro/escuro/automático, nessa ordem de ciclo — o valor já foi aplicado
// mais cedo (script inline em GlobalStyles.astro, antes do CSS pintar) pra
// não ter flash; aqui só cria o botão e liga o clique.
const CHAVE_TEMA = "lupa3d_tema";

function temaSalvo() {
  try {
    return localStorage.getItem(CHAVE_TEMA);
  } catch {
    return null;
  }
}

function aplicarTema(tema) {
  try {
    if (tema) {
      document.documentElement.dataset.tema = tema;
      localStorage.setItem(CHAVE_TEMA, tema);
    } else {
      delete document.documentElement.dataset.tema;
      localStorage.removeItem(CHAVE_TEMA);
    }
  } catch {}
}

function proximoTema(atual) {
  if (atual === "claro") return "escuro";
  if (atual === "escuro") return null;
  return "claro";
}

function atualizarBotaoTema(btn) {
  const tema = temaSalvo();
  const rotulo = tema === "claro" ? "Tema: claro" : tema === "escuro" ? "Tema: escuro" : "Tema: automático";
  btn.textContent = tema === "claro" ? "☀️" : tema === "escuro" ? "🌙" : "🌓";
  btn.title = `${rotulo} — clique para trocar`;
  btn.setAttribute("aria-label", btn.title);
}

function ligarBotaoTema() {
  const container = document.querySelector(".topo-linha nav.abas") || document.querySelector(".topo-linha");
  if (!container || document.querySelector(".btn-tema")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-tema";
  atualizarBotaoTema(btn);
  btn.addEventListener("click", () => {
    aplicarTema(proximoTema(temaSalvo()));
    atualizarBotaoTema(btn);
  });
  container.appendChild(btn);
}

// Menu hambúrguer mobile — injetado do mesmo jeito que o botão de tema
// (sem precisar editar as ~10 páginas que têm cabeçalho), alterna a classe
// "aberto" no próprio nav.abas; o CSS (@media max-width:700px) decide como
// isso aparece.
function ligarMenuMobile() {
  const nav = document.querySelector(".topo-linha nav.abas");
  const linha = document.querySelector(".topo-linha");
  if (!nav || !linha || document.querySelector(".btn-menu-mobile")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-menu-mobile";
  btn.setAttribute("aria-label", "Abrir menu");
  btn.setAttribute("aria-expanded", "false");
  btn.textContent = "☰";
  btn.addEventListener("click", () => {
    const aberto = nav.classList.toggle("aberto");
    btn.textContent = aberto ? "✕" : "☰";
    btn.setAttribute("aria-label", aberto ? "Fechar menu" : "Abrir menu");
    btn.setAttribute("aria-expanded", String(aberto));
  });
  linha.appendChild(btn);

  // Evita ficar com o painel "aberto" grudado se a pessoa girar o celular
  // ou redimensionar a janela pra além do ponto de quebra do hambúrguer.
  window.addEventListener("resize", () => {
    if (window.innerWidth > 700 && nav.classList.contains("aberto")) {
      nav.classList.remove("aberto");
      btn.textContent = "☰";
      btn.setAttribute("aria-label", "Abrir menu");
      btn.setAttribute("aria-expanded", "false");
    }
  });
}

// Botão flutuante "voltar ao topo" — existia no site antigo (frontend/js/
// shared.js) mas não tinha sido portado pra essa versão em Astro. Injetado
// via JS (não precisa de marcação em cada página), só aparece depois de
// rolar 400px.
function ligarBotaoTopo() {
  if (document.querySelector(".btn-topo")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-topo oculto-tela";
  btn.title = "Voltar ao topo";
  btn.setAttribute("aria-label", "Voltar ao topo");
  btn.textContent = "↑";
  document.body.appendChild(btn);

  window.addEventListener("scroll", () => {
    btn.classList.toggle("oculto-tela", window.scrollY < 400);
  });
  btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}

// Só existe na página de produto — permite pedir pra ver um aviso quando o
// preço chegar num valor específico (usa o mesmo mecanismo de favoritos:
// definirAlvo já favorita o produto, e é /favoritos/ que checa o alvo toda
// vez que o usuário volta lá, sem precisar de e-mail nem backend novo).
function ligarPrecoAlvo() {
  const bloco = document.querySelector(".produto-preco-alvo");
  if (!bloco) return;

  const id = Number(bloco.dataset.id);
  const btnToggle = bloco.querySelector(".btn-preco-alvo-toggle");
  const form = bloco.querySelector(".produto-preco-alvo-form");
  const input = bloco.querySelector(".input-preco-alvo");
  const btnSalvar = bloco.querySelector(".btn-preco-alvo-salvar");
  const caixaAtiva = bloco.querySelector(".produto-preco-alvo-ativo");
  const texto = bloco.querySelector(".produto-preco-alvo-texto");
  const btnRemover = bloco.querySelector(".btn-preco-alvo-remover");

  function renderizar() {
    const alvo = getAlvo(id);
    const temAlvo = alvo != null;
    btnToggle.classList.toggle("oculto-tela", temAlvo);
    form.classList.add("oculto-tela");
    caixaAtiva.classList.toggle("oculto-tela", !temAlvo);
    if (temAlvo) texto.textContent = `🎯 Avisar em ${formatarPrecoJS(alvo)}`;
  }

  btnToggle.addEventListener("click", () => {
    btnToggle.classList.add("oculto-tela");
    form.classList.remove("oculto-tela");
    input.focus();
  });

  function salvar() {
    const valor = parseFloat(input.value.replace(",", "."));
    if (!valor || valor <= 0) return;
    definirAlvo(id, valor);
    renderizar();
  }

  btnSalvar.addEventListener("click", salvar);
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") salvar();
  });

  btnRemover.addEventListener("click", () => {
    removerAlvo(id);
    renderizar();
  });

  renderizar();
}

restaurarEstadoDaURL();
hidratarFavoritos();
hidratarComparacao();
ligarEventosInterativos();
ligarFiltros();
ligarSugestoesBusca();
ligarBuscaComRedirecionamento();
ligarBotaoTema();
ligarMenuMobile();
ligarBotaoTopo();
ligarPrecoAlvo();
aplicarFiltros(true);
verificarConfigSite();
