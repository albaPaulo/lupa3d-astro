// Nomes de produto vêm dos scrapers (sites de terceiros) — sem escapar, um
// título malicioso/malformado numa loja poderia injetar HTML/JS na tabela
// do admin, que roda com a sessão autenticada aberta.
const _ESCAPE_HTML_MAPA = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHTML(valor) {
  if (valor == null) return "";
  return String(valor).replace(/[&<>"']/g, (c) => _ESCAPE_HTML_MAPA[c]);
}

// O site público é gerado estático (Astro) e só lê o Supabase durante o
// build — fica só nesse arquivo (carregado apenas pelo admin), não em
// config.js, porque config.js é carregado em toda página pública e esse
// link deixa qualquer um disparar builds à vontade se ficar exposto lá.
const NETLIFY_BUILD_HOOK_URL = "https://api.netlify.com/build_hooks/6a7761f4bec0491e620cae52";

let PRODUTOS_ADMIN = [];
let SECOES = [];
let PINADOS_ATUAIS = [];
let SECAO_EDITANDO_ID = null;
let LOJAS_CONFIG = [];
let CONFIG_ATUAL = {};
let MENOR_PRECO_BADGES_ATUAL = []; // [{dias, icone, label}]
let PRODUTO_NOVO_BADGES_ATUAL = []; // [{dias, icone, label}]

const admEls = {
  telaLogin: document.getElementById("tela-login"),
  telaAdmin: document.getElementById("tela-admin"),
  formLogin: document.getElementById("form-login"),
  loginEmail: document.getElementById("login-email"),
  loginSenha: document.getElementById("login-senha"),
  loginErro: document.getElementById("login-erro"),
  usuarioLogado: document.getElementById("admin-usuario-logado"),
  emailLogado: document.getElementById("admin-email-logado"),
  btnLogout: document.getElementById("btn-logout"),
  btnPublicar: document.getElementById("btn-publicar"),
  publicarStatus: document.getElementById("publicar-status"),
  formConfig: document.getElementById("form-config"),
  configTitulo: document.getElementById("config-titulo"),
  configBanner: document.getElementById("config-banner"),
  configManutencao: document.getElementById("config-manutencao"),
  configColunas: document.getElementById("config-colunas"),
  configParecidosFaixaPreco: document.getElementById("config-parecidos-faixa-preco"),
  badgesLista: document.getElementById("config-badges-lista"),
  badgeNovoIcone: document.getElementById("badge-novo-icone"),
  badgeNovoDias: document.getElementById("badge-novo-dias"),
  badgeNovoLabel: document.getElementById("badge-novo-label"),
  btnAdicionarBadge: document.getElementById("btn-adicionar-badge"),
  badgesNovidadeLista: document.getElementById("config-badges-novidade-lista"),
  badgeNovidadeNovoIcone: document.getElementById("badge-novidade-novo-icone"),
  badgeNovidadeNovoDias: document.getElementById("badge-novidade-novo-dias"),
  badgeNovidadeNovoLabel: document.getElementById("badge-novidade-novo-label"),
  btnAdicionarBadgeNovidade: document.getElementById("btn-adicionar-badge-novidade"),
  configStatus: document.getElementById("config-status"),
  busca: document.getElementById("admin-busca"),
  contador: document.getElementById("admin-contador"),
  contadorFaltando: document.getElementById("admin-contador-faltando"),
  filtroFaltando: document.getElementById("admin-filtro-faltando"),
  filtroLoja: document.getElementById("admin-filtro-loja"),
  filtroCategoria: document.getElementById("admin-filtro-categoria"),
  filtroMaterial: document.getElementById("admin-filtro-material"),
  tbody: document.getElementById("admin-tbody"),
  secoesLista: document.getElementById("secoes-lista"),
  formSecao: document.getElementById("form-secao"),
  secaoFormTitulo: document.getElementById("secao-form-titulo"),
  secaoId: document.getElementById("secao-id"),
  secaoNome: document.getElementById("secao-nome"),
  secaoIcone: document.getElementById("secao-icone"),
  secaoCor: document.getElementById("secao-cor"),
  secaoOrdem: document.getElementById("secao-ordem"),
  secaoLayout: document.getElementById("secao-layout"),
  secaoColunas: document.getElementById("secao-colunas"),
  secaoLinhas: document.getElementById("secao-linhas"),
  secaoCategoria: document.getElementById("secao-categoria"),
  secaoMarca: document.getElementById("secao-marca"),
  secaoPrecoMaximo: document.getElementById("secao-preco-maximo"),
  secaoMenorPrecoDias: document.getElementById("secao-menor-preco-dias"),
  secaoAtivo: document.getElementById("secao-ativo"),
  secaoOrdenarCliques: document.getElementById("secao-ordenar-cliques"),
  secaoBuscaProduto: document.getElementById("secao-busca-produto"),
  secaoBuscaResultados: document.getElementById("secao-busca-resultados"),
  secaoPinados: document.getElementById("secao-pinados"),
  secaoStatus: document.getElementById("secao-status"),
  btnCancelarEdicaoSecao: document.getElementById("btn-cancelar-edicao-secao"),
  menuItens: document.querySelectorAll(".admin-menu-item"),
  abas: document.querySelectorAll(".admin-aba"),
  lojasLista: document.getElementById("admin-lojas-lista"),
  categoriasToggle: document.getElementById("config-categorias-toggle"),
  analyticsGraficoDias: document.getElementById("analytics-grafico-dias"),
  analyticsTopProdutos: document.getElementById("analytics-top-produtos"),
  analyticsPorLoja: document.getElementById("analytics-por-loja"),
};

// Fábrica reutilizada pelas duas listas de badges (menor preço / produto
// novo) — mesma UI de adicionar/remover linhas, só muda onde guarda os dados
// e o texto padrão exibido quando a linha não tem um texto customizado.
function criarEditorBadges({ elLista, elIcone, elDias, elLabel, elBtnAdicionar, getLista, setLista, textoPadrao, iconePadrao }) {
  function render() {
    const lista = getLista();
    elLista.innerHTML = lista.length
      ? lista
          .map(
            (b, i) => `
      <div class="config-badge-item">
        <span class="config-badge-item-icone">${b.icone || iconePadrao}</span>
        <span class="config-badge-item-texto">${b.label ? `${b.label} <small>(${b.dias} dias)</small>` : textoPadrao(b.dias)}</span>
        <button type="button" data-remover-badge="${i}">Remover</button>
      </div>
    `
          )
          .join("")
      : `<p class="admin-status">Nenhuma badge cadastrada — desativada.</p>`;
  }

  elBtnAdicionar.addEventListener("click", () => {
    const icone = elIcone.value.trim();
    const dias = parseInt(elDias.value, 10);
    const label = elLabel.value.trim();

    if (!dias || dias <= 0) {
      alert("Informe um número de dias válido.");
      return;
    }

    const lista = getLista();
    lista.push({ dias, icone: icone || iconePadrao, label });
    lista.sort((a, b) => a.dias - b.dias);
    setLista(lista);
    render();

    elIcone.value = "";
    elDias.value = "";
    elLabel.value = "";
  });

  elLista.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-remover-badge]");
    if (!btn) return;
    const lista = getLista();
    lista.splice(Number(btn.dataset.removerBadge), 1);
    setLista(lista);
    render();
  });

  return { render };
}

