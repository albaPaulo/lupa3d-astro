// Mesma anon key pública usada em src/lib/supabase.js (build-time) — aqui é
// usada só pra buscar os produtos selecionados quando o modal de comparação
// abre (a navegação/listagem normal já vem pronta do build, sem fetch).
window.LUPA3D_CONFIG = {
  SUPABASE_URL: "https://ilsrwxqelasqarszdwqi.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_TOSsLFoeIquhRUbJndyVHw_SywCmBbV",
  // Chave pública VAPID do alerta de preço via push — a privada fica só no
  // scraper (.env, fora do git), usada pra assinar o envio do push.
  VAPID_PUBLIC_KEY: "BF4cAwfYzSXXGwMy9lcot_27Y4tDNrz6zLE-KOqz37BsR-gDKqx2erXZiRojQ2YDMyUZP4MXGHO7UpR4J1kQRiY",
};
