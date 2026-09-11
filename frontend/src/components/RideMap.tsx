"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

interface RideMapProps {
  startLat: number;
  startLon: number;
  finishLat: number;
  finishLon: number;
  /** Активная волна — выбирает подложку (см. BASEMAPS) и набор пиксельных пинов (RIDE_PINS). */
  wave?: string | null;
  /**
   * Интерактивная карта: её водят, приближают и наводятся на пины (адрес станции подсказкой).
   * Включается только там, где карта не обёрнута в кликабельную кнопку (модалка). В тайле
   * остаётся `false` — карта статична (`pointer-events:none`), клик уходит на кнопку
   * «открыть карту».
   */
  interactivePins?: boolean;
  /** Адрес старта — подсказка на старт-пине (только при `interactivePins`). */
  startLabel?: string | null;
  /** Адрес финиша — подсказка на финиш-пине (только при `interactivePins`). */
  finishLabel?: string | null;
  /**
   * Карта показала местность, а не пустой бокс. Нужно тому, кто ЖДЁТ карту, прежде чем что-то
   * с ней делать: проявка (DESIGN §7.5) везёт карту из плитки в модалку, и стартовать полёт до
   * первого кадра значило бы гнать через экран пустой прямоугольник. Не приходит вовсе, если
   * карта так и не поднялась, — вызывающий обязан иметь план на этот случай (у проявки он свой:
   * потолок ожидания в [useDropMorph]).
   */
  onReady?: () => void;
  /**
   * Сколько пикселей сверху карты занято чем-то поверх неё (полоса данных в редакции `map`).
   * Кадрирование уводит маршрут из-под этой полосы: иначе длинная поездка уезжала бы стартовым
   * пином под текст. Число приходит ЗАМЕРОМ полосы, а не константой: её высоту задаёт CSS
   * (`--ride-band-*`), и второй копии этих пикселей в коде быть не должно.
   */
  padTop?: number;
  /**
   * Придуманный путь между станциями (кнопка «нарисовать случайный путь», PRD §9 B4) — ломаная
   * пар `[lat, lon]` от роутера. Есть путь ⇒ вместо дуги рисуется он, и кадр подгоняется под
   * него: крюк в +40% иначе уезжал бы за край. Нет пути (`null`/не передан) ⇒ всё как раньше,
   * дуга старт→финиш. Проп необязательный намеренно: тайл борда его не передаёт вовсе.
   */
  path?: [number, number][] | null;
  className?: string;
}

/**
 * Мини-карта поездки Велобайк (PRD §9 B4, DESIGN §7.6). Геоданных только две точки — старт и
 * финиш (трека маршрута API не отдаёт), поэтому рисуем два маркера и **пунктирную дугу** между
 * ними — честно «связь A→B», не пройденный путь.
 *
 * Рисует **MapLibre GL** по векторному стилю. Растровые подложки (готовые картинки тайлов) под
 * Leaflet пройдены и сняты: бесплатных тёмных растровых канв без ключа по факту одна, её
 * приходилось досаживать CSS-фильтром, и карта выходила не тёмной, а затемнённой. Вектор решает
 * это в корне — стиль наш, а не «то единственное, что отдали без ключа».
 *
 * Маркеры зависят от волны: у волн из RIDE_PINS (напр. wave-01) — пиксельные пины-спрайты
 * (старт = велосипед, финиш = клетчатый флаг, DESIGN §12), извлечённые под скин; иначе — базовый
 * фолбэк из двух кружков (старт зелёный, финиш красный). Пин якорится острым кончиком в точку.
 *
 * Библиотека грузится динамически в эффекте (SSR-safe, только в браузере). Карта в ПЛИТКЕ
 * намеренно статична — там она виджет и целиком кнопка; в ОКНЕ (`interactivePins`) её водят
 * и приближают.
 *
 * Линия старт→финиш — **пологая пунктирная дуга** (квадратичная Безье), а не прямая: живее
 * читается и честно остаётся «связью A→B», не выдавая себя за пройденный маршрут (трека нет).
 */