const editorMenorPreco = criarEditorBadges({
  elLista: admEls.badgesLista,
  elIcone: admEls.badgeNovoIcone,
  elDias: admEls.badgeNovoDias,
  elLabel: admEls.badgeNovoLabel,
  elBtnAdicionar: admEls.btnAdicionarBadge,
  getLista: () => MENOR_PRECO_BADGES_ATUAL,
  setLista: (l) => (MENOR_PRECO_BADGES_ATUAL = l),
  textoPadrao: (dias) => `Menor preço em ${dias} dias`,
  iconePadrao: "🔥",
});

const editorProdutoNovo = criarEditorBadges({
  elLista: admEls.badgesNovidadeLista,
  elIcone: admEls.badgeNovidadeNovoIcone,
  elDias: admEls.badgeNovidadeNovoDias,
  elLabel: admEls.badgeNovidadeNovoLabel,
  elBtnAdicionar: admEls.btnAdicionarBadgeNovidade,
  getLista: () => PRODUTO_NOVO_BADGES_ATUAL,
  setLista: (l) => (PRODUTO_NOVO_BADGES_ATUAL = l),
  textoPadrao: () => "Novo",
  iconePadrao: "🆕",
});

function ativarAba(nome) {
  admEls.menuItens.forEach((btn) => btn.classList.toggle("ativo", btn.dataset.aba === nome));
  admEls.abas.forEach((secao) => secao.classList.toggle("oculto-tela", secao.dataset.aba !== nome));
}

function mostrarTelaAdmin(email) {
  admEls.telaLogin.classList.add("oculto-tela");
  admEls.telaAdmin.classList.remove("oculto-tela");
  admEls.usuarioLogado.classList.remove("oculto-tela");
  admEls.emailLogado.textContent = email;
}

function mostrarTelaLogin() {
  admEls.telaAdmin.classList.add("oculto-tela");
  admEls.usuarioLogado.classList.add("oculto-tela");
  admEls.telaLogin.classList.remove("oculto-tela");
}

async function carregarConfiguracoes() {
  const resp = await fetchAdmin("/rest/v1/configuracoes?select=chave,valor");
  if (!resp.ok) throw new Error("Falha ao carregar configurações");
  const linhas = await resp.json();
  CONFIG_ATUAL = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));

  admEls.configTitulo.value = CONFIG_ATUAL.titulo_site || "";
  admEls.configBanner.value = CONFIG_ATUAL.aviso_banner || "";
  admEls.configManutencao.checked = CONFIG_ATUAL.manutencao === "true";
  admEls.configColunas.value = CONFIG_ATUAL.colunas_grid || "3";
  admEls.configParecidosFaixaPreco.checked = CONFIG_ATUAL.parecidos_faixa_preco_ativa !== "false";

  try {
    MENOR_PRECO_BADGES_ATUAL = JSON.parse(CONFIG_ATUAL.menor_preco_badges || "[]");
  } catch {
    MENOR_PRECO_BADGES_ATUAL = [];
  }
  editorMenorPreco.render();

  try {
    PRODUTO_NOVO_BADGES_ATUAL = JSON.parse(CONFIG_ATUAL.produto_novo_badges || "[]");
  } catch {
    PRODUTO_NOVO_BADGES_ATUAL = [];
  }
  editorProdutoNovo.render();
}

