/* Service worker del ERP WEDM v2: guarda la aplicación para abrirla sin internet.
   Páginas y archivos propios: pide primero la red y, si no hay, usa la copia guardada.
   Librerías externas (cdnjs, jsdelivr, fuentes): copia guardada primero. Supabase y demás: directo a la red. */
const C='erp-v2';
const PAGES=['index.html','COMERCIAL.html','DISENO.html','COMPRAS.html','REMISIONES.html','PLANEACION.html','CALIDAD.html','DESARROLLADOR.html'];
const EXT=/^(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|code\.jquery\.com)$/;
self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(C).then(c=>Promise.all(PAGES.map(p=>c.add(p).catch(()=>{}))))); });
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET') return;
  const u=new URL(r.url);
  if(u.origin!==location.origin){
    if(!EXT.test(u.hostname)) return;
    e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{ if(res&&(res.ok||res.type==='opaque')){ const cp=res.clone(); caches.open(C).then(c=>c.put(r,cp)); } return res; })));
    return;
  }
  e.respondWith(fetch(r).then(res=>{ if(res&&res.ok){ const cp=res.clone(); caches.open(C).then(c=>c.put(r,cp)); } return res; })
    .catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||(r.mode==='navigate'?caches.match('index.html'):undefined))));
});
