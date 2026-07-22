/* Service Worker do Adverse OS — só notificações.
 *
 * É ele que recebe o Web Push mesmo com o site FECHADO (o navegador acorda o
 * SW). Sem service worker, o balão só apareceria com a aba aberta.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// O Chrome só oferece "instalar app" se o SW tiver um handler de fetch. Aqui é
// só repasse (não fazemos cache offline) — existe pra tornar o app instalável,
// que é o que faz o push chegar no celular (no iPhone, só instalado funciona).
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = { titulo: "Adverse OS", corpo: event.data ? event.data.text() : "" };
  }

  const titulo = dados.titulo || "Adverse OS";
  const critico = dados.prioridade === "critico";

  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: dados.corpo || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // FICA NA TELA até a pessoa dispensar/clicar. Antes só a "crítica" ficava
      // e o resto sumia em segundos — era o "chega, mas passa despercebida".
      requireInteraction: true,
      vibrate: critico ? [200, 100, 200] : [120],
      // Tag ÚNICA por notificação (o id que o servidor manda). Com a tag pelo
      // tipo, a 2ª do mesmo tipo substituía a 1ª em SILÊNCIO — "funcionou uma
      // vez e depois não". renotify:true garante o alerta mesmo se repetir.
      tag: dados.tag || dados.tipo || "adverse",
      renotify: true,
      data: { link: dados.link || "/notificacoes" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/notificacoes";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientes) => {
      // Já tem uma aba do sistema aberta? foca e navega nela.
      for (const c of clientes) {
        if (c.url.includes(self.location.origin) && "focus" in c) {
          c.navigate(link);
          return c.focus();
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});