function popularCategoriasToggle() {
  const categorias = [...new Set(PRODUTOS_ADMIN.map((p) => p.categoria).filter(Boolean))].sort();
  const desativadas = new Set(
    (CONFIG_ATUAL.categorias_desativadas || "").split(",").map((c) => c.trim()).filter(Boolean)
  );

  admEls.categoriasToggle.innerHTML = categorias
    .map(
      (c) => `
      <label class="checkbox-linha">
        <input type="checkbox" data-categoria-toggle="${c}" ${desativadas.has(c) ? "" : "checked"}>
        ${c[0].toUpperCase() + c.slice(1)}
      </label>
    `
    )
    .join("");
}

async function salvarConfiguracoes(ev) {
  ev.preventDefault();
  admEls.configStatus.textContent = "Salvando...";

  const categoriasDesativadas = [...admEls.categoriasToggle.querySelectorAll("[data-categoria-toggle]")]
    .filter((input) => !input.checked)
    .map((input) => input.dataset.categoriaToggle);

  const linhas = [
    { chave: "titulo_site", valor: admEls.configTitulo.value.trim() || "LUPA3D" },
    { chave: "aviso_banner", valor: admEls.configBanner.value.trim() },
    { chave: "manutencao", valor: admEls.configManutencao.checked ? "true" : "false" },
    { chave: "colunas_grid", valor: admEls.configColunas.value },
    { chave: "categorias_desativadas", valor: categoriasDesativadas.join(",") },
    { chave: "parecidos_faixa_preco_ativa", valor: admEls.configParecidosFaixaPreco.checked ? "true" : "false" },
    { chave: "menor_preco_badges", valor: JSON.stringify(MENOR_PRECO_BADGES_ATUAL) },
    { chave: "produto_novo_badges", valor: JSON.stringify(PRODUTO_NOVO_BADGES_ATUAL) },
  ];

  try {
    const resp = await fetchAdmin("/rest/v1/configuracoes?on_conflict=chave", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(linhas),
    });
    if (!resp.ok) throw new Error(await resp.text());
    admEls.configStatus.textContent = "Salvo!";
  } catch (e) {
    admEls.configStatus.textContent = "Erro ao salvar.";
    console.error(e);
  }
  setTimeout(() => (admEls.configStatus.textContent = ""), 2500);
}

function faltaCategorizar(p) {
  return {
    semCategoria: !p.categoria,
    semSubcategoria: !p.material && !p.material_manual,
  };
}

function materialEfetivoAdmin(p) {
  return p.material_manual || p.material || "";
}

function popularSelect(select, valores) {
  const atual = select.value;
  const opcaoPadrao = select.options[0];
  select.innerHTML = "";
  select.appendChild(opcaoPadrao);
  valores.forEach((v) => {
    const opcao = document.createElement("option");
    opcao.value = v;
    opcao.textContent = v;
    select.appendChild(opcao);
  });
  if (valores.includes(atual)) select.value = atual;
}

function popularFiltrosProdutos() {
  const lojas = [...new Set(PRODUTOS_ADMIN.map((p) => p.loja).filter(Boolean))].sort();
  const categorias = [...new Set(PRODUTOS_ADMIN.map((p) => p.categoria).filter(Boolean))].sort();
  const materiais = [...new Set(PRODUTOS_ADMIN.map(materialEfetivoAdmin).filter(Boolean))].sort();

  popularSelect(admEls.filtroLoja, lojas);
  popularSelect(admEls.filtroCategoria, categorias);
  popularSelect(admEls.filtroMaterial, materiais);
}

function linhaProdutoHTML(p) {
  const { semCategoria, semSubcategoria } = faltaCategorizar(p);
  const temAlerta = semCategoria || semSubcategoria;

  return `
    <tr data-id="${p.id}" class="${temAlerta ? "linha-alerta" : ""}">
      <td class="admin-col-nome">${temAlerta ? `<span class="icone-alerta" title="${semCategoria ? "Sem categoria" : ""}${semCategoria && semSubcategoria ? " e " : ""}${semSubcategoria ? "Sem subcategoria" : ""}">⚠️</span> ` : ""}${escapeHTML(p.nome)}</td>
      <td>${escapeHTML(p.loja)}</td>
      <td>R$ ${Number(p.preco).toFixed(2)}</td>
      <td class="admin-col-check">${p.cliques_total || 0}</td>
      <td><input type="text" data-campo="categoria" value="${p.categoria || ""}" class="${semCategoria ? "campo-alerta" : ""}"></td>
      <td><input type="text" data-campo="material_manual" value="${escapeHTML(p.material_manual || "")}" placeholder="${escapeHTML(p.material || "ex: PLA")}" class="${semSubcategoria ? "campo-alerta" : ""}"></td>
      <td><input type="text" data-campo="descricao_manual" value="${escapeHTML(p.descricao_manual || "")}"></td>
      <td class="admin-col-check"><input type="checkbox" data-campo="destaque" ${p.destaque ? "checked" : ""}></td>
      <td class="admin-col-check"><input type="checkbox" data-campo="oculto" ${p.oculto ? "checked" : ""}></td>
      <td class="admin-col-check"><input type="checkbox" data-campo="kit_manual" ${(p.kit_manual ?? p.kit) ? "checked" : ""} title="${p.kit ? "Detectado automaticamente como kit/combo" : "Não detectado como kit/combo"}"></td>
      <td><button data-acao="salvar-produto" class="admin-btn-salvar">Salvar</button></td>
    </tr>
  `;
}

