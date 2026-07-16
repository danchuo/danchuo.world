"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { getRides } from "@/lib/api/client";
import type { RideView } from "@/lib/api/types";
import { mskToday } from "@/lib/date";
import { relativeDayRu } from "@/lib/relativeDay";
import { formatDuration, formatKm } from "@/lib/rideFormat";
import { RideMap } from "./RideMap";
import { RidesModal } from "./RidesModal";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

interface RideTileProps {
  /** Активная волна — пробрасывается в мини-карту для выбора пиксельных пинов (DESIGN §12). */
  wave?: string | null;
  style?: CSSProperties;
  className?: string;
}

const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

/**
 * Виджет последней поездки Велобайк (B4, PRD §9, DESIGN §7.6) — высокий вертикальный тайл:
 * мини-карта старт→финиш (2 точки, трека нет), основные цифры (дистанция/время/калории),
 * относительное «когда» и станции; снизу кнопка «предыдущие» → модалка со списком прошлых
 * поездок (тот же контур, что у фото-дропов). Пусто до первого ingest — тихий empty (§7).
 * Ноль хардкод-цветов (токены волны).
 */
export function RideTile({ wave, style, className }: RideTileProps) {
  const { phase, data, retry } = useTileData<RideView[]>(
    useCallback((signal) => getRides({ signal }), []),
    "rides",
  );
  const [modalOpen, setModalOpen] = useState(false);
  const today = mskToday();
  const rides = data ?? [];
  const latest = rides[0];
  const isEmpty = phase === "loaded" && rides.length === 0;

  const hasCoords =
    latest?.startLat != null &&
    latest?.startLon != null &&
    latest?.finishLat != null &&
    latest?.finishLon != null;

  return (
    <>
      <TileShell
        state={isEmpty ? "empty" : phase}
        emptyText="поездок пока нет"
        onRetry={retry}
        label="велобайк"
        ariaLabel="Последняя поездка на Велобайке"
        style={style}
        className={className}
      >
      {phase === "loaded" && !isEmpty && latest && (
        <div className="flex h-full flex-col gap-2">
          {hasCoords && (
            // Клик по карте открывает модалку поездок (карта статична и pointer-events:none —
            // клики доходят до кнопки). Тот же вход, что и «предыдущие».
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              aria-label="Открыть карту поездок"
              className="tap-target"
              style={{
                flex: "1 1 42%",
                minHeight: 80,
                overflow: "hidden",
                borderRadius: "var(--radius-sm)",
                border: "none",
                padding: 0,
                background: "none",
                cursor: "pointer",
                display: "block",
                width: "100%",
              }}
            >
              <RideMap
                startLat={latest.startLat!}
                startLon={latest.startLon!}
                finishLat={latest.finishLat!}
                finishLon={latest.finishLon!}
                wave={wave}
              />
            </button>
          )}

          <div className="flex flex-col gap-1">
            {/* «Когда» слева, «предыдущие» — по правому краю той же строки. */}
            <div className="flex items-baseline justify-between gap-2">
              <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{relativeDayRu(latest.rideDate, today)}</span>
              {rides.length > 1 && (
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="tap-target shrink-0 cursor-pointer"
                  aria-label="Предыдущие поездки"
                  style={{ ...mono, color: "var(--accent)", background: "none", border: "none", fontSize: 11 }}
                >
                  предыдущие
                </button>
              )}
            </div>

            {/* Цифры на тайле: дистанция (крупно) слева, длительность (чуть меньше) прижата к
                правому краю — чтобы правая сторона не пустовала. Калории на тайле не показываем —
                они остаются только в модалке (строки списка). */}
            <div className="flex items-baseline justify-between gap-x-2" style={{ ...mono, color: "var(--text-primary)" }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>{formatKm(latest.distanceMeters)}</span>
              <span style={{ fontSize: 16, color: "var(--text-secondary)" }}>{formatDuration(latest.durationSeconds)}</span>
            </div>

          </div>
        </div>
      )}
      </TileShell>

      {/* Модалка — сиблинг TileShell (не внутри): у .pixel-tile clip-path/тень создают
          containing block, и fixed-оверлей внутри тайла обрезался бы им вместо вьюпорта.
          Тот же приём, что у фото-дропов (§7.5) — окно сверху на весь экран. */}
      {modalOpen && <RidesModal rides={rides} today={today} wave={wave} onClose={() => setModalOpen(false)} />}
    </>
  );
}