const ARC_COLOR = "#c2603f";

/**
 * Цвет придуманного пути. Намеренно НЕ [ARC_COLOR] и не цвет пинов: дуга и пины — реальные
 * данные, а этот путь выдуман кнопкой. Разный цвет и штрих — единственное, что не даёт борду
 * начать врать (DESIGN §7.6).
 */
const INVENTED_COLOR = "#9d8cff";

/**
 * Пиксельные пины по волнам (DESIGN §12). На мини-карте пин крошечный (~34px), поэтому спрайты
 * нарочно **упрощены под размер** (optical sizing): сплошная капля + один жирный белый глиф
 * (старт = колесо-нод к велосипеду, финиш = клетчатый флаг), без внутреннего кружка и тонких
 * деталей — детальные версии (`*-detailed.png`) лежат рядом под будущую крупную карту. Размеры —
 * под аспект авторской сетки 15×19 (кончик капли — снизу-по-центру). `ride-pin-icon` в
 * `common.css` даёт `image-rendering: pixelated` (чёткие пиксели при масштабе).
 *
 * Размер пина НАМЕРЕННО оставлен фиксированным и не переведён на доли (DESIGN §8.1), хотя
 * остальной борд переведён: эти спрайты нарисованы именно под ~34px и упрощены под него.
 * Растянуть их вместе с картой — значит показать крупным планом упрощение, ради которого
 * они и рисовались. Пропорциональность тут решается подменой ассета, а не масштабом.
 */
interface PinSpec {
  url: string;
  w: number;
  h: number;
}
const RIDE_PINS: Record<string, { start: PinSpec; finish: PinSpec }> = {
  "wave-01": {
    start: { url: "/assets/waves/wave-01/decor/pin-start.png", w: 27, h: 34 },
    finish: { url: "/assets/waves/wave-01/decor/pin-finish.png", w: 27, h: 34 },
  },
};

/**
 * Подложка карты по волнам. Волна одевает свой борд целиком (DESIGN §10), и базовая карта из
 * этого правила не выпадает: в редакции `map` она — вся поверхность виджета, и светлый минимал
 * посреди тёмного холста читается не картой, а прожжённой в нём дырой.
 *
 * Подложка ОДНА на плитку и на модалку. Разные стили там и там развалили бы проявку (§7.5):
 * карта вылетает из плитки в окно, и на полпути сменила бы шкуру.
 *
 * Стили — VersaTiles по данным OpenStreetMap: бесплатно, без ключа и без лимитов. И это не
 * мелочь: у 2ГИС, Яндекса и Google показ карты идёт по подписке за вызовы (у 2ГИС библиотека
 * MapGL бесплатна, а тайлы к ней — отдельная подписка; бесплатен только iframe-виджет, на
 * котором своей линии пути не нарисовать). CARTO, откуда подложка приезжала раньше, с 2025-го
 * отдаёт тайлы с водяным знаком «API KEY REQUIRED» (docs/pitfalls.md).
 */
const STYLE_BASE = "https://tiles.versatiles.org/assets/styles";
/** «colorful» — тёплый светлый стиль (фон rgb(249,244,238)), близкий к бумаге волн 01/02. */
const DEFAULT_STYLE = `${STYLE_BASE}/colorful/style.json`;
const BASEMAPS: Record<string, string> = {
  // «eclipse» — тёмный: почти чёрный фон, названия улиц, свои шрифты. Тёмный САМ, а не
  // затемнённый фильтром поверх серой канвы (замечание владельца).
  "wave-03": `${STYLE_BASE}/eclipse/style.json`,
};

/**
 * Докуда пускаем зум рукой в окне. Вектор рисуется из геометрии, поэтому предел ни во что не
 * упирается — число выбрано по смыслу: 19 это отдельный двор.
 */
const MAX_ZOOM = 19;