function renderizarTabela() {
  const termo = admEls.busca.value.trim().toLowerCase();
  const soFaltando = admEls.filtroFaltando.checked;
  const loja = admEls.filtroLoja.value;
  const categoria = admEls.filtroCategoria.value;
  const material = admEls.filtroMaterial.value;

  let lista = PRODUTOS_ADMIN;
  if (termo) {
    lista = lista.filter((p) => p.nome.toLowerCase().includes(termo) || p.loja.toLowerCase().includes(termo));
  }
  if (loja) lista = lista.filter((p) => p.loja === loja);
  if (categoria) lista = lista.filter((p) => p.categoria === categoria);
  if (material) lista = lista.filter((p) => materialEfetivoAdmin(p) === material);
  if (soFaltando) {
    lista = lista.filter((p) => {
      const { semCategoria, semSubcategoria } = faltaCategorizar(p);
      return semCategoria || semSubcategoria;
    });
  }

  admEls.contador.textContent = lista.length;
  admEls.tbody.innerHTML = lista.map(linhaProdutoHTML).join("");

  const faltando = PRODUTOS_ADMIN.filter((p) => {
    const { semCategoria, semSubcategoria } = faltaCategorizar(p);
    return semCategoria || semSubcategoria;
  }).length;
  admEls.contadorFaltando.textContent = faltando;
}

async function carregarProdutosAdmin() {
  const resp = await fetchAdmin("/rest/v1/produtos?select=*&order=loja.asc,nome.asc");
  if (!resp.ok) throw new Error("Falha ao carregar produtos");
  PRODUTOS_ADMIN = await resp.json();
  popularFiltrosProdutos();
  renderizarTabela();
}

