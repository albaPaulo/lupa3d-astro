// Service Worker mínimo — existe só pra habilitar "Adicionar à tela inicial"
// no Android/Chrome, que exige um SW com handler de fetch pra mostrar o
// prompt de instalação. Sem cache nenhum: os preços mudam todo dia, então
// guardar página/API em cache seria ativamente ruim (mostraria preço velho
// pra quem instalou o app) — cada navegação sempre busca a versão mais
// recente direto da rede.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
