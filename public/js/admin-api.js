const CHAVE_SESSAO_ADMIN = "lupa3d_admin_session";

function getSessaoAdmin() {
  try {
    const bruto = sessionStorage.getItem(CHAVE_SESSAO_ADMIN);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}

function _salvarSessaoAdmin(sessao) {
  sessionStorage.setItem(CHAVE_SESSAO_ADMIN, JSON.stringify(sessao));
}

function logoutAdmin() {
  sessionStorage.removeItem(CHAVE_SESSAO_ADMIN);
}

async function loginAdmin(email, senha) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.LUPA3D_CONFIG;

  const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });

  const dados = await resp.json();
  if (!resp.ok) {
    throw new Error(dados.error_description || dados.msg || "E-mail ou senha inválidos.");
  }

  _salvarSessaoAdmin({ access_token: dados.access_token, email: dados.user?.email });
  return dados;
}

async function fetchAdmin(caminho, opcoes = {}) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.LUPA3D_CONFIG;
  const sessao = getSessaoAdmin();
  if (!sessao) throw new Error("Não autenticado.");

  return fetch(`${SUPABASE_URL}${caminho}`, {
    ...opcoes,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${sessao.access_token}`,
      "Content-Type": "application/json",
      ...(opcoes.headers || {}),
    },
  });
}