async function salvarProduto(tr) {
  const id = tr.dataset.id;
  const btn = tr.querySelector('[data-acao="salvar-produto"]');
  const corpo = {
    categoria: tr.querySelector('[data-campo="categoria"]').value.trim() || null,
    material_manual: tr.querySelector('[data-campo="material_manual"]').value.trim() || null,
    descricao_manual: tr.querySelector('[data-campo="descricao_manual"]').value.trim() || null,
    destaque: tr.querySelector('[data-campo="destaque"]').checked,
    oculto: tr.querySelector('[data-campo="oculto"]').checked,
    kit_manual: tr.querySelector('[data-campo="kit_manual"]').checked,
  };

  btn.textContent = "Salvando...";
  btn.disabled = true;

  try {
    const resp = await fetchAdmin(`/rest/v1/produtos?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(corpo),
    });
    if (!resp.ok) throw new Error(await resp.text());
    btn.textContent = "Salvo!";
    tr.classList.remove("linha-nao-salva");
  } catch (e) {
    btn.textContent = "Erro";
    console.error(e);
  }

  setTimeout(() => {
    btn.textContent = "Salvar";
    btn.disabled = false;
  }, 1500);
}

async function buscarCliquesUltimosDias(dias) {
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  desde.setDate(desde.getDate() - (dias - 1));

  const TAMANHO_PAGINA = 1000;
  const todos = [];
  let offset = 0;
  while (true) {
    const resp = await fetchAdmin(
      `/rest/v1/cliques_produto?select=criado_em&criado_em=gte.${encodeURIComponent(desde.toISOString())}`,
      { headers: { Range: `${offset}-${offset + TAMANHO_PAGINA - 1}` } }
    );
    if (!resp.ok) throw new Error("Falha ao carregar cliques");
    const lote = await resp.json();
    todos.push(...lote);
    if (lote.length < TAMANHO_PAGINA) break;
    offset += TAMANHO_PAGINA;
  }
  return todos;
}

function agregarCliquesPorDia(cliques, dias) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const contagem = new Map();
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i);
    contagem.set(d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), 0);
  }

  for (const c of cliques) {
    const chave = new Date(c.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    if (contagem.has(chave)) contagem.set(chave, contagem.get(chave) + 1);
  }

  return [...contagem.entries()].map(([data, valor]) => ({ data, valor }));
}

// Reaproveita as classes do gráfico de histórico de preço (produto.html) —
// mesma linguagem visual, só troca a linha por barras.
function graficoBarrasDiasSVG(dados) {
  const totalCliques = dados.reduce((soma, d) => soma + d.valor, 0);
  if (totalCliques === 0) {
    return `<p class="grafico-vazio">Nenhum clique registrado no período.</p>`;
  }

  const largura = 700;
  const altura = 160;
  const max = Math.max(...dados.map((d) => d.valor));
  const passo = largura / dados.length;
  const larguraBarra = passo * 0.6;

  const barras = dados
    .map((d, i) => {
      const x = passo * i + (passo - larguraBarra) / 2;
      const alturaBarra = max > 0 ? (d.valor / max) * altura : 0;
      const y = altura - alturaBarra;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${larguraBarra.toFixed(1)}" height="${Math.max(alturaBarra, d.valor > 0 ? 2 : 0).toFixed(1)}" class="analytics-barra-svg"><title>${d.data}: ${d.valor} clique${d.valor === 1 ? "" : "s"}</title></rect>`;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${largura} ${altura}" class="grafico-historico" preserveAspectRatio="none">${barras}</svg>
    <div class="grafico-legendas">
      <span>${dados[0].data}</span>
      <span>${totalCliques} clique${totalCliques === 1 ? "" : "s"} no total</span>
      <span>${dados[dados.length - 1].data}</span>
    </div>
  `;
}

function renderizarListaRanking(el, itens) {
  const max = Math.max(...itens.map((i) => i.valor), 1);
  el.innerHTML = itens.length
    ? itens
        .map(
          (item) => `
      <div class="analytics-item">
        <span class="analytics-item-rotulo" title="${escapeHTML(item.rotulo)}">${escapeHTML(item.rotulo)}</span>
        <span class="analytics-item-barra-wrap"><span class="analytics-item-barra" style="width:${(item.valor / max) * 100}%"></span></span>
        <span class="analytics-item-valor">${item.valor}</span>
      </div>
    `
        )
        .join("")
    : `<p class="admin-status">Sem dados ainda.</p>`;
}

async function carregarAnalytics() {
  const top10 = [...PRODUTOS_ADMIN]
    .filter((p) => p.cliques_total > 0)
    .sort((a, b) => b.cliques_total - a.cliques_total)
    .slice(0, 10)
    .map((p) => ({ valor: p.cliques_total, rotulo: `${p.nome} (${p.loja})` }));
  renderizarListaRanking(admEls.analyticsTopProdutos, top10);

  const porLojaMap = new Map();
  for (const p of PRODUTOS_ADMIN) {
    porLojaMap.set(p.loja, (porLojaMap.get(p.loja) || 0) + (p.cliques_total || 0));
  }
  const porLoja = [...porLojaMap.entries()]
    .map(([loja, valor]) => ({ rotulo: loja, valor }))
    .filter((item) => item.valor > 0)
    .sort((a, b) => b.valor - a.valor);
  renderizarListaRanking(admEls.analyticsPorLoja, porLoja);

  admEls.analyticsGraficoDias.innerHTML = `<p class="grafico-vazio">Carregando...</p>`;
  try {
    const cliques = await buscarCliquesUltimosDias(30);
    admEls.analyticsGraficoDias.innerHTML = graficoBarrasDiasSVG(agregarCliquesPorDia(cliques, 30));
  } catch (e) {
    admEls.analyticsGraficoDias.innerHTML = `<p class="grafico-vazio">Não foi possível carregar os cliques por dia.</p>`;
    console.error(e);
  }
}

async function carregarLojas() {
  const resp = await fetchAdmin("/rest/v1/lojas?select=*");
  if (!resp.ok) throw new Error("Falha ao carregar lojas");
  LOJAS_CONFIG = await resp.json();
}

const DIAS_ALERTA_LOJA_DESATUALIZADA = 3;

function ultimaAtualizacaoLoja(nome) {
  const datas = PRODUTOS_ADMIN.filter((p) => p.loja === nome && p.atualizado_em)
    .map((p) => new Date(p.atualizado_em).getTime())
    .filter((t) => !isNaN(t));
  return datas.length ? new Date(Math.max(...datas)) : null;
}

function atualizacaoLojaHTML(nome) {
  const ultima = ultimaAtualizacaoLoja(nome);
  if (!ultima) {
    return `<p class="loja-config-atualizacao loja-config-atualizacao-alerta">⚠️ Sem produtos coletados ainda</p>`;
  }

  const dias = (Date.now() - ultima.getTime()) / 86400000;
  const desatualizada = dias > DIAS_ALERTA_LOJA_DESATUALIZADA;
  const icone = desatualizada ? "⚠️" : "✅";
  const dataFormatada = ultima.toLocaleString("pt-BR");

  return `
    <p class="loja-config-atualizacao ${desatualizada ? "loja-config-atualizacao-alerta" : ""}">
      ${icone} Última atualização: ${dataFormatada}
    </p>
  `;
}

function linhaLojaHTML(nome) {
  const cfg = LOJAS_CONFIG.find((l) => l.nome === nome) || {};
  return `
    <div class="loja-config-card" data-nome="${nome}">
      <h3>${nome}</h3>
      ${atualizacaoLojaHTML(nome)}
      <label>
        Logotipo (URL da imagem)
        <input type="text" data-campo="logo_url" value="${cfg.logo_url || ""}" placeholder="https://...">
      </label>
      <label>
        Banner (URL da imagem)
        <input type="text" data-campo="banner_url" value="${cfg.banner_url || ""}" placeholder="https://...">
      </label>
      <div class="loja-config-preview">
        ${cfg.logo_url ? `<img src="${cfg.logo_url}" class="loja-config-preview-logo" referrerpolicy="no-referrer">` : ""}
        ${cfg.banner_url ? `<img src="${cfg.banner_url}" class="loja-config-preview-banner" referrerpolicy="no-referrer">` : ""}
      </div>
      <label>
        Descrição breve da empresa
        <textarea data-campo="descricao" rows="2" placeholder="ex: Fabricante nacional de filamentos PLA e PETG desde 2019.">${cfg.descricao || ""}</textarea>
      </label>
      <label>
        Instagram (link)
        <input type="text" data-campo="instagram_url" value="${cfg.instagram_url || ""}" placeholder="https://instagram.com/...">
      </label>
      <label>
        Facebook (link)
        <input type="text" data-campo="facebook_url" value="${cfg.facebook_url || ""}" placeholder="https://facebook.com/...">
      </label>
      <label>
        LinkedIn (link)
        <input type="text" data-campo="linkedin_url" value="${cfg.linkedin_url || ""}" placeholder="https://linkedin.com/...">
      </label>
      <label>
        Site oficial (link)
        <input type="text" data-campo="site_url" value="${cfg.site_url || ""}" placeholder="https://...">
      </label>
      <button type="button" data-acao="salvar-loja">Salvar</button>
      <span class="admin-status" data-papel="status"></span>
    </div>
  `;
}

function renderizarLojas() {
  const nomesLojas = [...new Set(PRODUTOS_ADMIN.map((p) => p.loja))].sort();
  admEls.lojasLista.innerHTML = nomesLojas.map(linhaLojaHTML).join("");
}

async function salvarLoja(card) {
  const nome = card.dataset.nome;
  const btn = card.querySelector('[data-acao="salvar-loja"]');
  const status = card.querySelector('[data-papel="status"]');
  const logoUrl = card.querySelector('[data-campo="logo_url"]').value.trim();
  const bannerUrl = card.querySelector('[data-campo="banner_url"]').value.trim();
  const descricao = card.querySelector('[data-campo="descricao"]').value.trim();
  const instagramUrl = card.querySelector('[data-campo="instagram_url"]').value.trim();
  const facebookUrl = card.querySelector('[data-campo="facebook_url"]').value.trim();
  const linkedinUrl = card.querySelector('[data-campo="linkedin_url"]').value.trim();
  const siteUrl = card.querySelector('[data-campo="site_url"]').value.trim();
  const corpo = {
    nome,
    logo_url: logoUrl || null,
    banner_url: bannerUrl || null,
    descricao: descricao || null,
    instagram_url: instagramUrl || null,
    facebook_url: facebookUrl || null,
    linkedin_url: linkedinUrl || null,
    site_url: siteUrl || null,
  };

  btn.textContent = "Salvando...";
  btn.disabled = true;

  try {
    const resp = await fetchAdmin("/rest/v1/lojas?on_conflict=nome", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(corpo),
    });
    if (!resp.ok) throw new Error(await resp.text());

    const existente = LOJAS_CONFIG.find((l) => l.nome === nome);
    if (existente) Object.assign(existente, corpo);
    else LOJAS_CONFIG.push(corpo);

    card.querySelector(".loja-config-preview").innerHTML = `
      ${logoUrl ? `<img src="${logoUrl}" class="loja-config-preview-logo" referrerpolicy="no-referrer">` : ""}
      ${bannerUrl ? `<img src="${bannerUrl}" class="loja-config-preview-banner" referrerpolicy="no-referrer">` : ""}
    `;
    status.textContent = "Salvo!";
    card.classList.remove("nao-salvo");
  } catch (e) {
    status.textContent = "Erro ao salvar.";
    console.error(e);
  }

  btn.textContent = "Salvar";
  btn.disabled = false;
  setTimeout(() => (status.textContent = ""), 2500);
}

function popularSelectsSecao() {
  const categorias = [...new Set(PRODUTOS_ADMIN.map((p) => p.categoria).filter(Boolean))].sort();
  const lojas = [...new Set(PRODUTOS_ADMIN.map((p) => p.loja))].sort();

  admEls.secaoCategoria.innerHTML = `<option value="">Qualquer categoria</option>` +
    categorias.map((c) => `<option value="${c}">${c}</option>`).join("");
  admEls.secaoMarca.innerHTML = `<option value="">Qualquer loja</option>` +
    lojas.map((l) => `<option value="${l}">${l}</option>`).join("");
}

function renderizarChipsPinados() {
  admEls.secaoPinados.innerHTML = PINADOS_ATUAIS.map((id) => {
    const p = PRODUTOS_ADMIN.find((prod) => prod.id === id);
    const nome = p ? escapeHTML(p.nome) : `#${id}`;
    return `<span class="chip-pinado" data-id="${id}">${nome} <button type="button" data-acao="remover-pin">✕</button></span>`;
  }).join("");
}

