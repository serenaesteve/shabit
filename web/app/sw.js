// Service worker de shabit: guarda la app para que funcione sin conexión.
// Al cambiar cualquier archivo, sube VERSION para que los iPhone descarguen la nueva.
const VERSION = "shabit-app-11";
const ARCHIVOS = [
  "./", "index.html", "app.css", "manifest.webmanifest",
  "js/main.js", "js/almacen.js", "js/fecha.js", "js/progreso.js", "js/pasos.js", "js/dibujo.js", "js/vistas.js", "js/demo.js", "js/iconos.js", "js/logros.js", "js/rutinas.js", "js/avisos.js", "js/nube.js", "js/extras.js", "js/qrcode.js",
  "img/icono-180.png", "img/icono-192.png", "img/icono-512.png",
  "../fuentes/nunito.woff2", "icono.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Primero la red (para recibir cambios) y, sin conexión, lo guardado.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // La API (datos en SBD, recordatorios) va siempre a la red: nunca se guarda ni se inventa.
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))),
  );
});

// Recordatorios: el servidor manda { titulo, texto, url } y aquí se muestra la notificación.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { texto: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "shabit", {
    body: d.texto || "Tienes hábitos pendientes.",
    icon: "img/icono-192.png",
    badge: "img/icono-192.png",
    tag: d.etiqueta || "shabit",
    data: { url: d.url || "./#/hoy" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = new URL(e.notification.data?.url || "./#/hoy", self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) if (v.url.startsWith(self.registration.scope)) { v.navigate(destino); return v.focus(); }
      return self.clients.openWindow(destino);
    }),
  );
});
