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

// Filtra/ordena os cards que já estão no DOM (renderizados no build) — sem
// buscar nada de novo, só mostra/esconde e reordena os nós existentes.
function aplicarFiltros() {
  const grid = document.getElementById("grid");
  if (!grid) return;

  const busca = (document.getElementById("busca")?.value || "").toLowerCase().trim();
  const categoria = document.getElementById("filtro-categoria")?.value || "";
  const material = document.getElementById("filtro-material")?.value || "";
  const ordenar = document.getElementById("ordenar")?.value || "";
  const soPix = document.getElementById("filtro-pix")?.checked || false;

  const cards = [...grid.querySelectorAll(".card")];

  for (const card of cards) {
    const okBusca = !busca || card.dataset.nome.includes(busca);
    const okCategoria = !categoria || card.dataset.categoria === categoria;
    const okMaterial = !material || card.dataset.material === material;
    const okPix = !soPix || card.dataset.pix === "1";
    card.classList.toggle("oculto-tela", !(okBusca && okCategoria && okMaterial && okPix));
  }

  const comparadores = {
    preco_asc: (a, b) => Number(a.dataset.preco) - Number(b.dataset.preco),
    preco_desc: (a, b) => Number(b.dataset.preco) - Number(a.dataset.preco),
    cliques: (a, b) => Number(b.dataset.cliques) - Number(a.dataset.cliques),
    recentes: (a, b) => new Date(b.dataset.criado || 0) - new Date(a.dataset.criado || 0),
  };
  const comparador = comparadores[ordenar];
  if (comparador) {
    for (const card of [...cards].sort(comparador)) grid.appendChild(card);
  }
}

function ligarFiltros() {
  const busca = document.getElementById("busca");
  if (busca) busca.addEventListener("input", debounce(aplicarFiltros, 250));

  for (const id of ["filtro-categoria", "filtro-material", "ordenar"]) {
    document.getElementById(id)?.addEventListener("change", aplicarFiltros);
  }
  document.getElementById("filtro-pix")?.addEventListener("change", aplicarFiltros);
}

restaurarEstadoDaURL();
hidratarFavoritos();
hidratarComparacao();
ligarEventosInterativos();
ligarFiltros();
