/** Collect rides and tariffs from the authenticated PWA browser; server polling is blocked by Qrator. PRD §5.13, §13. */

const BODY = [
  "(async()=>{try{",
  // Read the token from IndexedDB: keyval-store database, keyval store.
  "function g(k){return new Promise((res,rej)=>{const r=indexedDB.open('keyval-store');",
  "r.onsuccess=()=>{const db=r.result,st=db.objectStoreNames.contains('keyval')?'keyval':db.objectStoreNames[0],",
  "q=db.transaction(st,'readonly').objectStore(st).get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)};",
  "r.onerror=()=>rej(r.error)})}",
  "let t=await g('vb-access-token');",
  "if(t&&typeof t!=='string')t=(JSON.stringify(t).match(/eyJ[\\w-]+\\.[\\w-]+\\.[\\w-]+/)||[])[0];",
  "if(!t){alert('Не нашёл токен Велобайка (vb-access-token). Залогинься на pwa.velobike.ru и повтори.');return}",
  "const H={'App-version':'4.5.7',source:'pwa-client',lang:'ru',Accept:'application/json',Authorization:'Bearer '+t};",
  "const a=[];let total=null;",
  "for(let p=0;p<200;p++){",
  "const r=await fetch('/api/rent/rents/client?size=50&page='+p+'&statuses=TECH_DONE,DONE',{headers:H});",
  "if(!r.ok){alert('Велобайк вернул '+r.status+'. Залогинься на pwa.velobike.ru и повтори.');return}",
  "const j=await r.json();if(total==null)total=j.totalElements;",
  "const c=j.content||[];a.push(...c);if(!c.length||j.last)break}",
  "if(!a.length){alert('Поездок не найдено.');return}",
  // Fetch station addresses from ride details in batches of five; a detail failure leaves the ride importable without an address.
  "const POP='/api/rent/v2/rents/getPopulatedRent/';let en=0;",
  "async function pop(it){try{const rr=await fetch(POP+it.id,{headers:H});",
  "if(rr.ok){const pj=await rr.json();",
  "if(pj.startParkingAddress)it.startParkingAddress=pj.startParkingAddress;",
  "if(pj.finishParkingAddress)it.finishParkingAddress=pj.finishParkingAddress}}catch(e){}en++}",
  "for(let i=0;i<a.length;i+=5){await Promise.all(a.slice(i,i+5).map(pop));",
  "console.log('адреса: '+en+' из '+a.length)}",
  // Include TARIFF purchases because rental cost excludes access; RENTAL entries duplicate ride charges.
  "const pt=[];for(let p=0;p<200;p++){",
  "const pr=await fetch('/api/purchases/history?size=50&page='+p,{headers:H});",
  "if(!pr.ok)break;const pj=await pr.json();const pc=pj.content||[];",
  "pt.push(...pc.filter(x=>x&&x.purchaseType==='TARIFF'));",
  "if(!pc.length||pj.last)break}",
  "const x=JSON.stringify({rides:a,tariffs:pt});window.__vbRides=x;",
  "let ok=false;try{await navigator.clipboard.writeText(x);ok=true}catch(e){}",
  "const msg='Собрано '+a.length+' из '+total+' поездок (адреса: '+en+', тарифов: '+pt.length+').';",
  "console.log(msg+(ok?' Уже в буфере.':' Скопируй так:  copy(__vbRides)'));",
  "alert(msg+(ok?' Скопировано — вставь в admin.':' Буфер не дался: в консоли набери  copy(__vbRides)  и вставь в admin.'))",
  "}catch(e){alert('Ошибка: '+e.message)}})();",
].join("");

/** Bookmark URL; paste into a bookmark's address field. */
export const BIKE_BOOKMARKLET = `javascript:${BODY}`;

/** Equivalent DevTools snippet for pwa.velobike.ru when CSP blocks bookmarklets. */
export const BIKE_CONSOLE_SNIPPET = BODY;
