/* Service worker del ERP WEDM: siempre pide la versión nueva a la red; si no hay internet, muestra la última copia guardada */
const C='erp-v1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET') return;
  const u=new URL(r.url); if(u.origin!==location.origin) return;       // Supabase y demás: directo a la red
  e.respondWith(fetch(r).then(res=>{ if(res&&res.ok&&(r.mode==='navigate'||/\.(png|webmanifest)$/.test(u.pathname))){ const cp=res.clone(); caches.open(C).then(c=>c.put(r,cp)); } return res; })
    .catch(()=>caches.match(r).then(m=>m||(r.mode==='navigate'?caches.match('index.html'):undefined))));
});