function buscarProdutoParaFixar() {
  const termo = admEls.secaoBuscaProduto.value.trim().toLowerCase();
  if (!termo) {
    admEls.secaoBuscaResultados.innerHTML = "";
    return;
  }

  const resultados = PRODUTOS_ADMIN
    .filter((p) => !PINADOS_ATUAIS.includes(p.id))
    .filter((p) => p.nome.toLowerCase().includes(termo) || p.loja.toLowerCase().includes(termo))
    .slice(0, 8);

  admEls.secaoBuscaResultados.innerHTML = resultados
    .map((p) => `<button type="button" data-acao="adicionar-pin" data-id="${p.id}">+ ${escapeHTML(p.nome)} (${escapeHTML(p.loja)})</button>`)
    .join("");
}

function resetFormSecao() {
  SECAO_EDITANDO_ID = null;
  PINADOS_ATUAIS = [];
  admEls.formSecao.reset();
  admEls.secaoId.value = "";
  admEls.secaoCor.value = "#2563eb";
  admEls.secaoLayout.value = "scroll";
  admEls.secaoColunas.value = "4";
  admEls.secaoLinhas.value = "1";
  admEls.secaoFormTitulo.textContent = "Nova seção";
  admEls.btnCancelarEdicaoSecao.classList.add("oculto-tela");
  admEls.secaoBuscaResultados.innerHTML = "";
  renderizarChipsPinados();
}

function carregarSecaoNoForm(secao) {
  SECAO_EDITANDO_ID = secao.id;
  PINADOS_ATUAIS = [...(secao.produtos_fixados || [])];

  admEls.secaoId.value = secao.id;
  admEls.secaoNome.value = secao.nome;
  admEls.secaoIcone.value = secao.icone || "";
  admEls.secaoCor.value = secao.cor || "#2563eb";
  admEls.secaoOrdem.value = secao.ordem;
  admEls.secaoLayout.value = secao.layout || "scroll";
  admEls.secaoColunas.value = secao.colunas || 4;
  admEls.secaoLinhas.value = secao.linhas || 1;
  admEls.secaoCategoria.value = secao.categoria_filtro || "";
  admEls.secaoMarca.value = secao.marca_filtro || "";
  admEls.secaoPrecoMaximo.value = secao.preco_maximo ?? "";
  admEls.secaoMenorPrecoDias.value = secao.menor_preco_dias ?? "";
  admEls.secaoAtivo.checked = secao.ativo;
  admEls.secaoOrdenarCliques.checked = !!secao.ordenar_por_cliques;

  admEls.secaoFormTitulo.textContent = `Editando: ${secao.nome}`;
  admEls.btnCancelarEdicaoSecao.classList.remove("oculto-tela");
  renderizarChipsPinados();
  admEls.formSecao.scrollIntoView({ behavior: "smooth" });
}

