// Único fetch que essa versão do site faz fora do build: como favoritos são
// por visitante (localStorage), não tem como gerar essa página no build —
// busca só os produtos favoritados na hora (não o catálogo inteiro).
let PRODUTOS_FAVORITOS = [];

function cardHTMLCliente(p) {
  const material = p.material_manual || p.material || "";
  const kit = p.kit_manual ?? p.kit ?? false;
  const temPix = p.preco_pix != null && Number(p.preco_pix) < Number(p.preco);
  const imagem = p.imagem_url
    ? `<img src="${escapeHTMLJS(p.imagem_url)}" alt="${escapeHTMLJS(p.nome)}" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="card-imagem-vazia">📦</span>`;

  return `
    <article class="card" data-id="${p.id}" data-nome="${escapeHTMLJS(p.nome.toLowerCase())}" data-categoria="${escapeHTMLJS(p.categoria || "")}" data-material="${escapeHTMLJS(material)}" data-pix="${temPix ? "1" : "0"}" data-preco="${p.preco}" data-cliques="${p.cliques_total || 0}" data-criado="${p.criado_em || ""}">
      <button class="btn-favorito" data-id="${p.id}" title="Favoritar" aria-label="Favoritar" aria-pressed="false">☆</button>
      ${p.destaque ? `<span class="badge-destaque">🔥</span>` : ""}
      ${kit ? `<span class="badge-kit">Kit/Combo</span>` : ""}
      <div class="card-imagem">${imagem}</div>
      <div class="card-corpo">
        <h3 class="card-nome">${escapeHTMLJS(p.nome)}</h3>
        <div class="card-precos">
          <span class="card-preco">${formatarPrecoJS(p.preco)}</span>
          ${p.preco_pix ? `<span class="card-preco-pix">${formatarPrecoJS(p.preco_pix)} no Pix</span>` : ""}
        </div>
        <span class="card-vendido-por">Vendido por ${escapeHTMLJS(p.loja)}</span>
        <label class="checkbox-comparar">
          <input type="checkbox" data-id="${p.id}" />
          Comparar
        </label>
        <a href="/produto/${p.id}/" class="btn-ver-oferta">Ver detalhes</a>
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
  const btnCompartilhar = document.getElementById("btn-compartilhar-favoritos");
  if (!grid) return;

  if (PRODUTOS_FAVORITOS.length === 0) {
    grid.innerHTML = "";
    if (status) {
      status.textContent = "Você ainda não favoritou nenhum produto — clique na estrela ☆ de um card pra guardar aqui.";
      status.classList.remove("status-carregando");
    }
    btnCompartilhar?.classList.add("oculto-tela");
    return;
  }

  if (status) status.textContent = "";
  grid.innerHTML = PRODUTOS_FAVORITOS.map(cardHTMLCliente).join("");
  btnCompartilhar?.classList.remove("oculto-tela");
  hidratarFavoritos();
  hidratarComparacao();
  aplicarFiltros();
}

async function carregarFavoritos() {
  const status = document.getElementById("status");
  const ids = getFavoritos();

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
    PRODUTOS_FAVORITOS = await resp.json();
  } catch (e) {
    if (status) status.textContent = "Não foi possível carregar seus favoritos agora.";
    return;
  }

  popularFiltrosFavoritos(PRODUTOS_FAVORITOS);
  renderizarGridFavoritos();
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
