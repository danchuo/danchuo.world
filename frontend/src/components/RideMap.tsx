"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

interface RideMapProps {
  startLat: number;
  startLon: number;
  finishLat: number;
  finishLon: number;
  className?: string;
}

/**
 * Мини-карта поездки Велобайк (PRD §9 B4, DESIGN §7.6). Геоданных только две точки — старт и
 * финиш (трека маршрута API не отдаёт), поэтому рисуем 2 кружка (старт зелёный, финиш красный)
 * и **пунктирную прямую** между ними — честно «по прямой», не пройденный путь.
 *
 * Базовая карта — CARTO Voyager (мягкий минимал, бесплатные тайлы; атрибуция OSM/CARTO).
 * Leaflet грузится динамически в эффекте (SSR-safe, только в браузере); circleMarker вместо
 * дефолтных пинов — у тех известная проблема с путями иконок в бандлере. Карта намеренно
 * статична (без перетаскивания/зума колесом) — это виджет, а не интерактивный атлас.
 *
 * Линия старт→финиш — **пологая пунктирная дуга** (квадратичная Безье), а не прямая: живее
 * читается и честно остаётся «связью A→B», не выдавая себя за пройденный маршрут (трека нет).
 */
const ARC_COLOR = "#c2603f";

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

export function RideMap({ startLat, startLon, finishLat, finishLon, className }: RideMapProps) {
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

      L.circleMarker(start, { radius: 5, color: "#2f9e44", fillColor: "#2f9e44", fillOpacity: 1, weight: 2 }).addTo(map);
      L.circleMarker(finish, { radius: 5, color: "#e03131", fillColor: "#e03131", fillOpacity: 1, weight: 2 }).addTo(map);

      const bounds = L.latLngBounds([start, finish]).pad(0.35);
      map.fitBounds(bounds);
      // Контейнер мог измениться в размере после маунта (грид) — пересчитываем тайлы.
      setTimeout(() => map && map.invalidateSize(), 0);
    });

    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [startLat, startLon, finishLat, finishLon]);

  return <div ref={ref} className={className} style={{ width: "100%", height: "100%", borderRadius: "var(--radius-sm)" }} aria-hidden />;
}
