/* Service worker del ERP Grupo WEDM: siempre intenta la red primero (para ver la versión más nueva)
   y usa la copia guardada solo si no hay conexión. No toca Supabase ni otros dominios. */
const V = 'erp-v1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('erp-') && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;
  e.respondWith(
    fetch(r).then(res => {
      if (res && res.ok) { const c = res.clone(); caches.open(V).then(ca => ca.put(r, c)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(r).then(m => m || Response.error()))
  );
});