function linhaSecaoHTML(secao) {
  return `
    <div class="secao-item" data-id="${secao.id}">
      <span class="secao-item-cor" style="background:${secao.cor}"></span>
      <span class="secao-item-nome">${secao.icone || ""} ${secao.nome}<small>ordem ${secao.ordem} · ${secao.categoria_filtro || "qualquer categoria"} · ${secao.marca_filtro || "qualquer loja"} · ${secao.layout === "grade" ? `grade ${secao.colunas || 4}x${secao.linhas || 1}` : "rolagem horizontal"}${secao.menor_preco_dias ? ` · menor preço em ${secao.menor_preco_dias}d` : ""}${secao.ordenar_por_cliques ? " · mais clicados" : ""}</small></span>
      <label class="checkbox-linha">
        <input type="checkbox" data-acao="toggle-ativo" ${secao.ativo ? "checked" : ""}>
        Ativa
      </label>
      <button type="button" data-acao="editar-secao">Editar</button>
      <button type="button" data-acao="excluir-secao" class="excluir">Excluir</button>
    </div>
  `;
}

async function carregarSecoes() {
  const resp = await fetchAdmin("/rest/v1/secoes_home?select=*&order=ordem.asc");
  if (!resp.ok) throw new Error("Falha ao carregar seções");
  SECOES = await resp.json();
  admEls.secoesLista.innerHTML = SECOES.length
    ? SECOES.map(linhaSecaoHTML).join("")
    : `<p class="admin-status">Nenhuma seção criada ainda.</p>`;
}

async function salvarSecao(ev) {
  ev.preventDefault();
  admEls.secaoStatus.textContent = "Salvando...";

  const corpo = {
    nome: admEls.secaoNome.value.trim(),
    icone: admEls.secaoIcone.value.trim() || null,
    cor: admEls.secaoCor.value,
    ordem: Number(admEls.secaoOrdem.value) || 0,
    layout: admEls.secaoLayout.value,
    colunas: Number(admEls.secaoColunas.value) || 4,
    linhas: Number(admEls.secaoLinhas.value) || 1,
    categoria_filtro: admEls.secaoCategoria.value || null,
    marca_filtro: admEls.secaoMarca.value || null,
    preco_maximo: admEls.secaoPrecoMaximo.value ? Number(admEls.secaoPrecoMaximo.value) : null,
    menor_preco_dias: admEls.secaoMenorPrecoDias.value ? Number(admEls.secaoMenorPrecoDias.value) : null,
    ativo: admEls.secaoAtivo.checked,
    ordenar_por_cliques: admEls.secaoOrdenarCliques.checked,
    produtos_fixados: PINADOS_ATUAIS,
  };

  try {
    const resp = SECAO_EDITANDO_ID
      ? await fetchAdmin(`/rest/v1/secoes_home?id=eq.${SECAO_EDITANDO_ID}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(corpo),
        })
      : await fetchAdmin("/rest/v1/secoes_home", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(corpo),
        });

    if (!resp.ok) throw new Error(await resp.text());
    admEls.secaoStatus.textContent = "Salvo!";
    resetFormSecao();
    await carregarSecoes();
  } catch (e) {
    admEls.secaoStatus.textContent = "Erro ao salvar.";
    console.error(e);
  }
  setTimeout(() => (admEls.secaoStatus.textContent = ""), 2500);
}

async function excluirSecao(id) {
  if (!confirm("Excluir esta seção da home? Essa ação não pode ser desfeita.")) return;
  try {
    const resp = await fetchAdmin(`/rest/v1/secoes_home?id=eq.${id}`, { method: "DELETE" });
    if (!resp.ok) throw new Error(await resp.text());
    if (SECAO_EDITANDO_ID === id) resetFormSecao();
    await carregarSecoes();
  } catch (e) {
    console.error(e);
    alert("Erro ao excluir a seção.");
  }
}

async function alternarAtivoSecao(id, ativo) {
  try {
    const resp = await fetchAdmin(`/rest/v1/secoes_home?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ ativo }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    await carregarSecoes();
  } catch (e) {
    console.error(e);
    alert("Erro ao atualizar a seção.");
  }
}

function contarEdicoesNaoSalvas() {
  return document.querySelectorAll(".linha-nao-salva, .loja-config-card.nao-salvo").length;
}

