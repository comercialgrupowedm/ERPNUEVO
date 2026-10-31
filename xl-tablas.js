/* xl-tablas.js — Orden y filtro tipo Excel para las tablas (table.data-tbl) de los módulos del ERP WEDM.
   No cambia las tablas de cada módulo: les agrega ▾ en los encabezados (orden mayor/menor + filtro con búsqueda y casillas),
   contador de filas, "Quitar filtros" y descarga CSV. Si la tabla está paginada ("Mostrar más"), carga todas las filas al usar el filtro. */
(function(){
  if(window.__XLX) return; window.__XLX=1;
  var ST={}, PEND=null, POP=null, busy=false, timer=null, obs=null;
  var css='.xlx-t{cursor:pointer;user-select:none}.xlx-dd{border:none;background:transparent;cursor:pointer;font-size:12px;padding:2px 5px;margin-left:3px;color:inherit;opacity:.65;border-radius:4px}.xlx-dd:hover{opacity:1;background:rgba(0,0,0,.1)}'
   +'th.xlx-on{background:#fde68a!important;color:#78350f!important}th.xlx-on .xlx-dd{opacity:1}'
   +'.xlx-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 2px;font-size:12px;color:var(--muted,#64748b);font-weight:700}.xlx-bar button{border:1px solid var(--border,#d7dbe3);background:var(--card,#fff);color:var(--text,#111);border-radius:8px;padding:4px 10px;font-size:12px;font-weight:700;cursor:pointer}'
   +'.xlx-pop{position:fixed;z-index:99990;width:260px;background:var(--card,#fff);color:var(--text,#111);border:1px solid var(--border,#d7dbe3);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.28);padding:8px;font-size:12.5px;font-family:inherit}.xlx-pop hr{border:none;border-top:1px solid var(--border,#d7dbe3);margin:6px 0}'
   +'.xlx-opt{display:block;width:100%;text-align:left;border:none;background:transparent;padding:7px 8px;border-radius:6px;cursor:pointer;font-size:12.5px;color:inherit}.xlx-opt:hover{background:rgba(0,0,0,.07)}'
   +'.xlx-pop input[type=text]{width:100%;box-sizing:border-box;padding:7px 8px;border:1px solid var(--border,#d7dbe3);border-radius:6px;margin-bottom:6px;background:var(--bg,#fff);color:inherit;font-size:12.5px}'
   +'.xlx-list{max-height:220px;overflow:auto;border:1px solid var(--border,#d7dbe3);border-radius:6px;padding:4px 6px}.xlx-list label{display:flex;gap:6px;align-items:center;padding:3px 0;cursor:pointer;text-transform:none;letter-spacing:0;font-weight:500;font-size:12.5px;color:inherit}.xlx-c{margin-left:auto;color:var(--muted,#64748b);font-size:11px}'
   +'.xlx-pf{display:flex;gap:6px;justify-content:flex-end;margin-top:8px}.xlx-pf button{border:1px solid var(--border,#d7dbe3);background:var(--card,#fff);color:inherit;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer}.xlx-pf .ok{background:#2f6df6;color:#fff;border-color:#2f6df6}';
  var st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);

  var norm=function(s){ return String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim(); };
  var cellTxt=function(td){ if(!td) return ''; var v=td.getAttribute('data-xv'); return (v!=null?v:td.textContent).replace(/\s+/g,' ').trim(); };
  function sval(t){ t=String(t).trim(); if(!t) return null; var m;
    if((m=t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return Date.UTC(+m[3],+m[2]-1,+m[1]);
    if((m=t.match(/^(\d{4})-(\d{2})-(\d{2})/))) return Date.UTC(+m[1],+m[2]-1,+m[3]);
    var n=t.replace(/[$\s%]/g,'');
    if(/^-?[\d.,]+$/.test(n)&&/\d/.test(n)){ var x=n;
      if(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(x)) x=x.replace(/\./g,'').replace(',','.'); else if(x.indexOf(',')>-1&&x.indexOf('.')===-1) x=x.replace(',','.'); else if(x.indexOf(',')>-1) x=x.replace(/,/g,'');
      var f=parseFloat(x); if(!isNaN(f)) return f; }
    return t; }
  function cmp(a,b){ var ea=a==null, eb=b==null; if(ea||eb) return ea&&eb?0:ea?1:-1; var na=typeof a==='number', nb=typeof b==='number';
    if(na&&nb) return a-b; if(na!==nb) return na?-1:1; return String(a).localeCompare(String(b),'es',{numeric:true}); }

  function infoOf(table){ var th=[].slice.call((table.tHead&&table.tHead.rows.length?table.tHead.rows[table.tHead.rows.length-1]:table.rows[0]).cells);
    var heads=th.map(function(h){ var c=h.cloneNode(true); c.querySelectorAll('.xlx-dd').forEach(function(b){b.remove();}); return c.textContent.replace(/\s+/g,' ').trim(); });
    var sig=heads.join('|');
    return {th:th,heads:heads,sig:sig}; }
  function dataRows(table){ var b=table.tBodies[0]; if(!b) return []; return [].slice.call(b.rows).filter(function(r){ return r.cells.length>=2&&!r.querySelector('td[colspan]'); }); }
  function keyOf(table,sig){ var same=[].slice.call(document.querySelectorAll('#content table.data-tbl')).filter(function(t){ return t.getAttribute('data-xlx-sig')===sig; }); return location.pathname.split('/').pop()+'|'+sig+'|'+Math.max(0,same.indexOf(table)); }

  function lbl(r,i){ var t=cellTxt(r.cells[i]); return t===''?'(Vacías)':t; }
  function rowsFor(table,key,skip){ var s=ST[key]||{}, f=s.f||{}; return dataRows(table).filter(function(r){ for(var k in f){ if(+k===skip) continue; if(!f[k].has(lbl(r,+k))) return false; } return true; }); }

  function apply(table,key){ var s=ST[key]||(ST[key]={f:{},sort:null}); var rows=dataRows(table), body=table.tBodies[0];
    rows.forEach(function(r,i){ if(r._xi==null) r._xi=i; });
    rows.forEach(function(r){ var hide=false; for(var k in s.f){ if(!s.f[k].has(lbl(r,+k))){ hide=true; break; } } r.style.display=hide?'none':''; });
    var ord=rows.slice();
    if(s.sort){ var i=s.sort.i, d=s.sort.d; var kv=new Map(); ord.forEach(function(r){ kv.set(r,sval(cellTxt(r.cells[i]))); }); ord.sort(function(a,b){ var x=kv.get(a), y=kv.get(b); if(x==null||y==null) return cmp(x,y); return cmp(x,y)*d||(a._xi-b._xi); }); }
    else ord.sort(function(a,b){ return a._xi-b._xi; });
    var last=body.lastElementChild; var frag=document.createDocumentFragment(); var others=[].slice.call(body.rows).filter(function(r){ return rows.indexOf(r)<0; });
    ord.forEach(function(r){ frag.appendChild(r); }); body.insertBefore(frag,others.length?others[0]:null);
    // encabezados
    var inf=infoOf(table); inf.th.forEach(function(h,i){ h.classList.toggle('xlx-on',!!s.f[i]||(s.sort&&s.sort.i===i)); var t=h.querySelector('.xlx-t'); if(t){ var base=t.getAttribute('data-b'); t.textContent=base+((s.sort&&s.sort.i===i)?(s.sort.d>0?' ▲':' ▼'):''); } });
    bar(table,key,rows); }
  function bar(table,key,rows){ var s=ST[key]; var active=Object.keys(s.f).length||s.sort; var vis=rows.filter(function(r){ return r.style.display!=='none'; }).length;
    var host=table.closest('.tbl-wrap')||table.parentElement; var b=host.previousElementSibling; if(!(b&&b.classList&&b.classList.contains('xlx-bar'))){ b=document.createElement('div'); b.className='xlx-bar'; host.parentNode.insertBefore(b,host); }
    b.innerHTML='<span>'+vis+' de '+rows.length+' filas</span>'+(active?'<button data-a="clr">✖ Quitar filtros</button>':'')+'<button data-a="csv">⬇ Excel (CSV)</button>';
    b.onclick=function(e){ var a=e.target.getAttribute&&e.target.getAttribute('data-a'); if(a==='clr'){ ST[key]={f:{},sort:null}; apply(table,key); } else if(a==='csv') csv(table,key); }; }
  function csv(table,key){ var inf=infoOf(table), rows=dataRows(table).filter(function(r){ return r.style.display!=='none'; }); var q=function(x){ return '"'+String(x).replace(/"/g,'""')+'"'; };
    var idx=inf.heads.map(function(h,i){ return h?i:-1; }).filter(function(i){ return i>=0; });
    var out='﻿'+[idx.map(function(i){ return q(inf.heads[i]); }).join(';')].concat(rows.map(function(r){ return idx.map(function(i){ return q(cellTxt(r.cells[i])); }).join(';'); })).join('\r\n');
    var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([out],{type:'text/csv;charset=utf-8'})); a.download='tabla_'+new Date().toISOString().slice(0,10)+'.csv'; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },500); }

  // Si la tabla está paginada, muestra todo antes de ordenar/filtrar
  function pagBtns(){ return [].slice.call(document.querySelectorAll('#content [onclick*="pgMas("]')); }
  var lastLoad=0;
  function loadAll(){ if(Date.now()-lastLoad<1500) return false; var bs=pagBtns(); if(!bs.length||typeof _PGN==='undefined'||typeof refreshCurrentView!=='function') return false;
    lastLoad=Date.now(); bs.forEach(function(b){ var m=(b.getAttribute('onclick')||'').match(/pgMas\('([^']+)'\)/); if(m) _PGN[m[1]]=1e9; });
    try{ refreshCurrentView(); }catch(e){} return true; }

  function closePop(){ if(POP){ POP.el.remove(); POP=null; document.removeEventListener('mousedown',outside,true); } }
  function outside(e){ if(POP&&!POP.el.contains(e.target)) closePop(); }
  function sortBy(table,key,i,d){ var s=ST[key]||(ST[key]={f:{},sort:null}); s.sort=d?{i:i,d:d}:(s.sort&&s.sort.i===i?(s.sort.d>0?{i:i,d:-1}:null):{i:i,d:1}); closePop(); apply(table,key); }
  function openPop(table,key,i,btn,canSort){ closePop(); var s=ST[key]||(ST[key]={f:{},sort:null}); var cnt=new Map(), raw=new Map();
    rowsFor(table,key,i).forEach(function(r){ var l=lbl(r,i); cnt.set(l,(cnt.get(l)||0)+1); if(!raw.has(l)) raw.set(l,sval(cellTxt(r.cells[i]))); });
    var vals=Array.from(cnt.keys()).sort(function(a,b){ return cmp(raw.get(a),raw.get(b)); }); var cur=s.f[i];
    var sel=new Set(cur?vals.filter(function(v){ return cur.has(v); }):vals), q='';
    var el=document.createElement('div'); el.className='xlx-pop';
    el.innerHTML=(canSort?'<button class="xlx-opt" data-a="asc">↑ Ordenar de menor a mayor (A→Z)</button><button class="xlx-opt" data-a="desc">↓ Ordenar de mayor a menor (Z→A)</button><hr>':'')+'<input type="text" placeholder="Buscar…" autocomplete="off"><div class="xlx-list"></div><div class="xlx-pf"><button data-a="x">Cancelar</button>'+(cur?'<button data-a="del">Borrar filtro</button>':'')+'<button class="ok" data-a="ok">Aceptar</button></div>';
    document.body.appendChild(el); var r=btn.getBoundingClientRect(); el.style.left=Math.max(6,Math.min(r.left,innerWidth-266))+'px'; el.style.top=Math.max(6,Math.min(r.bottom+4,innerHeight-400))+'px';
    var list=el.querySelector('.xlx-list'), inp=el.querySelector('input');
    function vis(){ var n=norm(q); return vals.filter(function(v){ return !n||norm(v).indexOf(n)>-1; }); }
    function paint(){ var v=vis(), all=v.length&&v.every(function(x){ return sel.has(x); });
      list.innerHTML='<label><input type="checkbox" data-all="1" '+(all?'checked':'')+'> <b>(Seleccionar todo)</b></label>'+v.slice(0,400).map(function(x,k){ return '<label><input type="checkbox" data-v="'+k+'" '+(sel.has(x)?'checked':'')+'> <span>'+String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</span><span class="xlx-c">'+cnt.get(x)+'</span></label>'; }).join('')+(v.length>400?'<div style="font-size:11px;padding:6px 0">+'+(v.length-400)+' más: usa el buscador</div>':''); list._v=v; }
    list.onchange=function(e){ var t=e.target; if(t.dataset.all){ vis().forEach(function(x){ t.checked?sel.add(x):sel.delete(x); }); } else { var x=list._v[+t.dataset.v]; t.checked?sel.add(x):sel.delete(x); } paint(); };
    inp.oninput=function(){ q=inp.value; sel=q?new Set(vis()):new Set(vals); paint(); };
    el.onclick=function(e){ var a=e.target.getAttribute&&e.target.getAttribute('data-a'); if(!a) return;
      if(a==='asc') sortBy(table,key,i,1); else if(a==='desc') sortBy(table,key,i,-1); else if(a==='x') closePop();
      else if(a==='del'){ delete s.f[i]; closePop(); apply(table,key); }
      else if(a==='ok'){ if(sel.size===vals.length) delete s.f[i]; else s.f[i]=new Set(sel); closePop(); apply(table,key); } };
    paint(); POP={el:el}; setTimeout(function(){ document.addEventListener('mousedown',outside,true); inp.focus(); },0); }

  function act(table,key,i,kind,btn){ if(kind==='sort') sortBy(table,key,i); else openPop(table,key,i,btn,!(infoOf(table).th[i].hasAttribute('onclick'))); }
  function request(table,key,i,kind,btn){ // primero carga todas las filas si hay paginación
    if(pagBtns().length&&typeof _PGN!=='undefined'){ PEND={key:key,i:i,kind:kind}; if(loadAll()) return; PEND=null; }
    act(table,key,i,kind,btn); }

  function enhance(table){ var rows=dataRows(table); if(rows.length<2||!table.tHead||!table.tHead.rows.length) return;
    var hr=table.tHead.rows[table.tHead.rows.length-1]; var th=[].slice.call(hr.cells); if(th.length<2) return;
    var sig=th.map(function(h){ return h.textContent.replace(/\s+/g,' ').trim(); }).join('|'); table.setAttribute('data-xlx-sig',sig); var key=keyOf(table,sig);
    th.forEach(function(h,i){ var t=h.textContent.replace(/\s+/g,' ').trim(); if(!t||h.querySelector('input,select,button')||h.classList.contains('no-xl')) return;
      var own=h.hasAttribute('onclick'); var sp=document.createElement('span'); sp.className='xlx-t'; sp.setAttribute('data-b',t); sp.textContent=t; h.textContent=''; h.appendChild(sp);
      var b=document.createElement('button'); b.type='button'; b.className='xlx-dd'; b.title='Filtrar / ordenar'; b.textContent='▾'; h.appendChild(b);
      b.onclick=function(e){ e.stopPropagation(); if(POP){ closePop(); return; } request(table,key,i,'menu',b); };
      if(!own) sp.onclick=function(e){ e.stopPropagation(); request(table,key,i,'sort',b); }; });
    var s=ST[key]; var active=s&&(Object.keys(s.f).length||s.sort);
    if(active&&pagBtns().length&&typeof _PGN!=='undefined'){ if(loadAll()) return; }
    apply(table,key);
    if(PEND&&PEND.key===key){ var p=PEND; PEND=null; var btn=table.tHead.rows[table.tHead.rows.length-1].cells[p.i].querySelector('.xlx-dd'); if(btn) act(table,key,p.i,p.kind,btn); } }

  function run(){ if(busy) return; busy=true; if(obs) obs.disconnect();
    try{ [].slice.call(document.querySelectorAll('#content table.data-tbl')).forEach(function(t){ if(t.getAttribute('data-xlx')) return; if(t.closest('.modal,#detail-panel,.detail-panel,.no-xl,.overlay')) return; t.setAttribute('data-xlx','1'); try{ enhance(t); }catch(e){ console.warn('xl-tablas',e); } }); }
    finally{ busy=false; watch(); } }
  function watch(){ var c=document.getElementById('content'); if(!c) return; if(!obs) obs=new MutationObserver(function(){ clearTimeout(timer); timer=setTimeout(run,60); }); obs.observe(c,{childList:true,subtree:true}); }
  function init(){ watch(); run(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
