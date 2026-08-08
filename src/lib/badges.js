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

// badgesProdutoNovo vem ordenado do menor prazo pro maior — ao contrário da
// de menor preço, aqui o prazo mais curto é o mais forte.
export function badgeProdutoNovo(p, badgesProdutoNovo) {
  return badgesProdutoNovo.find((b) => ehProdutoNovo(p, b.dias)) || null;
}
