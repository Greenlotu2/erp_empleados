// Service worker de la PWA móvil (scope /movil/). Por ahora solo maneja las
// notificaciones push: las muestra aunque la app esté cerrada y, al tocarlas,
// abre (o enfoca) la pantalla correspondiente.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let aviso = {};
  try {
    aviso = event.data ? event.data.json() : {};
  } catch {
    aviso = { titulo: "Rocal", cuerpo: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    self.registration.showNotification(aviso.titulo || "Rocal", {
      body: aviso.cuerpo || "",
      icon: "/icono_rocal.png",
      badge: "/icono_rocal.png",
      tag: aviso.etiqueta || undefined,
      renotify: Boolean(aviso.etiqueta),
      data: { url: aviso.url || "/movil" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/movil", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      // Si la app ya está abierta, la reutiliza en vez de abrir otra.
      for (const v of ventanas) {
        if (v.url.startsWith(self.location.origin + "/movil") && "focus" in v) {
          v.navigate(url);
          return v.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