/**
 * Потолок АВТОМАТИЧЕСКОГО кадрирования. Без него поездка «от подъезда до соседнего дома»
 * открывалась бы вплотную к асфальту: рамке из двух точек всё равно, насколько они близко.
 */
const FIT_MAX_ZOOM = 16;

/**
 * Адрес воркера MapLibre — и это не украшательство, а условие работы карты.
 *
 * Библиотека разбирает векторные тайлы в ВОРКЕРЕ, и с версии 6 его код лежит отдельными файлами,
 * причём сам воркер импортирует соседний **относительно себя**. Сборщику Next этот граф не виден:
 * он уносит в статику один файл под хэшированным именем, сосед остаётся в `node_modules`, импорт
 * даёт 404 — и воркер молча умирает. Выглядит это как «карта не работает»: фон стиля нарисован,
 * улиц нет, ни одного запроса за тайлами, событие `load` не наступает и ошибок в консоли ноль.
 *
 * Поэтому оба файла кладутся в статику сайта своими именами (`scripts/copy-maplibre-worker.mjs`,
 * хуки `predev`/`prebuild`) — и относительный импорт внутри воркера попадает туда, куда целился.
 * Адрес здесь и путь в том скрипте — одна и та же строка в двух местах; разъедутся — карта
 * погаснет ровно так же тихо (docs/pitfalls.md).
 */
const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

/** Точки квадратичной кривой Безье от s к f с контрольной точкой, отведённой перпендикуляром. */
function arcPoints(s: [number, number], f: [number, number]): [number, number][] {
  const k = 0.18;
  const mLat = (s[0] + f[0]) / 2;
  const mLon = (s[1] + f[1]) / 2;
  const dLat = f[0] - s[0];
  const dLon = f[1] - s[1];
  const cLat = mLat - dLon * k;
  const cLon = mLon + dLat * k;
  const pts: [number, number][] = [];
  for (let t = 0; t <= 1.0001; t += 0.04) {
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    pts.push([a * s[0] + b * cLat + c * f[0], a * s[1] + b * cLon + c * f[1]]);
  }
  return pts;
}

/** Ломаная пар `[lat, lon]` в GeoJSON — там координаты в обратном порядке (`[lon, lat]`). */
function lineOf(points: [number, number][]) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: points.map(([la, lo]) => [lo, la]) },
  };
}

const EMPTY_LINE = lineOf([]);

