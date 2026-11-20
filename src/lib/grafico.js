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

  // Eixo X proporcional ao TEMPO (data da coleta), não ao nº da coleta: o
  // scraper roda 1-2x por dia e pula dias, então espaçar por índice
  // esticava/encolhia períodos (um preço de 23 dias ocupava menos espaço que
  // um de 13). Se todas as coletas tiverem o mesmo instante, cai no índice.
  const tempos = pontos.map((p) => new Date(p.capturado_em).getTime());
  const tInicio = tempos[0];
  const duracao = tempos[tempos.length - 1] - tInicio;
  const fracaoX = (i) => (duracao > 0 ? (tempos[i] - tInicio) / duracao : i / (pontos.length - 1));
  const coordX = (i) => margemX + fracaoX(i) * (largura - margemX * 2);
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
    .map((t) => `<line x1="${margemX}" y1="${coordY(t)}" x2="${largura - margemX}" y2="${coordY(t)}" stroke="var(--cor-borda)" stroke-width="1" class="grafico-grade-y"></line>`)
    .join("");

  const linhaMinima = minNormal !== maxNormal
    ? `<line x1="${margemX}" y1="${coordY(minNormal)}" x2="${largura - margemX}" y2="${coordY(minNormal)}" stroke="var(--cor-favorito)" stroke-width="1" stroke-dasharray="3 3" opacity="0.6" class="grafico-linha-minima"></line>`
    : "";

  // Última variação de preço (o ponto onde o preço mudou pela última vez) —
  // é o fato que o gráfico precisa destacar: com o eixo proporcional ao
  // tempo, uma queda de ontem vira um traço de ~1% da largura, quase
  // invisível. Só destaca se foi uma variação de pelo menos 1% e recente
  // (até 60 dias antes do último ponto); senão o gráfico fica poluído com
  // uma mudança que já virou rotina.
  let idxMudanca = -1;
  for (let i = pontos.length - 1; i > 0; i--) {
    if (pontos[i].preco !== pontos[i - 1].preco) {
      idxMudanca = i;
      break;
    }
  }
  let variacaoRecente = null;
  if (idxMudanca > 0) {
    const antes = pontos[idxMudanca - 1].preco;
    const depois = pontos[idxMudanca].preco;
    const pct = (depois - antes) / antes;
    const recente = tempos[tempos.length - 1] - tempos[idxMudanca] <= 60 * 86400000;
    if (antes > 0 && Math.abs(pct) >= 0.01 && recente) {
      variacaoRecente = { idx: idxMudanca, antes, depois, queda: depois < antes, pct };
    }
  }
  const idxVariacao = variacaoRecente ? variacaoRecente.idx : -1;
  const ultimoIdx = pontos.length - 1;
  const ultimoIndicePix = temPix
    ? [...pontos].reverse().findIndex((p) => p.preco_pix != null)
    : -1;
  const idxUltimoPix = ultimoIndicePix >= 0 ? pontos.length - 1 - ultimoIndicePix : -1;

  // Marca visível só nos pontos onde o preço realmente mudou (+ primeiro e
  // último) — evita uma trilha de pontinhos grudados quando o scraper
  // reconfirma o mesmo preço em dias seguidos. O ponto ainda existe pro
  // tooltip (área invisível maior), só não ganha um círculo próprio.
  // O ponto atual e o da variação recente são desenhados em HTML (marcadores
  // abaixo): o SVG estica só na horizontal (preserveAspectRatio="none") e
  // achatava esses círculos numa fatia quase invisível.
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
      const corPonto = ehMenorPreco ? "var(--cor-favorito)" : "var(--cor-marca)";
      const atributosAtual = ehUltimo ? ` stroke="var(--cor-card)" stroke-width="2"` : "";
      const marcador = mudouPreco && !ehUltimo && i !== idxVariacao
        ? `<circle cx="${x}" cy="${y}" r="3" fill="${corPonto}"${atributosAtual} class="grafico-ponto${ehMenorPreco ? " grafico-ponto-minimo" : ""}">${tooltip}</circle>`
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
          const marcador = mudouPreco && i !== idxUltimoPix
            ? `<circle cx="${x}" cy="${y}" r="2.5" fill="var(--cor-pix)" class="grafico-ponto-pix">${tooltip}</circle>`
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
  // Marcos igualmente espaçados NO TEMPO (como a linha agora é proporcional
  // ao tempo, espaçamento igual = intervalo de dias igual). Poucos dias de
  // histórico → menos marcos, pra não repetir a mesma data.
  const diasNoPeriodo = Math.floor(duracao / 86400000) + 1;
  const quantidadeDatas = duracao > 0 ? Math.min(5, Math.max(2, diasNoPeriodo)) : Math.min(5, pontos.length);
  const eixoX = Array.from({ length: quantidadeDatas }, (_, i) => {
    const instante = duracao > 0
      ? tInicio + (i / (quantidadeDatas - 1)) * duracao
      : tempos[Math.round((i / (quantidadeDatas - 1 || 1)) * (pontos.length - 1))];
    return `<span>${new Date(instante).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>`;
  }).join("");

  const eixoY = minNormal !== maxNormal
    ? `<div class="grafico-eixo-y">${[...ticks].reverse().map((t) => `<span style="top:${(coordY(t) / altura) * 100}%">${formatarEixo(t)}</span>`).join("")}</div>`
    : "";

  // Preços flutuantes sobre o próprio gráfico (início da linha + fim da
  // linha normal/Pix) — posicionados em % de X (o SVG estica horizontalmente
  // por fora do viewBox 560, então px cru não bateria) e px de Y (a altura é
  // fixa em 260px = mesma unidade do viewBox, então bate 1 pra 1).
  const xPercent = (i) => (coordX(i) / largura) * 100;
  // Y em % da altura (não px): o modal de "Expandir" estica o gráfico pra 320px
  // e a posição em px deixava marcadores/etiquetas fora do lugar.
  const yPercent = (preco) => (coordY(preco) / altura) * 100;

  const ultimoPonto = pontos[ultimoIdx];
  const ehMenorAtual = ultimoPonto.preco === minNormal && minNormal !== maxNormal;
  const marcadores = `
    <span class="grafico-marcador grafico-marcador-atual${ehMenorAtual ? " grafico-marcador-minimo" : ""}" style="left:${xPercent(ultimoIdx)}%; top:${yPercent(ultimoPonto.preco)}%"></span>
    ${idxUltimoPix >= 0 ? `<span class="grafico-marcador grafico-marcador-pix" style="left:${xPercent(idxUltimoPix)}%; top:${yPercent(pontos[idxUltimoPix].preco_pix)}%"></span>` : ""}
    ${variacaoRecente ? `<span class="grafico-marcador grafico-marcador-variacao ${variacaoRecente.queda ? "grafico-marcador-queda" : "grafico-marcador-alta"}" style="left:${xPercent(idxVariacao)}%; top:${yPercent(variacaoRecente.depois)}%"></span>` : ""}
  `;

  // Selo da última variação ("−31% em 20/11"): fica acima do degrau, alinhado à
  // direita do ponto (ou à esquerda dele se a variação for logo no começo).
  let seloVariacao = "";
  if (variacaoRecente) {
    const pctTexto = `${variacaoRecente.queda ? "−" : "+"}${Math.abs(Math.round(variacaoRecente.pct * 100))}%`;
    const dataVariacao = new Date(pontos[idxVariacao].capturado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const noComeco = xPercent(idxVariacao) < 30;
    seloVariacao = `<div class="grafico-selo-variacao ${variacaoRecente.queda ? "grafico-selo-queda" : "grafico-selo-alta"}${noComeco ? " grafico-selo-esquerda" : ""}" style="left:${xPercent(idxVariacao)}%; top:${yPercent(Math.max(variacaoRecente.antes, variacaoRecente.depois))}%">${pctTexto} em ${dataVariacao}</div>`;
  }

  const trechoRecente = variacaoRecente
    ? `<line x1="${coordX(idxVariacao - 1)}" y1="${coordY(variacaoRecente.antes)}" x2="${coordX(idxVariacao)}" y2="${coordY(variacaoRecente.depois)}" class="grafico-trecho-recente ${variacaoRecente.queda ? "grafico-trecho-queda" : "grafico-trecho-alta"}" stroke-linecap="round"></line>`
    : "";

  const precosFlutuantes = `
    <div class="grafico-preco-inicial" style="left:${xPercent(0)}%; top:${yPercent(pontos[0].preco)}%">${formatarPreco(pontos[0].preco)}</div>
    <div class="grafico-preco-final grafico-preco-final-normal" style="left:${xPercent(pontos.length - 1)}%; top:${yPercent(pontos[pontos.length - 1].preco)}%">${formatarPreco(pontos[pontos.length - 1].preco)}</div>
    ${idxUltimoPix >= 0 ? `<div class="grafico-preco-final grafico-preco-final-pix" style="left:${xPercent(idxUltimoPix)}%; top:${yPercent(pontos[idxUltimoPix].preco_pix)}%">${formatarPreco(pontos[idxUltimoPix].preco_pix)}</div>` : ""}
    ${marcadores}
    ${seloVariacao}
  `;

  const dataInicial = new Date(pontos[0].capturado_em).toLocaleDateString("pt-BR");

  // Data em que cada extremo (min/max) foi registrado — pega a primeira
  // ocorrência na série, não necessariamente a mais recente.
  const dataDoValor = (valor) => {
    const ponto = pontos.find((p) => p.preco === valor);
    return ponto ? new Date(ponto.capturado_em).toLocaleDateString("pt-BR") : null;
  };
  const dataMenor = dataDoValor(minNormal);
  const dataMaior = dataDoValor(maxNormal);

  const legenda = minNormal === maxNormal
    ? `<div class="grafico-legendas grafico-legendas-unica"><span>Acompanhando desde ${dataInicial} — sem variação de preço</span></div>`
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
          ${gradeY}
          ${linhaMinima}
          <path d="${areaPath}" fill="var(--cor-marca)" fill-opacity="0.05" class="grafico-area"></path>
          ${temPix ? `<polyline points="${linhaPix}" fill="none" stroke="var(--cor-pix)" stroke-width="2" stroke-dasharray="4 3" class="grafico-linha-pix"></polyline>` : ""}
          <polyline points="${linha}" fill="none" stroke="var(--cor-marca)" stroke-width="2" class="grafico-linha"></polyline>
          ${trechoRecente}
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
