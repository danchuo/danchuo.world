"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

interface RideMapProps {
  startLat: number;
  startLon: number;
  finishLat: number;
  finishLon: number;
  /** Активная волна — выбирает набор пиксельных пинов (см. RIDE_PINS); нет пинов ⇒ кружки. */
  wave?: string | null;
  /**
   * Интерактивные пины: наведение показывает адрес (Leaflet-тултип). Включается только там, где
   * карта не обёрнута в кликабельную кнопку (модалка). В тайле остаётся `false` — карта статична
   * (`pointer-events:none`), клик уходит на кнопку «открыть карту».
   */
  interactivePins?: boolean;
  /** Адрес старта — тултип на старт-пине (только при `interactivePins`). */
  startLabel?: string | null;
  /** Адрес финиша — тултип на финиш-пине (только при `interactivePins`). */
  finishLabel?: string | null;
  className?: string;
}

/**
 * Мини-карта поездки Велобайк (PRD §9 B4, DESIGN §7.6). Геоданных только две точки — старт и
 * финиш (трека маршрута API не отдаёт), поэтому рисуем два маркера и **пунктирную дугу** между
 * ними — честно «связь A→B», не пройденный путь.
 *
 * Маркеры зависят от волны: у волн из RIDE_PINS (напр. wave-01) — пиксельные пины-спрайты
 * (старт = велосипед, финиш = клетчатый флаг, DESIGN §12), извлечённые под скин; иначе — базовый
 * фолбэк из двух circleMarker (старт зелёный, финиш красный). Пин якорится острым кончиком в
 * точку (iconAnchor снизу-по-центру).
 *
 * Базовая карта — CARTO Voyager (мягкий минимал, бесплатные тайлы; атрибуция OSM/CARTO).
 * Leaflet грузится динамически в эффекте (SSR-safe, только в браузере). Карта намеренно статична
 * (без перетаскивания/зума колесом) — это виджет, а не интерактивный атлас.
 *
 * Линия старт→финиш — **пологая пунктирная дуга** (квадратичная Безье), а не прямая: живее
 * читается и честно остаётся «связью A→B», не выдавая себя за пройденный маршрут (трека нет).
 */
const ARC_COLOR = "#c2603f";

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
 * они и рисовались (нет внутреннего кружка, нет тонких деталей). Крупной карте нужны не
 * увеличенные эти, а лежащие рядом `*-detailed.png`. Пропорциональность тут решается
 * подменой ассета, а не масштабом — до тех пор фикс честнее.
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

export function RideMap({
  startLat,
  startLon,
  finishLat,
  finishLon,
  wave,
  interactivePins,
  startLabel,
  finishLabel,
  className,
}: RideMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const interactive = !!interactivePins;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any = null;
    let ro: ResizeObserver | null = null;

    import("leaflet").then((L) => {
      if (cancelled || !ref.current) return;
      const start: [number, number] = [startLat, startLon];
      const finish: [number, number] = [finishLat, finishLon];

      map = L.map(el, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png", {
        subdomains: "abcd",
        maxZoom: 20,
      }).addTo(map);

      L.polyline(arcPoints(start, finish), {
        color: ARC_COLOR,
        weight: 2.5,
        dashArray: "4 5",
        opacity: 0.9,
      }).addTo(map);

      // Тултип адреса на наведение (только в интерактивном режиме и если адрес есть). offsetY
      // поднимает подпись над головой пина/точкой.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bindLabel = (marker: any, label: string | null | undefined, offsetY: number) => {
        if (interactive && label) {
          marker.bindTooltip(label, {
            direction: "top",
            offset: L.point(0, offsetY),
            className: "ride-pin-tooltip",
            opacity: 1,
          });
        }
      };

      const pins = wave ? RIDE_PINS[wave] : undefined;
      if (pins) {
        // Пиксельные пины: якорь — острый кончик (снизу-по-центру), голова возвышается над точкой.
        const addPin = (p: [number, number], spec: PinSpec, label: string | null | undefined) => {
          const m = L.marker(p, {
            icon: L.icon({
              iconUrl: spec.url,
              iconSize: [spec.w, spec.h],
              iconAnchor: [spec.w / 2, spec.h],
              className: "ride-pin-icon",
            }),
            interactive,
            keyboard: false,
          }).addTo(map);
          bindLabel(m, label, -spec.h);
        };
        addPin(start, pins.start, startLabel);
        addPin(finish, pins.finish, finishLabel);
      } else {
        const addDot = (p: [number, number], color: string, label: string | null | undefined) => {
          const m = L.circleMarker(p, {
            radius: 5,
            color,
            fillColor: color,
            fillOpacity: 1,
            weight: 2,
            interactive,
          }).addTo(map);
          bindLabel(m, label, -8);
        };
        addDot(start, "#2f9e44", startLabel);
        addDot(finish, "#e03131", finishLabel);
      }

      const bounds = L.latLngBounds([start, finish]).pad(0.35);
      // Пиксельные пины «висят» головой над точкой — добавляем пиксельный отступ сверху, чтобы
      // головы (и тултип над ними в модалке) не срезались верхней кромкой (кончики внизу малы).
      const fitOpts = pins
        ? { paddingTopLeft: L.point(6, interactive ? 64 : 36), paddingBottomRight: L.point(6, 8) }
        : interactive
          ? { paddingTopLeft: L.point(6, 32), paddingBottomRight: L.point(6, 8) }
          : undefined;

      // Кадрирование пересчитываем на КАЖДОЕ изменение размера контейнера, а не только при
      // маунте (DESIGN §8.1). Zoom-level Leaflet — это «сколько метров в пикселе»: подобранный
      // под один размер, он при росте контейнера оставляет тот же масштаб и просто показывает
      // больше пустой карты вокруг — точки разъезжаются к центру и карта «отдаляется». Ровно
      // это видно при уменьшении масштаба браузера и на большом мониторе. fitBounds заново
      // держит одинаковое КАДРИРОВАНИЕ (точки занимают ту же долю карты) на любом размере.
      // invalidateSize обязателен перед фитом: без него Leaflet считает по устаревшим размерам.
      const refit = () => {
        if (!map) return;
        map.invalidateSize(false);
        map.fitBounds(bounds, fitOpts);
      };
      refit();

      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => refit());
        ro.observe(el);
      }
    });

    return () => {
      cancelled = true;
      if (ro) ro.disconnect();
      if (map) map.remove();
    };
  }, [startLat, startLon, finishLat, finishLon, wave, interactive, startLabel, finishLabel]);

  // isolation:isolate — собственный stacking context: внутренние z-index Leaflet (панель тайлов
  // ~200, overlay-пунктир ~400, маркеры ~600) иначе «протекают» до корня и рисуются ПОВЕРХ
  // модалок (z-50) — путь поездки наслаивался на открытый дамп фото-дропа. Теперь z-index карты
  // замкнуты внутри тайла, и любой fixed-оверлей выше неё.
  return (
    <div
      ref={ref}
      className={className}
      // pointer-events: в тайле none — карта статична, клик проходит сквозь неё к кнопке «открыть
      // карту». В интерактивном режиме (модалка) auto — пины ловят наведение и показывают адрес.
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