export function RideMap({
  startLat,
  startLon,
  finishLat,
  finishLon,
  wave,
  interactivePins,
  startLabel,
  finishLabel,
  onReady,
  padTop,
  path,
  className,
}: RideMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const interactive = !!interactivePins;
  // Колбэк — через ссылку: он приходит из рендера вызывающего и меняет идентичность на каждом
  // из них, а стоя в зависимостях эффекта, пересобирал бы карту целиком на ровном месте.
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  // Резерв под полосой — тоже через ссылку: он меняется с каждым замером полосы, а стоя
  // в зависимостях эффекта, пересобирал бы карту на каждое изменение размера окна.
  const padTopRef = useRef(padTop);
  padTopRef.current = padTop;
  /** Пересчёт кадрирования живой карты — публикуется эффектом сборки, зовётся снаружи. */
  const refitRef = useRef<(() => void) | null>(null);
  /** Перерисовка придуманного пути — тоже снаружи: путь меняется без пересборки карты. */
  const drawPathRef = useRef<((points: [number, number][] | null) => void) | null>(null);
  /** Точки нарисованного пути — по ним кадрируется карта, пока путь на экране. */
  const pathPointsRef = useRef<[number, number][] | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any = null;
    let ro: ResizeObserver | null = null;
    let attribWatch: MutationObserver | null = null;

    // Именованные экспорты, а не `default`: у maplibre-gl его нет.
    import("maplibre-gl").then((maplibregl) => {
      if (cancelled || !ref.current) return;
      maplibregl.setWorkerUrl(WORKER_URL);
      const start: [number, number] = [startLat, startLon];
      const finish: [number, number] = [finishLat, finishLon];
      const pins = wave ? RIDE_PINS[wave] : undefined;

      // Карта в ПЛИТКЕ статична — это виджет, а не атлас: она вся одна кнопка, и жест по ней
      // обязан открывать окно, а не двигать подложку. В ОКНЕ наоборот: там карту водят и
      // приближают (просьба владельца), и вместе с этим появляются зумер и подпись поставщика —
      // без атрибуции интерактивную карту показывать нельзя, а на плитке она была бы мусором
      // в углу виджета.
      map = new maplibregl.Map({
        container: el,
        style: (wave ? BASEMAPS[wave] : undefined) ?? DEFAULT_STYLE,
        center: [(startLon + finishLon) / 2, (startLat + finishLat) / 2],
        zoom: 12,
        maxZoom: MAX_ZOOM,
        interactive,
        attributionControl: interactive ? { compact: true } : false,
        // Поворот и наклон выключены НАВСЕГДА, в обоих режимах: борд смотрит на карту сверху,
        // как на схему, и накренившийся город читался бы сбоем, а не возможностью.
        dragRotate: false,
        pitchWithRotate: false,
        // ⚠️ `preserveDrawingBuffer` — без него карта на экране есть, а на СНИМКЕ пусто: по
        // умолчанию WebGL сбрасывает буфер сразу после вывода кадра, и всё, что снимает страницу
        // со стороны (визуальная регрессия Playwright, превью, скриншот браузером), получает
        // прозрачный прямоугольник. Плата — держать кадр в памяти GPU; на двух маленьких картах
        // это ничто. Антиалиасинг включаем заодно: без него косые улицы идут лесенкой.
        canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      });
      if (interactive) {
        map.touchZoomRotate?.disableRotation();
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
      }

      // Подпись поставщика — СВЁРНУТА в кружок «i», и ссылки из неё уходят в новую вкладку
      // (просьба владельца). Оба поведения приходится доводить руками:
      //   · `compact: true` у maplibre означает «есть кнопка сворачивания», а не «свёрнута»:
      //     контрол создаётся сразу с классом `maplibregl-compact-show` и атрибутом `open`,
      //     то есть развёрнутым, и схлопывается только на первое касание карты. На плитке-окне
      //     это строка текста поверх города в момент открытия;
      //   · ссылки приезжают HTML-строкой из самого стиля, без `target` — клик по
      //     «OpenStreetMap contributors» уводил бы со страницы, а борд остаётся на месте.
      // Наблюдатель нужен потому, что список источников пересобирается на каждое изменение
      // стиля: без него свежая разметка приезжала бы снова развёрнутой и снова без `target`.
      // Слушаем только состав детей — атрибуты правим сами, и ответ на собственную правку
      // закольцевал бы наблюдателя.
      const attrib = el.querySelector(".maplibregl-ctrl-attrib");
      if (attrib) {
        const tame = () => {
          attrib.classList.remove("maplibregl-compact-show");
          attrib.removeAttribute("open");
          for (const link of Array.from(attrib.querySelectorAll("a"))) {
            link.target = "_blank";
            link.rel = "noreferrer";
          }
        };
        tame();
        attribWatch = new MutationObserver(tame);
        attribWatch.observe(attrib, { childList: true, subtree: true });
      }

      const bounds = () => {
        const b = new maplibregl.LngLatBounds();
        const drawn = pathPointsRef.current;
        // Пока на карте придуманный путь, кадрируем по нему: он длиннее прямой старт→финиш
        // и при большом крюке вылезал бы за край.
        if (drawn && drawn.length > 1) drawn.forEach(([la, lo]) => b.extend([lo, la]));
        else {
          b.extend([startLon, startLat]);
          b.extend([finishLon, finishLat]);
        }
        return b;
      };

      // Кадрирование пересчитываем на КАЖДОЕ изменение размера контейнера, а не только при
      // маунте (DESIGN §8.1). Зум — это «сколько метров в пикселе»: подобранный под один размер,
      // он при росте контейнера оставляет тот же масштаб и просто показывает больше пустой карты
      // вокруг — точки разъезжаются к центру и карта «отдаляется». Ровно это видно при
      // уменьшении масштаба браузера и на большом мониторе. Повторный fitBounds держит
      // одинаковое КАДРИРОВАНИЕ (точки занимают ту же долю карты) на любом размере.
      const refit = () => {
        if (!map) return;
        map.resize();
        const box = el.getBoundingClientRect();
        if (box.width < 40 || box.height < 40) return;
        // Воздух вокруг маршрута — доля от кадра, а не пиксели: на плитке и в окне он должен
        // читаться одинаково. Сверху добавляются полоса данных (`padTop`) и рост пина: пиксельный
        // пин висит головой НАД точкой, и без запаса его срезала бы верхняя кромка.
        const breathe = Math.min(box.width, box.height) * 0.14;
        const top = breathe + (padTopRef.current ?? 0) + (pins ? 34 : 0) + (interactive ? 18 : 0);
        // Потолок отступов: кадрировать в отрицательный остаток нельзя, а на узкой плитке
        // сумма запросто съела бы весь кадр.
        const capY = box.height * 0.4;
        const capX = box.width * 0.4;
        map.fitBounds(bounds(), {
          padding: {
            top: Math.min(top, capY),
            bottom: Math.min(breathe, capY),
            left: Math.min(breathe, capX),
            right: Math.min(breathe, capX),
          },
          duration: 0,
          maxZoom: FIT_MAX_ZOOM,
        });
      };

      /**
       * Придуманный путь рисуется НЕ так, как реальные данные (DESIGN §7.6): фиолетовая ломаная
       * длинным штрихом с мягким ореолом, тогда как дуга реальной связи — терракотовая и коротким
       * пунктиром. Линия обязана называть себя сама, иначе через месяц её не отличить от
       * GPS-трека, которого у нас нет.
       */
      const drawPath = (points: [number, number][] | null) => {
        if (!map || !map.getSource?.("invented")) return;
        const has = !!points && points.length > 1;
        map.getSource("invented").setData(has ? lineOf(points!) : EMPTY_LINE);
        // Дуга — заглушка «пути нет»: появился путь, и она уходит, чтобы линии не спорили.
        map.setLayoutProperty("arc", "visibility", has ? "none" : "visible");
      };
      drawPathRef.current = drawPath;

      map.once("load", () => {
        if (cancelled) return;
        map.addSource("arc", { type: "geojson", data: lineOf(arcPoints(start, finish)) });
        map.addSource("invented", { type: "geojson", data: EMPTY_LINE });
        map.addLayer({
          id: "arc",
          type: "line",
          source: "arc",
          layout: { "line-cap": "round", "line-join": "round" },
          // Штрих задаётся в ТОЛЩИНАХ линии, а не в пикселях: 4/5 px при толщине 2.5 — это 1.6/2.
          paint: {
            "line-color": ARC_COLOR,
            "line-width": 2.5,
            "line-opacity": 0.9,
            "line-dasharray": [1.6, 2],
          },
        });
        map.addLayer({
          id: "invented-halo",
          type: "line",
          source: "invented",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": INVENTED_COLOR, "line-width": 7, "line-opacity": 0.22 },
        });
        map.addLayer({
          id: "invented",
          type: "line",
          source: "invented",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": INVENTED_COLOR,
            "line-width": 3,
            "line-opacity": 0.95,
            "line-dasharray": [3, 1.7],
          },
        });
        // Путь мог приехать раньше стиля — тогда рисуем его сразу, как только есть куда.
        drawPath(pathPointsRef.current);
        refit();
        readyRef.current?.();
      });

      /**
       * Маркер с подсказкой-адресом на наведение (только в интерактивном режиме и если адрес
       * есть). `anchor` — чем именно узел стоит на точке: у пиксельного пина это острый кончик
       * (`bottom`), у кружка-фолбэка его собственный центр (`center`).
       * ⚠️ Сдвигать узел своим `transform` нельзя: карта пишет `transform` маркеру сама на
       * каждом кадре и любой наш затрёт. Место задаётся только `anchor`/`offset`.
       */
      const addMarker = (
        p: [number, number],
        node: HTMLElement,
        label: string | null | undefined,
        offsetY: number,
        anchor: "bottom" | "center",
      ) => {
        new maplibregl.Marker({ element: node, anchor }).setLngLat([p[1], p[0]]).addTo(map);
        if (!interactive || !label) return;
        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: [0, offsetY],
          className: "ride-pin-tip",
        }).setText(label);
        node.style.pointerEvents = "auto";
        node.addEventListener("mouseenter", () => popup.setLngLat([p[1], p[0]]).addTo(map));
        node.addEventListener("mouseleave", () => popup.remove());
      };

      if (pins) {
        // Пиксельные пины: якорь — острый кончик (снизу-по-центру), голова возвышается над точкой.
        const addPin = (p: [number, number], spec: PinSpec, label: string | null | undefined) => {
          const img = document.createElement("img");
          img.src = spec.url;
          img.width = spec.w;
          img.height = spec.h;
          img.alt = "";
          img.className = "ride-pin-icon";
          addMarker(p, img, label, -spec.h, "bottom");
        };
        addPin(start, pins.start, startLabel);
        addPin(finish, pins.finish, finishLabel);
      } else {
        const addDot = (p: [number, number], color: string, label: string | null | undefined) => {
          const dot = document.createElement("span");
          dot.className = "ride-pin-dot";
          dot.style.background = color;
          addMarker(p, dot, label, -10, "center");
        };
        addDot(start, "#2f9e44", startLabel);
        addDot(finish, "#e03131", finishLabel);
      }

      refitRef.current = refit;
      refit();

      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => refit());
        ro.observe(el);
      }
    });

    return () => {
      cancelled = true;
      refitRef.current = null;
      drawPathRef.current = null;
      pathPointsRef.current = null;
      if (ro) ro.disconnect();
      if (attribWatch) attribWatch.disconnect();
      if (map) map.remove();
    };
  }, [startLat, startLon, finishLat, finishLon, wave, interactive, startLabel, finishLabel]);

  // Полосу замерили (или она подросла) — перекадрируем уже собранную карту, не пересобирая её.
  useEffect(() => {
    refitRef.current?.();
  }, [padTop]);

  // Придуманный путь — отдельным слоем поверх собранной карты. Перерисовать его надо БЕЗ
  // пересборки карты: иначе каждое нажатие кнопки гасило бы подложку и ломало проявку.
  useEffect(() => {
    pathPointsRef.current = path && path.length > 1 ? path : null;
    drawPathRef.current?.(pathPointsRef.current);
    refitRef.current?.();
  }, [path]);

  // isolation:isolate — собственный stacking context: внутренние z-index карты иначе «протекают»
  // до корня и рисуются ПОВЕРХ модалок (z-50). Теперь они замкнуты внутри тайла, и любой
  // fixed-оверлей выше карты.
  return (
    <div
      ref={ref}
      // `ride-map` — постоянная зацепка для скина волны. Место в раскладке остаётся за
      // `className` вызывающего.
      className={className ? `ride-map ${className}` : "ride-map"}
      // pointer-events: в тайле none — карта статична, клик проходит сквозь неё к кнопке «открыть
      // карту». В интерактивном режиме (модалка) auto — карту водят, а пины ловят наведение.
      style={{
        width: "100%",
        height: "100%",
        borderRadius: "var(--radius-sm)",
        isolation: "isolate",
        pointerEvents: interactive ? "auto" : "none",
      }}
      aria-hidden
    />
  );
}
