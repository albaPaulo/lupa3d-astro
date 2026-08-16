const CHAVE_FAVORITOS = "lupa3d_favoritos";
const CHAVE_COMPARACAO = "lupa3d_comparacao";
const CHAVE_ALVOS = "lupa3d_alvos";
const MAX_COMPARACAO = 4;

function _lerLista(chave) {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : [];
  } catch {
    return [];
  }
}

function _salvarLista(chave, lista) {
  localStorage.setItem(chave, JSON.stringify(lista));
}

function getFavoritos() {
  return _lerLista(CHAVE_FAVORITOS);
}

function isFavorito(id) {
  return getFavoritos().includes(id);
}

function toggleFavorito(id) {
  const lista = getFavoritos();
  const idx = lista.indexOf(id);
  if (idx === -1) {
    lista.push(id);
  } else {
    lista.splice(idx, 1);
  }
  _salvarLista(CHAVE_FAVORITOS, lista);
  return lista.includes(id);
}

// Soma aos favoritos já existentes (usado ao abrir um link de favoritos
// compartilhado, ex: ?favoritos=1,2,3) — ao contrário da comparação, aqui não
// faz sentido substituir a lista inteira e apagar os favoritos de quem abriu.
function adicionarFavoritos(ids) {
  const lista = getFavoritos();
  for (const id of ids) {
    if (!lista.includes(id)) lista.push(id);
  }
  _salvarLista(CHAVE_FAVORITOS, lista);
  return lista;
}

function _lerObjeto(chave) {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : {};
  } catch {
    return {};
  }
}

function getAlvos() {
  return _lerObjeto(CHAVE_ALVOS);
}

function getAlvo(id) {
  const valor = getAlvos()[id];
  return valor != null ? Number(valor) : null;
}

// Definir um alvo também favorita o produto — é a página de favoritos que
// faz a checagem toda vez que o usuário volta, então precisa estar nela pra
// o alvo ter efeito (evita manter uma segunda lista de "produtos rastreados"
// em paralelo aos favoritos).
function definirAlvo(id, preco) {
  const alvos = getAlvos();
  alvos[id] = preco;
  localStorage.setItem(CHAVE_ALVOS, JSON.stringify(alvos));
  if (!isFavorito(id)) toggleFavorito(id);
}

function removerAlvo(id) {
  const alvos = getAlvos();
  delete alvos[id];
  localStorage.setItem(CHAVE_ALVOS, JSON.stringify(alvos));
}

function getComparacao() {
  return _lerLista(CHAVE_COMPARACAO);
}

function isNaComparacao(id) {
  return getComparacao().includes(id);
}

// Retorna { adicionado: bool, cheio: bool }
function toggleComparacao(id) {
  const lista = getComparacao();
  const idx = lista.indexOf(id);

  if (idx !== -1) {
    lista.splice(idx, 1);
    _salvarLista(CHAVE_COMPARACAO, lista);
    return { adicionado: false, cheio: false };
  }

  if (lista.length >= MAX_COMPARACAO) {
    return { adicionado: false, cheio: true };
  }

  lista.push(id);
  _salvarLista(CHAVE_COMPARACAO, lista);
  return { adicionado: true, cheio: lista.length >= MAX_COMPARACAO };
}

function limparComparacao() {
  _salvarLista(CHAVE_COMPARACAO, []);
}

// Substitui a comparação inteira (usado ao abrir um link de comparação
// compartilhado, ex: ?comparar=1,2,3) em vez de alternar item por item.
function definirComparacao(ids) {
  const lista = [...new Set(ids)].slice(0, MAX_COMPARACAO);
  _salvarLista(CHAVE_COMPARACAO, lista);
  return lista;
}
