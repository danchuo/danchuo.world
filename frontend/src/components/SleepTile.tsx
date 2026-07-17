"use client";

import type { CSSProperties } from "react";
import type { DayView } from "@/lib/api/types";
import { formatSleep, formatSleepShort } from "@/lib/format";
import { relativeDayRu } from "@/lib/relativeDay";
import { sleepPhases } from "./sleepPhases";
import { BedIcon, SleepBigIcon } from "./StatsIcons";
import { TileShell, type TileState } from "./TileShell";

interface SleepTileProps {
  /** Выбранный день (перефокус календаря) — источник длительности и фаз. */
  day: DayView | null;
  today: string;
  state: TileState;
  onRetry?: () => void;
  style?: CSSProperties;
  className?: string;
}

/** Число ячеек пиксельного бара фазы (та же длина, ячейки мельче — как в макете). */
const BAR_CELLS = 15;

/** Цвет фазы — токены волны (rem — акцент, deep — глина, light — графит). */
const PHASE_COLOR: Record<string, string> = {
  rem: "var(--accent)",
  deep: "var(--border-tile)",
  light: "var(--text-secondary)",
};

/** Пиксельный бар доли фазы: ряд ячеек, залитых пропорционально проценту (§7.7). */
function PixelBar({ pct, color }: { pct: number; color: string }) {
  const filled = Math.round((pct / 100) * BAR_CELLS);
  return (
    <div className="flex min-w-0 flex-1 gap-[2px]" aria-hidden>
      {Array.from({ length: BAR_CELLS }, (_, i) => (
        <span
          key={i}
          className="aspect-square flex-1 rounded-[1px]"
          style={{
            background: i < filled ? color : "var(--text-tertiary)",
            opacity: i < filled ? 1 : 0.16,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Плитка «сон» (§7.7) — детали ночи выбранного дня: длительность, пробуждения и разбивка по
 * фазам (REM/deep/light) пиксельными барами с минутами и долей. Фаз нет (часы не носили) ⇒
 * деградирует до одной длительности. Нет сна за день ⇒ тихое «нет данных» (§5.4).
 */
export function SleepTile({ day, today, state, onRetry, style, className }: SleepTileProps) {
  const minutes = day?.health.sleepMinutes ?? null;
  const hasData = day != null && minutes !== null;
  // Пустое состояние рисуем сами (кровать + текст), поэтому TileShell держим в «loaded».
  const showEmpty = state === "loaded" && !hasData;
  const phases = sleepPhases(day?.health.sleepStages);
  const awake = day?.health.sleepStages?.awake ?? null;
  const dateLabel = day ? relativeDayRu(day.date, today) : "";

  return (
    <TileShell
      state={showEmpty ? "loaded" : state}
      onRetry={onRetry}
      ariaLabel="Сон"
      style={style}
      className={className}
    >
      {showEmpty && (
        <div className="flex h-full items-center justify-center gap-4">
          <BedIcon height={62} />
          <span className="text-sm" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
            нет данных о сне
          </span>
        </div>
      )}
      {hasData && (
        <div className="flex h-full min-w-0 flex-col" style={{ fontFamily: "var(--font-mono)" }}>
          {/* «сон» и день — одной строкой сверху (день сразу за «сон»), чтобы не тратить вертикаль. */}
          <div className="mb-1 flex items-baseline gap-3">
            <span className="tile-label">сон</span>
            <span className="tile-label">{dateLabel}</span>
          </div>

          <div className="flex min-h-0 flex-1 items-stretch gap-3">
            {/* Слева — длительность ночи и пробуждения. */}
            <div className="flex w-[128px] shrink-0 flex-col justify-center">
              <div className="flex items-center gap-2">
                <SleepBigIcon height={26} />
                <span className="whitespace-nowrap text-xl leading-none" style={{ color: "var(--text-primary)" }}>
                  {formatSleepShort(minutes)}
                </span>
              </div>
              {awake !== null && (
                <div className="mt-1.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
                  ворочался и не спал <span style={{ color: "var(--accent)" }}>{formatSleep(awake)}</span>
                </div>
              )}
            </div>

            {/* Справа — фазы пиксельными барами, отделённые вертикальной линией (как в макете). */}
            {phases ? (
              <div
                className="flex min-w-0 flex-1 flex-col justify-center gap-2 pl-3"
                style={{ borderLeft: "1px solid var(--border-tile)" }}
              >
                {phases.map((p) => (
                  <div key={p.key} className="flex items-center gap-1.5 text-xs">
                    <span className="w-10 shrink-0 whitespace-nowrap font-medium" style={{ color: PHASE_COLOR[p.key] }}>
                      {p.label}
                    </span>
                    <PixelBar pct={p.pct} color={PHASE_COLOR[p.key]} />
                    <span className="w-12 shrink-0 whitespace-nowrap text-right" style={{ color: "var(--text-tertiary)" }}>
                      {formatSleepShort(p.minutes)}
                    </span>
                    <span className="w-7 shrink-0 whitespace-nowrap text-right" style={{ color: PHASE_COLOR[p.key] }}>
                      {p.pct}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="flex min-w-0 flex-1 items-center pl-3 text-xs"
                style={{ color: "var(--text-tertiary)", borderLeft: "1px solid var(--border-tile)" }}
              >
                фазы не записаны
              </div>
            )}
          </div>
        </div>
      )}
    </TileShell>
  );
}
