// Service Worker mínimo — existe só pra habilitar "Adicionar à tela inicial"
// no Android/Chrome, que exige um SW com handler de fetch pra mostrar o
// prompt de instalação. Sem cache de conteúdo: os preços mudam todo dia,
// então guardar página/API em cache seria ativamente ruim (mostraria preço
// velho pra quem instalou o app) — cada navegação sempre busca a versão mais
// recente direto da rede. A ÚNICA coisa em cache é a página estática de "sem
// conexão", só pra não cair na tela de erro feia padrão do navegador quando
// abrir o app instalado sem internet.
const CACHE_OFFLINE = "lupa3d-offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_OFFLINE).then((cache) => cache.add("/offline.html")));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request).catch((erro) => {
      // Só troca pela página de offline em navegação de página inteira —
      // uma imagem/API que falhar sem internet continua falhando normal,
      // sem isso o navegador ficaria tentando "consertar" todo recurso
      // quebrado com a tela de offline no lugar.
      if (event.request.mode === "navigate") return caches.match("/offline.html");
      throw erro;
    })
  );
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
