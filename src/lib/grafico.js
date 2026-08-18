import { formatarPreco } from "./supabase.js";

// Gera ~4 valores "redondos" (10, 20, 25, 50, 100...) entre min e max pra
// servir de linha de grade do eixo Y — mesma lógica que bibliotecas de
// gráfico usam pra não mostrar eixo tipo "R$133,42 / R$147,88".
function calcularTicks(min, max, quantidade = 4) {
  const faixa = max - min || 1;
  const passoBruto = faixa / (quantidade - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(passoBruto)));
  const residual = passoBruto / magnitude;
  let passo;
  if (residual > 5) passo = 10 * magnitude;
  else if (residual > 2) passo = 5 * magnitude;
  else if (residual > 1) passo = 2 * magnitude;
  else passo = magnitude;

  const inicio = Math.floor(min / passo) * passo;
  const fim = Math.ceil(max / passo) * passo;
  const ticks = [];
  for (let v = inicio; v <= fim + passo * 0.001; v += passo) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

function formatarEixo(valor) {
  return `R$ ${Math.round(valor).toLocaleString("pt-BR")}`;
}

// Portado quase igual de frontend/js/produto.js (desenharGraficoSVG) — roda
// no build em vez de no navegador, mas a função em si é pura (recebe pontos,
// devolve uma string de HTML/SVG), então não precisou mudar quase nada.
export function desenharGraficoSVG(pontos) {
  if (pontos.length < 2) {
    return `<p class="grafico-vazio">Ainda não há histórico suficiente — volte em alguns dias para ver a evolução do preço.</p>`;
  }

  const largura = 560;
  const altura = 260;
  const margemX = 12;
  const margemTopo = 12;
  const margemBaixo = 14;

  const precosNormais = pontos.map((p) => p.preco);
  const minNormal = Math.min(...precosNormais);
  const maxNormal = Math.max(...precosNormais);

  const pontosComPix = pontos.filter((p) => p.preco_pix != null);
  const temPix = pontosComPix.length >= 2;

  const todosOsPrecos = temPix ? [...precosNormais, ...pontosComPix.map((p) => p.preco_pix)] : precosNormais;
  const escalaMinBruta = Math.min(...todosOsPrecos);
  const escalaMaxBruta = Math.max(...todosOsPrecos);

  // Eixo Y usa a faixa "arredondada" dos ticks (com uma folga em cima/baixo
  // da linha), não o min/max cru — assim a linha nunca encosta na borda.
  const ticks = calcularTicks(escalaMinBruta, escalaMaxBruta, 4);
  const escalaMin = Math.min(escalaMinBruta, ticks[0]);
  const escalaMax = Math.max(escalaMaxBruta, ticks[ticks.length - 1]);
  const faixa = escalaMax - escalaMin || 1;

  const coordX = (i) => margemX + (i / (pontos.length - 1)) * (largura - margemX * 2);
  const coordY = (preco) => altura - margemBaixo - ((preco - escalaMin) / faixa) * (altura - margemTopo - margemBaixo);

  const pontosLinha = pontos.map((p, i) => `${coordX(i)},${coordY(p.preco)}`);
  const linha = pontosLinha.join(" ");

  const linhaPix = temPix
    ? pontos
        .map((p, i) => (p.preco_pix != null ? `${coordX(i)},${coordY(p.preco_pix)}` : null))
        .filter(Boolean)
        .join(" ")
    : "";

  const baseY = altura - margemBaixo;
  const areaPath = `M${pontosLinha[0]} L${pontosLinha.join(" L")} L${coordX(pontos.length - 1)},${baseY} L${coordX(0)},${baseY} Z`;

  const gradeY = ticks
    .map((t) => `<line x1="${margemX}" y1="${coordY(t)}" x2="${largura - margemX}" y2="${coordY(t)}" class="grafico-grade-y"></line>`)
    .join("");

  const linhaMinima = minNormal !== maxNormal
    ? `<line x1="${margemX}" y1="${coordY(minNormal)}" x2="${largura - margemX}" y2="${coordY(minNormal)}" class="grafico-linha-minima"></line>`
    : "";

  // Marca visível só nos pontos onde o preço realmente mudou (+ primeiro e
  // último) — evita uma trilha de pontinhos grudados quando o scraper
  // reconfirma o mesmo preço em dias seguidos. O ponto ainda existe pro
  // tooltip (área invisível maior), só não ganha um círculo próprio.
  const pontosCirculo = pontos
    .map((p, i) => {
      const x = coordX(i);
      const y = coordY(p.preco);
      const data = new Date(p.capturado_em).toLocaleDateString("pt-BR");
      const ehMenorPreco = p.preco === minNormal;
      const ehUltimo = i === pontos.length - 1;
      const mudouPreco = i === 0 || i === pontos.length - 1 || p.preco !== pontos[i - 1].preco;
      const detalhePix = p.preco_pix != null ? ` (${formatarPreco(p.preco_pix)} no Pix)` : "";
      const tooltip = `<title>${formatarPreco(p.preco)}${detalhePix} — ${data}${ehMenorPreco ? " — menor preço já registrado" : ""}</title>`;
      const marcador = mudouPreco
        ? `<circle cx="${x}" cy="${y}" r="${ehUltimo ? 5 : 3}" class="grafico-ponto${ehMenorPreco ? " grafico-ponto-minimo" : ""}${ehUltimo ? " grafico-ponto-atual" : ""}">${tooltip}</circle>`
        : "";
      return `
        <circle cx="${x}" cy="${y}" r="9" fill="transparent" class="grafico-ponto-area">${tooltip}</circle>
        ${marcador}
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
          const anterior = pontos[i - 1];
          const mudouPreco = i === 0 || i === pontos.length - 1 || !anterior || anterior.preco_pix !== p.preco_pix;
          const tooltip = `<title>${formatarPreco(p.preco_pix)} no Pix — ${data}</title>`;
          const marcador = mudouPreco
            ? `<circle cx="${x}" cy="${y}" r="2.5" class="grafico-ponto-pix">${tooltip}</circle>`
            : "";
          return `
            <circle cx="${x}" cy="${y}" r="8" fill="transparent" class="grafico-ponto-area">${tooltip}</circle>
            ${marcador}
          `;
        })
        .join("")
    : "";

  // Datas do eixo X: até 5 marcos espalhados (não só início/fim) — ficam
  // fora do SVG (linha flex simples) pra não distorcer texto quando o
  // gráfico estica horizontalmente pra caber na coluna.
  const quantidadeDatas = Math.min(5, pontos.length);
  const indicesDatas = Array.from({ length: quantidadeDatas }, (_, i) =>
    Math.round((i / (quantidadeDatas - 1 || 1)) * (pontos.length - 1))
  ).filter((v, i, arr) => arr.indexOf(v) === i);
  const eixoX = indicesDatas
    .map((i) => `<span>${new Date(pontos[i].capturado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>`)
    .join("");

  const eixoY = minNormal !== maxNormal
    ? `<div class="grafico-eixo-y">${[...ticks].reverse().map((t) => `<span style="top:${coordY(t)}px">${formatarEixo(t)}</span>`).join("")}</div>`
    : "";

  // Preços flutuantes sobre o próprio gráfico (início da linha + fim da
  // linha normal/Pix) — posicionados em % de X (o SVG estica horizontalmente
  // por fora do viewBox 560, então px cru não bateria) e px de Y (a altura é
  // fixa em 260px = mesma unidade do viewBox, então bate 1 pra 1).
  const xPercent = (i) => (coordX(i) / largura) * 100;
  const ultimoIndicePix = temPix
    ? [...pontos].reverse().findIndex((p) => p.preco_pix != null)
    : -1;
  const idxUltimoPix = ultimoIndicePix >= 0 ? pontos.length - 1 - ultimoIndicePix : -1;

  const precosFlutuantes = `
    <div class="grafico-preco-inicial" style="left:${xPercent(0)}%; top:${coordY(pontos[0].preco)}px">${formatarPreco(pontos[0].preco)}</div>
    <div class="grafico-preco-final grafico-preco-final-normal" style="left:${xPercent(pontos.length - 1)}%; top:${coordY(pontos[pontos.length - 1].preco)}px">${formatarPreco(pontos[pontos.length - 1].preco)}</div>
    ${idxUltimoPix >= 0 ? `<div class="grafico-preco-final grafico-preco-final-pix" style="left:${xPercent(idxUltimoPix)}%; top:${coordY(pontos[idxUltimoPix].preco_pix)}px">${formatarPreco(pontos[idxUltimoPix].preco_pix)}</div>` : ""}
  `;

  const dataInicial = new Date(pontos[0].capturado_em).toLocaleDateString("pt-BR");
  const mediaNormal = precosNormais.reduce((soma, v) => soma + v, 0) / precosNormais.length;

  // Data em que cada extremo (min/max) foi registrado — pega a primeira
  // ocorrência na série, não necessariamente a mais recente.
  const dataDoValor = (valor) => {
    const ponto = pontos.find((p) => p.preco === valor);
    return ponto ? new Date(ponto.capturado_em).toLocaleDateString("pt-BR") : null;
  };
  const dataMenor = dataDoValor(minNormal);
  const dataMaior = dataDoValor(maxNormal);
  const diasAcompanhado = Math.round(
    (new Date(pontos[pontos.length - 1].capturado_em) - new Date(pontos[0].capturado_em)) / 86400000
  );
  const textoPeriodoMedia = diasAcompanhado > 0 ? `Últimos ${diasAcompanhado} dias` : "Hoje";

  const legenda = minNormal === maxNormal
    ? `<div class="grafico-legendas grafico-legendas-unica"><span>Acompanhando desde ${dataInicial} — sem variação de preço ainda</span></div>`
    : `
      <div class="grafico-legendas">
        <div class="grafico-stat grafico-stat-menor">
          <span class="grafico-stat-icone" aria-hidden="true">↓</span>
          <div class="grafico-stat-texto">
            <span class="grafico-stat-label">Menor preço</span>
            <span class="grafico-stat-valor">${formatarPreco(minNormal)}</span>
            ${dataMenor ? `<span class="grafico-stat-data">${dataMenor}</span>` : ""}
          </div>
        </div>
        <div class="grafico-stat grafico-stat-maior">
          <span class="grafico-stat-icone" aria-hidden="true">↑</span>
          <div class="grafico-stat-texto">
            <span class="grafico-stat-label">Maior preço</span>
            <span class="grafico-stat-valor">${formatarPreco(maxNormal)}</span>
            ${dataMaior ? `<span class="grafico-stat-data">${dataMaior}</span>` : ""}
          </div>
        </div>
        <div class="grafico-stat grafico-stat-media">
          <span class="grafico-stat-icone" aria-hidden="true">≈</span>
          <div class="grafico-stat-texto">
            <span class="grafico-stat-label">Preço médio</span>
            <span class="grafico-stat-valor">${formatarPreco(mediaNormal)}</span>
            <span class="grafico-stat-data">${textoPeriodoMedia}</span>
          </div>
        </div>
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
    <div class="grafico-plot">
      ${eixoY}
      <div class="grafico-svg-wrap">
        <svg viewBox="0 0 ${largura} ${altura}" class="grafico-historico" preserveAspectRatio="none">
          <defs>
            <linearGradient id="grafico-area-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--cor-marca)" stop-opacity="0.18"/>
              <stop offset="100%" stop-color="var(--cor-marca)" stop-opacity="0"/>
            </linearGradient>
          </defs>
          ${gradeY}
          ${linhaMinima}
          <path d="${areaPath}" fill="url(#grafico-area-fill)" class="grafico-area"></path>
          ${temPix ? `<polyline points="${linhaPix}" class="grafico-linha-pix"></polyline>` : ""}
          <polyline points="${linha}" class="grafico-linha"></polyline>
          ${pontosCirculoPix}
          ${pontosCirculo}
        </svg>
        ${precosFlutuantes}
      </div>
    </div>
    <div class="grafico-eixo-x">${eixoX}</div>
    ${legendaSeries}
    ${legenda}
  `;
}
