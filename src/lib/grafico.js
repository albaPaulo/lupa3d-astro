import { formatarPreco } from "./supabase.js";

// Portado quase igual de frontend/js/produto.js (desenharGraficoSVG) — roda
// no build em vez de no navegador, mas a função em si é pura (recebe pontos,
// devolve uma string de SVG), então não precisou mudar quase nada.
export function desenharGraficoSVG(pontos) {
  if (pontos.length < 2) {
    return `<p class="grafico-vazio">Ainda não há histórico suficiente — volte em alguns dias para ver a evolução do preço.</p>`;
  }

  const largura = 560;
  const altura = 280;
  const margem = 24;

  const precosNormais = pontos.map((p) => p.preco);
  const minNormal = Math.min(...precosNormais);
  const maxNormal = Math.max(...precosNormais);

  const pontosComPix = pontos.filter((p) => p.preco_pix != null);
  const temPix = pontosComPix.length >= 2;

  const todosOsPrecos = temPix ? [...precosNormais, ...pontosComPix.map((p) => p.preco_pix)] : precosNormais;
  const escalaMin = Math.min(...todosOsPrecos);
  const escalaMax = Math.max(...todosOsPrecos);
  const faixa = escalaMax - escalaMin || 1;

  const coordX = (i) => margem + (i / (pontos.length - 1)) * (largura - margem * 2);
  const coordY = (preco) => altura - margem - ((preco - escalaMin) / faixa) * (altura - margem * 2);

  const linha = pontos.map((p, i) => `${coordX(i)},${coordY(p.preco)}`).join(" ");

  const linhaPix = temPix
    ? pontos
        .map((p, i) => (p.preco_pix != null ? `${coordX(i)},${coordY(p.preco_pix)}` : null))
        .filter(Boolean)
        .join(" ")
    : "";

  const linhaMinima = minNormal !== maxNormal
    ? `<line x1="${margem}" y1="${coordY(minNormal)}" x2="${largura - margem}" y2="${coordY(minNormal)}" class="grafico-linha-minima"></line>`
    : "";

  const pontosCirculo = pontos
    .map((p, i) => {
      const x = coordX(i);
      const y = coordY(p.preco);
      const data = new Date(p.capturado_em).toLocaleDateString("pt-BR");
      const ehMenorPreco = p.preco === minNormal;
      const detalhePix = p.preco_pix != null ? ` (${formatarPreco(p.preco_pix)} no Pix)` : "";
      const tooltip = `<title>${formatarPreco(p.preco)}${detalhePix} — ${data}${ehMenorPreco ? " — menor preço já registrado" : ""}</title>`;
      return `
        <circle cx="${x}" cy="${y}" r="9" fill="transparent" class="grafico-ponto-area">${tooltip}</circle>
        <circle cx="${x}" cy="${y}" r="3" class="grafico-ponto${ehMenorPreco ? " grafico-ponto-minimo" : ""}">${tooltip}</circle>
      `;
    })
    .join("");

  const pontosCirculoPix = temPix
    ? pontos
        .map((p, i) => {
          if (p.preco_pix == null) return "";
          const x = coordX(i);
          const y = coordY(p.preco_pix);
          const data = new Date(p.capturado_em).toLocaleDateString("pt-BR");
          const tooltip = `<title>${formatarPreco(p.preco_pix)} no Pix — ${data}</title>`;
          return `
            <circle cx="${x}" cy="${y}" r="8" fill="transparent" class="grafico-ponto-area">${tooltip}</circle>
            <circle cx="${x}" cy="${y}" r="2.5" class="grafico-ponto-pix">${tooltip}</circle>
          `;
        })
        .join("")
    : "";

  const dataInicial = new Date(pontos[0].capturado_em).toLocaleDateString("pt-BR");
  const dataFinal = new Date(pontos[pontos.length - 1].capturado_em).toLocaleDateString("pt-BR");

  const legenda = minNormal === maxNormal
    ? `<div class="grafico-legendas grafico-legendas-unica"><span>Acompanhando desde ${dataInicial} — sem variação de preço ainda</span></div>`
    : `
      <div class="grafico-legendas">
        <span>${dataInicial}</span>
        <span>${formatarPreco(minNormal)} — ${formatarPreco(maxNormal)}</span>
        <span>${dataFinal}</span>
      </div>
    `;

  const legendaSeries = temPix
    ? `
      <div class="grafico-legenda-series">
        <span class="grafico-legenda-item"><span class="grafico-legenda-cor grafico-legenda-cor-normal"></span>Preço normal</span>
        <span class="grafico-legenda-item"><span class="grafico-legenda-cor grafico-legenda-cor-pix"></span>Preço Pix</span>
      </div>
    `
    : "";

  return `
    <svg viewBox="0 0 ${largura} ${altura}" class="grafico-historico" preserveAspectRatio="none">
      ${linhaMinima}
      ${temPix ? `<polyline points="${linhaPix}" class="grafico-linha-pix"></polyline>` : ""}
      <polyline points="${linha}" class="grafico-linha"></polyline>
      ${pontosCirculoPix}
      ${pontosCirculo}
    </svg>
    ${legenda}
    ${legendaSeries}
  `;
}
