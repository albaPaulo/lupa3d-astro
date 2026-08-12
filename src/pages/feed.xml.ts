import { fetchProdutos, fetchHistoricoTodos, buildHistoricoPorProduto, formatarPreco } from "../lib/supabase.js";
import { precoAnteriorParaExibicao } from "../lib/badges.js";

function escapeXml(texto: string): string {
  const mapa: Record<string, string> = { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" };
  return String(texto).replace(/[<>&'"]/g, (c) => mapa[c]);
}

// Só entra no feed quem teve queda de preço REAL registrada no histórico nos
// últimos 30 dias (mesma função que já gera o "de/por" nos cards) — nada de
// "menor preço" trivial por falta de histórico, que inflaria o feed com
// produto novo sem queda nenhuma.
export async function GET() {
  const SITE_URL = "https://lupa3d.com.br";
  const [produtos, historicoTodos] = await Promise.all([fetchProdutos(), fetchHistoricoTodos()]);
  const historicoPorProduto = buildHistoricoPorProduto(historicoTodos);

  const comQueda = produtos
    .map((p) => ({ produto: p, precoAnterior: precoAnteriorParaExibicao(p, historicoPorProduto, 30) }))
    .filter((item): item is { produto: typeof produtos[number]; precoAnterior: number } => item.precoAnterior != null)
    .sort((a, b) => (b.precoAnterior - b.produto.preco) / b.precoAnterior - (a.precoAnterior - a.produto.preco) / a.precoAnterior)
    .slice(0, 50);

  const items = comQueda.map(({ produto: p, precoAnterior }) => {
    const desconto = Math.round((1 - Number(p.preco) / precoAnterior) * 100);
    const link = `${SITE_URL}/produto/${p.id}/`;
    const pubDate = (p.atualizado_em ? new Date(p.atualizado_em) : new Date()).toUTCString();
    return `  <item>
    <title>${escapeXml(`${p.nome} — ${desconto}% OFF (${formatarPreco(p.preco)} na ${p.loja})`)}</title>
    <link>${link}</link>
    <guid>${link}</guid>
    <pubDate>${pubDate}</pubDate>
    <description>${escapeXml(`De ${formatarPreco(precoAnterior)} por ${formatarPreco(p.preco)} na ${p.loja}.`)}</description>
  </item>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>LUPA3D — Quedas de preço em filamento e resina 3D</title>
  <link>${SITE_URL}/</link>
  <description>Produtos com queda de preço recente, comparados entre várias lojas brasileiras.</description>
  <language>pt-BR</language>
${items.join("\n")}
</channel>
</rss>
`;

  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
