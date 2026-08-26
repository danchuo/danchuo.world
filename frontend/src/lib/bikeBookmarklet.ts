/**
 * Букмарклет-сборщик поездок Велобайка (B4, PRD §5.13, §13).
 *
 * Серверный поллер упирается в Qrator (антибот режет датацентр-IP VPS), поэтому основной канал
 * доставки — из **уже авторизованного браузера владельца**: сниппет крутится на origin
 * `pwa.velobike.ru`, где сессия прошла Qrator и логин. Он листает всю историю (`rents/client`,
 * `size=50` постранично до `last`), собирает сырой `content[]` и кладёт JSON в буфер — дальше
 * владелец вставляет его в `/admin → поездки велобайк` (POST на наш ingest идёт с того же origin,
 * токен записи не покидает danchuo.world; см. `importBikeRides`).
 *
 * Обогащение адресами: списочный `rents/client` отдаёт координаты и внешний id парковки, но
 * **не адрес станции** — его несёт только детальный `GET /api/rent/v2/rents/getPopulatedRent/{id}`
 * (поля `startParkingAddress`/`finishParkingAddress`, напр. «ст. м. Молодёжная (выход № 2)»).
 * Поэтому после сбора списка сниппет по каждой поездке дёргает `getPopulatedRent` (пачками по 5,
 * с прогрессом) и подставляет адреса в элемент перед отправкой. Поля совпадают с `RentItem` —
 * маппер бэка (`RideMapper`) читает их как есть, менять его не нужно. Сбой детали не роняет
 * импорт: адрес просто остаётся пустым, поездка уходит без него.
 *
 * Покупки тарифов: часть поездок стоит `cost = 0` — это не «бесплатно», а «в рамках уже купленного
 * тарифа на N минут». Чтобы показать «в рамках тарифа за N ₽», тем же одним заходом сниппет листает
 * `purchases/history` и оставляет только записи `purchaseType === 'TARIFF'` (покупки; `RENTAL` —
 * списания за поездки, уже есть в поездках). Буфер отдаёт **объект** `{rides, tariffs}` — админка
 * (`importBikeRides`/`importBikeTariffs`) шлёт две части на разные ingest-ручки. Старый голый массив
 * поездок админка тоже принимает (обратная совместимость).
 *
 * Авторизация PWA (снято живьём с прода): access-токен Велобайка лежит **в IndexedDB** — БД
 * `keyval-store`, стор `keyval`, ключ `vb-access-token` (JWT-строка, `iss=client-oauth`). В
 * web-storage токена нет, сессионной куки API не принимает (без `Authorization` — 401). Поэтому
 * сниппет читает `vb-access-token` из IndexedDB и шлёт `Authorization: Bearer <jwt>`.
 *
 * Буфер: под кликом-букмарклетом (жест пользователя) `navigator.clipboard.writeText` кладёт JSON
 * `{rides, tariffs}` целиком. В **консольном** пути жеста нет и клипборд может обрезать/отказать —
 * поэтому сниппет всегда дублирует полный JSON в `window.__vbRides` и подсказывает `copy(__vbRides)`
 * (надёжный DevTools-хелпер без обрезки). Отчёт «собрано X из Y поездок (адреса: …, тарифов: …)»
 * сразу показывает, всё ли утянулось.
 *
 * BODY используется дважды: как тело `javascript:`-букмарклета и как сниппет для консоли DevTools
 * (запасной путь, если строгий CSP на pwa.velobike.ru не даёт запустить букмарклет).
 */

const BODY = [
  "(async()=>{try{",
  // Достаём одно значение из IndexedDB keyval-store (idb-keyval): БД 'keyval-store', стор 'keyval'.
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
  // Обогащение адресами станций: список их не отдаёт, тянем из детального getPopulatedRent/{id}
  // (пачками по 5, чтобы не долбить API). Сбой одной детали не роняет импорт — адрес пустой.
  "const POP='/api/rent/v2/rents/getPopulatedRent/';let en=0;",
  "async function pop(it){try{const rr=await fetch(POP+it.id,{headers:H});",
  "if(rr.ok){const pj=await rr.json();",
  "if(pj.startParkingAddress)it.startParkingAddress=pj.startParkingAddress;",
  "if(pj.finishParkingAddress)it.finishParkingAddress=pj.finishParkingAddress}}catch(e){}en++}",
  "for(let i=0;i<a.length;i+=5){await Promise.all(a.slice(i,i+5).map(pop));",
  "console.log('адреса: '+en+' из '+a.length)}",
  // Покупки «Доступа» (страница purchase-history): без них цена поездки неполная — cost поездки это
  // лишь то, что натикало сверх входа в тариф. История смешивает TARIFF (покупка) и RENTAL (списание) —
  // берём только TARIFF, остальное у нас уже есть в поездках. Тем же одним заходом, без лишних кнопок.
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

/** Готовый `javascript:`-URL: создать закладку и вставить это в поле адреса. */
export const BIKE_BOOKMARKLET = `javascript:${BODY}`;

/** Тот же код без префикса — вставить в консоль DevTools на pwa.velobike.ru (если CSP душит букмарклет). */
export const BIKE_CONSOLE_SNIPPET = BODY;
