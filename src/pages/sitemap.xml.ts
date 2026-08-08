import { fetchProdutos } from "../lib/supabase.js";

// Gerado a cada build, com dados frescos da Supabase — ao contrário do
// sitemap.py do scraper antigo (que grava um arquivo fixo, com URLs do site
// velho tipo produto.html?id=X), aqui a URL já sai no formato certo do
// Astro (/produto/123/) e sempre reflete o catálogo do momento do build.
export async function GET() {
  const SITE_URL = "https://lupa3d.com.br";
  const produtos = await fetchProdutos();
  const lojas = [...new Set(produtos.map((p) => p.loja))].sort();

  const urls = [
    `  <url>\n    <loc>${SITE_URL}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    `  <url>\n    <loc>${SITE_URL}/lojas/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`,
    ...lojas.map(
      (nome) =>
        `  <url>\n    <loc>${SITE_URL}/loja/${nome}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.6</priority>\n  </url>`
    ),
    ...produtos.map((p) => {
      const lastmod = p.atualizado_em ? `\n    <lastmod>${p.atualizado_em.slice(0, 10)}</lastmod>` : "";
      return `  <url>\n    <loc>${SITE_URL}/produto/${p.id}/</loc>${lastmod}\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n  </url>`;
    }),
  ];

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join("\n") +
    "\n</urlset>\n";

  return new Response(xml, { headers: { "Content-Type": "application/xml" } });
}
