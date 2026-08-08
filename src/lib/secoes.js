import { ehMenorPrecoEmDias } from "./badges.js";

// Portado de frontend/js/app.js (produtosDaSecaoFiltrados/computarProdutosDaSecao)
// — calculado no build a partir do catálogo e histórico já carregados, em
// vez de sob demanda no navegador a cada visita.
function produtosDaSecaoFiltrados(secao, todosProdutos, historicoPorProduto) {
  const fixados = (secao.produtos_fixados || [])
    .map((id) => todosProdutos.find((p) => p.id === id))
    .filter(Boolean);
  const idsFixados = new Set(fixados.map((p) => p.id));

  const automaticos = todosProdutos.filter((p) => {
    if (idsFixados.has(p.id)) return false;
    if (secao.categoria_filtro && p.categoria !== secao.categoria_filtro) return false;
    if (secao.marca_filtro && p.loja !== secao.marca_filtro) return false;
    if (secao.preco_maximo != null && Number(p.preco) > Number(secao.preco_maximo)) return false;
    if (secao.menor_preco_dias && !ehMenorPrecoEmDias(p, secao.menor_preco_dias, historicoPorProduto)) return false;
    return true;
  });

  if (secao.ordenar_por_cliques) {
    automaticos.sort((a, b) => (b.cliques_total || 0) - (a.cliques_total || 0));
  }

  return [...fixados, ...automaticos];
}

export function computarProdutosDaSecao(secao, todosProdutos, historicoPorProduto) {
  const completos = produtosDaSecaoFiltrados(secao, todosProdutos, historicoPorProduto);
  const grade = secao.layout === "grade";
  const limite = grade ? (secao.colunas || 4) * (secao.linhas || 1) : 12;
  const produtos = completos.slice(0, limite);

  return { produtos, temMais: completos.length > produtos.length };
}
