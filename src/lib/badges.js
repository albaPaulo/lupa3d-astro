// Portado de frontend/js/shared.js — mesma lógica, só que calculada uma vez
// no build (usando o histórico completo já carregado) em vez de sob demanda
// no navegador a cada visita.

function parseBadges(json, ordem) {
  let lista = [];
  try {
    lista = JSON.parse(json || "[]");
  } catch {
    lista = [];
  }
  lista = lista.filter((b) => b?.dias > 0);
  return ordem === "desc" ? lista.sort((a, b) => b.dias - a.dias) : lista.sort((a, b) => a.dias - b.dias);
}

export function badgesMenorPrecoDeConfig(config) {
  return parseBadges(config.menor_preco_badges, "desc");
}

export function badgesProdutoNovoDeConfig(config) {
  return parseBadges(config.produto_novo_badges, "asc");
}

// Produtos sem histórico suficiente no período são incluídos por padrão —
// sem dado pra comparar, o preço atual é trivialmente o "menor" que se conhece.
export function ehMenorPrecoEmDias(produto, dias, historicoPorProduto) {
  const historico = historicoPorProduto.get(produto.id);
  if (!historico || historico.length === 0) return true;

  const desde = Date.now() - dias * 86400000;
  const precosNoPeriodo = historico
    .filter((h) => new Date(h.capturado_em).getTime() >= desde)
    .map((h) => Number(h.preco));

  if (precosNoPeriodo.length === 0) return true;
  return Number(produto.preco) <= Math.min(...precosNoPeriodo);
}

function ehProdutoNovo(produto, dias) {
  if (!produto.criado_em) return false;
  const idadeDias = (Date.now() - new Date(produto.criado_em).getTime()) / 86400000;
  return idadeDias <= dias;
}

// badgesMenorPreco vem ordenado do maior prazo pro menor — mostra só a mais
// forte que o produto atingir.
export function badgeMenorPreco(p, badgesMenorPreco, historicoPorProduto) {
  return badgesMenorPreco.find((b) => ehMenorPrecoEmDias(p, b.dias, historicoPorProduto)) || null;
}

// Preço atual é o menor de TODO o histórico já registrado (não só numa
// janela de dias) — mesma lógica permissiva de ehMenorPrecoEmDias pra
// produto sem histórico ainda (o preço atual é trivialmente o "menor" que
// se conhece dele).
export function ehMenorPrecoHistorico(p, historicoPorProduto) {
  const historico = historicoPorProduto.get(p.id);
  if (!historico || historico.length === 0) return true;
  const precosHistoricos = historico.map((h) => Number(h.preco));
  return Number(p.preco) <= Math.min(...precosHistoricos);
}

// "Menor preço histórico" é sempre a claim mais forte possível — se é o
// menor de todo o histórico, automaticamente também é o menor em qualquer
// janela de dias, então ele sobrepõe (não soma) os badges configuráveis de
// N dias. Desativável no admin (menor_preco_historico_ativo) porque, com
// histórico ainda curto, pode disparar cedo demais pra ser útil.
export function badgeMenorPrecoEfetivo(p, badgesMenorPreco, historicoPorProduto, historicoAtivo = true) {
  if (historicoAtivo && ehMenorPrecoHistorico(p, historicoPorProduto)) {
    return { icone: "🏆", label: "Menor preço histórico!" };
  }
  return badgeMenorPreco(p, badgesMenorPreco, historicoPorProduto);
}

// Maior preço que o próprio produto teve nos últimos `dias` — pra mostrar
// "de/por" no card quando o preço atual é mais baixo que isso. Só retorna
// valor quando há queda real registrada no histórico (nunca inventa um
// preço "de" maior do que o produto já teve de fato).
export function precoAnteriorParaExibicao(p, historicoPorProduto, dias = 30) {
  const historico = historicoPorProduto.get(p.id);
  if (!historico || historico.length === 0) return null;

  const desde = Date.now() - dias * 86400000;
  const precosNoPeriodo = historico
    .filter((h) => new Date(h.capturado_em).getTime() >= desde)
    .map((h) => Number(h.preco));

  if (precosNoPeriodo.length === 0) return null;
  const maior = Math.max(...precosNoPeriodo);
  return maior > Number(p.preco) ? maior : null;
}

// badgesProdutoNovo vem ordenado do menor prazo pro maior — ao contrário da
// de menor preço, aqui o prazo mais curto é o mais forte.
export function badgeProdutoNovo(p, badgesProdutoNovo) {
  return badgesProdutoNovo.find((b) => ehProdutoNovo(p, b.dias)) || null;
}
