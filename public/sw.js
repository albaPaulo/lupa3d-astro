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

// Alerta de preço via push: o scraper (server) envia um payload JSON
// {titulo, corpo, url} quando um produto favoritado chega no preço-alvo.
self.addEventListener("push", (event) => {
  let dados = { titulo: "LUPA3D", corpo: "Um produto favoritado chegou no preço-alvo!", url: "/favoritos/" };
  try {
    if (event.data) dados = { ...dados, ...event.data.json() };
  } catch {
    // payload sem JSON válido — mantém o texto padrão em vez de falhar.
  }
  event.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: dados.url },
    })
  );
});

// Clique na notificação leva direto pro produto (ou reaproveita uma aba já
// aberta do site em vez de abrir uma nova).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const cliente of lista) {
        if (cliente.url.includes(self.location.origin) && "focus" in cliente) {
          cliente.navigate(url);
          return cliente.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
