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

// Queda "de verdade": o preço atual precisa estar pelo menos 5% abaixo do
// preço típico do período pra ser vendido como desconto/economia/menor preço.
export const MARGEM_QUEDA_REAL = 0.05;

// Preço típico = mediana dos preços do período ponderada pelo TEMPO que cada
// preço durou (não pelo nº de coletas). Um pico de poucos dias (erro de coleta
// ou aumento passageiro) quase não pesa, então não infla o "de" do desconto
// nem a economia — ao contrário do preço máximo, que um único ponto errado
// transforma em referência pra sempre. `historico` vem ordenado por data asc.
export function precoTipico(historico, dias, agora = Date.now()) {
  if (!historico || historico.length === 0) return null;

  const inicio = agora - dias * 86400000;
  const pontos = [];
  let vigenteNoInicio = null;
  for (const h of historico) {
    const t = new Date(h.capturado_em).getTime();
    if (t < inicio) vigenteNoInicio = Number(h.preco);
    else pontos.push({ t, preco: Number(h.preco) });
  }
  // O preço em vigor quando a janela começou também conta (até o 1º ponto dentro dela).
  if (vigenteNoInicio != null && (pontos.length === 0 || pontos[0].t > inicio)) {
    pontos.unshift({ t: inicio, preco: vigenteNoInicio });
  }

  const segmentos = pontos
    .map((p, i) => ({ preco: p.preco, duracao: (i + 1 < pontos.length ? pontos[i + 1].t : agora) - p.t }))
    .filter((s) => s.duracao > 0)
    .sort((a, b) => a.preco - b.preco);
  if (segmentos.length === 0) return null;

  const total = segmentos.reduce((soma, s) => soma + s.duracao, 0);
  let acumulado = 0;
  for (const s of segmentos) {
    acumulado += s.duracao;
    if (acumulado >= total / 2) return s.preco;
  }
  return segmentos[segmentos.length - 1].preco;
}

function quedaReal(precoAtual, tipico) {
  return tipico != null && Number(precoAtual) <= tipico * (1 - MARGEM_QUEDA_REAL);
}

// Exige rastreamento desde pelo menos `dias` atrás (historico[0] é o ponto
// mais antigo — fetchHistoricoTodos já vem ordenado capturado_em.asc) —
// sem isso, um produto recém-adicionado bateria "recorde" trivialmente por
// falta de dado pra desmentir, mesmo sem nunca ter sido comparado de
// verdade contra o período inteiro configurado no badge.
export function ehMenorPrecoEmDias(produto, dias, historicoPorProduto) {
  const historico = historicoPorProduto.get(produto.id);
  if (!historico || historico.length === 0) return false;

  const desde = Date.now() - dias * 86400000;
  const rastreadoDesde = new Date(historico[0].capturado_em).getTime();
  if (rastreadoDesde > desde) return false;

  const precosNoPeriodo = historico
    .filter((h) => new Date(h.capturado_em).getTime() >= desde)
    .map((h) => Number(h.preco));

  if (precosNoPeriodo.length === 0) return false;
  const minimo = Math.min(...precosNoPeriodo);
  const maximo = Math.max(...precosNoPeriodo);
  // Sem variação real no período, todo preço é "o menor" por não ter contra
  // quem perder — mesma armadilha do aviso de maior preço histórico.
  if (minimo === maximo) return false;
  if (Number(produto.preco) > minimo) return false;
  // Voltar ao preço normal depois de um pico não é "menor preço": precisa estar
  // de fato abaixo do que o produto costuma custar no período.
  return quedaReal(produto.preco, precoTipico(historico, dias));
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

// Preço "de" do de/por no card: o preço TÍPICO dos últimos `dias` (ver
// precoTipico), só quando o preço atual está de fato abaixo dele (queda real
// de pelo menos 5%). Antes usava o maior preço do período, o que deixava um
// único pico passageiro virar um "desconto" enorme.
export function precoAnteriorParaExibicao(p, historicoPorProduto, dias = 30) {
  const historico = historicoPorProduto.get(p.id);
  if (!historico || historico.length === 0) return null;

  const tipico = precoTipico(historico, dias);
  return quedaReal(p.preco, tipico) ? tipico : null;
}

// badgesProdutoNovo vem ordenado do menor prazo pro maior — ao contrário da
// de menor preço, aqui o prazo mais curto é o mais forte.
export function badgeProdutoNovo(p, badgesProdutoNovo) {
  return badgesProdutoNovo.find((b) => ehProdutoNovo(p, b.dias)) || null;
}
