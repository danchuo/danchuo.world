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

export function RideMap({ startLat, startLon, finishLat, finishLon, wave, className }: RideMapProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any = null;

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

      const pins = wave ? RIDE_PINS[wave] : undefined;
      if (pins) {
        // Пиксельные пины: якорь — острый кончик (снизу-по-центру), голова возвышается над точкой.
        const pinMarker = (p: [number, number], spec: PinSpec) =>
          L.marker(p, {
            icon: L.icon({
              iconUrl: spec.url,
              iconSize: [spec.w, spec.h],
              iconAnchor: [spec.w / 2, spec.h],
              className: "ride-pin-icon",
            }),
            interactive: false,
            keyboard: false,
          }).addTo(map);
        pinMarker(start, pins.start);
        pinMarker(finish, pins.finish);
      } else {
        L.circleMarker(start, { radius: 5, color: "#2f9e44", fillColor: "#2f9e44", fillOpacity: 1, weight: 2 }).addTo(map);
        L.circleMarker(finish, { radius: 5, color: "#e03131", fillColor: "#e03131", fillOpacity: 1, weight: 2 }).addTo(map);
      }

      const bounds = L.latLngBounds([start, finish]).pad(0.35);
      // Пиксельные пины «висят» головой над точкой — добавляем пиксельный отступ сверху, чтобы
      // головы не срезались верхней кромкой тайла (кончики внизу малы — снизу отступ минимальный).
      map.fitBounds(bounds, pins ? { paddingTopLeft: L.point(6, 36), paddingBottomRight: L.point(6, 8) } : undefined);
      // Контейнер мог измениться в размере после маунта (грид) — пересчитываем тайлы.
      setTimeout(() => map && map.invalidateSize(), 0);
    });

    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [startLat, startLon, finishLat, finishLon, wave]);

  // isolation:isolate — собственный stacking context: внутренние z-index Leaflet (панель тайлов
  // ~200, overlay-пунктир ~400, маркеры ~600) иначе «протекают» до корня и рисуются ПОВЕРХ
  // модалок (z-50) — путь поездки наслаивался на открытый дамп фото-дропа. Теперь z-index карты
  // замкнуты внутри тайла, и любой fixed-оверлей выше неё.
  return (
    <div
      ref={ref}
      className={className}
      style={{ width: "100%", height: "100%", borderRadius: "var(--radius-sm)", isolation: "isolate" }}
      aria-hidden
    />
  );
}