async function publicarAlteracoes() {
  const pendentes = contarEdicoesNaoSalvas();
  if (pendentes > 0) {
    const mensagem = `Você tem ${pendentes} edição(ões) não salva(s) em Produtos/Lojas — elas NÃO serão publicadas até você clicar em "Salvar" em cada uma. Publicar mesmo assim?`;
    if (!confirm(mensagem)) return;
  }

  admEls.btnPublicar.disabled = true;
  admEls.publicarStatus.textContent = "Publicando...";
  try {
    const resp = await fetch(NETLIFY_BUILD_HOOK_URL, { method: "POST" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    admEls.publicarStatus.textContent = "Build disparado! O site atualiza em 1-2 min.";
  } catch (e) {
    console.error(e);
    admEls.publicarStatus.textContent = "Erro ao disparar o build.";
  } finally {
    admEls.btnPublicar.disabled = false;
    setTimeout(() => (admEls.publicarStatus.textContent = ""), 6000);
  }
}

function ligarEventosAdmin() {
  admEls.formLogin.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    admEls.loginErro.textContent = "";
    try {
      const sessao = await loginAdmin(admEls.loginEmail.value.trim(), admEls.loginSenha.value);
      await iniciarPainel(sessao.user?.email || admEls.loginEmail.value.trim());
    } catch (e) {
      admEls.loginErro.textContent = e.message;
    }
  });

  admEls.btnLogout.addEventListener("click", () => {
    logoutAdmin();
    mostrarTelaLogin();
  });

  admEls.btnPublicar.addEventListener("click", publicarAlteracoes);

  admEls.menuItens.forEach((btn) => {
    btn.addEventListener("click", () => {
      ativarAba(btn.dataset.aba);
      if (btn.dataset.aba === "analytics") carregarAnalytics();
    });
  });

  admEls.formConfig.addEventListener("submit", salvarConfiguracoes);
  admEls.busca.addEventListener("input", renderizarTabela);
  admEls.filtroFaltando.addEventListener("change", renderizarTabela);
  admEls.filtroLoja.addEventListener("change", renderizarTabela);
  admEls.filtroCategoria.addEventListener("change", renderizarTabela);
  admEls.filtroMaterial.addEventListener("change", renderizarTabela);

  admEls.tbody.addEventListener("click", (ev) => {
    if (ev.target.closest('[data-acao="salvar-produto"]')) {
      salvarProduto(ev.target.closest("tr"));
    }
  });

  // Marca a linha como "editada e não salva" pra avisar em publicarAlteracoes()
  // caso alguém digite em vários campos e esqueça de clicar em "Salvar" antes
  // de publicar — só o clique em "Salvar" grava a edição no banco.
  admEls.tbody.addEventListener("input", (ev) => {
    if (ev.target.matches("[data-campo]")) ev.target.closest("tr").classList.add("linha-nao-salva");
  });
  admEls.tbody.addEventListener("change", (ev) => {
    if (ev.target.matches("[data-campo]")) ev.target.closest("tr").classList.add("linha-nao-salva");
  });

  admEls.lojasLista.addEventListener("click", (ev) => {
    if (ev.target.closest('[data-acao="salvar-loja"]')) {
      salvarLoja(ev.target.closest(".loja-config-card"));
    }
  });

  admEls.lojasLista.addEventListener("input", (ev) => {
    if (ev.target.matches("[data-campo]")) ev.target.closest(".loja-config-card").classList.add("nao-salvo");
  });
  admEls.lojasLista.addEventListener("change", (ev) => {
    if (ev.target.matches("[data-campo]")) ev.target.closest(".loja-config-card").classList.add("nao-salvo");
  });

  admEls.secaoBuscaProduto.addEventListener("input", buscarProdutoParaFixar);

  admEls.secaoBuscaResultados.addEventListener("click", (ev) => {
    const btn = ev.target.closest('[data-acao="adicionar-pin"]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (!PINADOS_ATUAIS.includes(id)) PINADOS_ATUAIS.push(id);
    admEls.secaoBuscaProduto.value = "";
    admEls.secaoBuscaResultados.innerHTML = "";
    renderizarChipsPinados();
  });

  admEls.secaoPinados.addEventListener("click", (ev) => {
    const btn = ev.target.closest('[data-acao="remover-pin"]');
    if (!btn) return;
    const id = Number(btn.closest(".chip-pinado").dataset.id);
    PINADOS_ATUAIS = PINADOS_ATUAIS.filter((pid) => pid !== id);
    renderizarChipsPinados();
  });

  admEls.formSecao.addEventListener("submit", salvarSecao);
  admEls.btnCancelarEdicaoSecao.addEventListener("click", resetFormSecao);

  admEls.secoesLista.addEventListener("click", (ev) => {
    const item = ev.target.closest(".secao-item");
    if (!item) return;
    const id = Number(item.dataset.id);

    if (ev.target.closest('[data-acao="editar-secao"]')) {
      const secao = SECOES.find((s) => s.id === id);
      if (secao) carregarSecaoNoForm(secao);
    }
    if (ev.target.closest('[data-acao="excluir-secao"]')) {
      excluirSecao(id);
    }
  });

  admEls.secoesLista.addEventListener("change", (ev) => {
    const check = ev.target.closest('[data-acao="toggle-ativo"]');
    if (!check) return;
    const id = Number(check.closest(".secao-item").dataset.id);
    alternarAtivoSecao(id, check.checked);
  });
}

async function iniciarPainel(email) {
  mostrarTelaAdmin(email);
  await Promise.all([carregarConfiguracoes(), carregarProdutosAdmin(), carregarLojas()]);
  popularSelectsSecao();
  popularCategoriasToggle();
  renderizarLojas();
  await carregarSecoes();
}

async function iniciar() {
  ligarEventosAdmin();
  const sessao = getSessaoAdmin();
  if (sessao) {
    try {
      await iniciarPainel(sessao.email);
      return;
    } catch (e) {
      console.error(e);
      logoutAdmin();
    }
  }
  mostrarTelaLogin();
}

iniciar();
