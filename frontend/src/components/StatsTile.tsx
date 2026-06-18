import type { CSSProperties } from "react";
import type { DaySummary, DayView } from "@/lib/api/types";
import { formatSleep, formatSteps } from "@/lib/format";
import { TileShell, type TileState } from "./TileShell";

interface StatsTileProps {
  day: DayView | null;
  /** Окно для мини-графика — то же `days?from=&to=`, без отдельного эндпоинта (§7.4). */
  window: DaySummary[];
  state: TileState;
  onRetry?: () => void;
  style?: CSSProperties;
  className?: string;
}

/** Спарклайн шагов за окно (§7.4): дни без данных — разрывы, не нули (PRD §5.4). */
function Sparkline({ window }: { window: DaySummary[] }) {
  const points = window
    .map((d, i) => ({ i, v: d.steps }))
    .filter((p): p is { i: number; v: number } => p.v !== null);
  if (points.length < 2) return null;

  const max = Math.max(...points.map((p) => p.v), 1);
  const n = Math.max(window.length - 1, 1);
  const path = points
    .map((p) => `${(p.i / n) * 100},${28 - (p.v / max) * 26}`)
    .join(" ");

  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-7 w-full" aria-hidden>
      <polyline
        points={path}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Статы (S) — значения выбранного дня (шаги/сон/тренировка) + мини-график шагов за окно
 * (DESIGN §7.4). null ≠ 0: реальный 0 рисуется как 0, отсутствие — «нет данных».
 */
export function StatsTile({ day, window, state, onRetry, style, className }: StatsTileProps) {
  const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

  return (
    <TileShell state={state} onRetry={onRetry} ariaLabel="Статы" style={style} className={className}>
      {day && (
        <div className="flex h-full flex-col gap-2" style={mono}>
          <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>статы</div>
          <div className="flex justify-between">
            <span style={{ color: "var(--text-secondary)" }}>шаги</span>
            <span>{formatSteps(day.health.steps)}</span>
          </div>
          <Sparkline window={window} />
          <div className="flex justify-between">
            <span style={{ color: "var(--text-secondary)" }}>сон</span>
            <span>{formatSleep(day.health.sleepMinutes)}</span>
          </div>
          {day.workouts.length > 0 && (
            <div className="flex justify-between">
              <span style={{ color: "var(--text-secondary)" }}>тренировка</span>
              <span>
                {day.workouts[0].type} · {day.workouts[0].durationMinutes} мин
              </span>
            </div>
          )}
        </div>
      )}
    </TileShell>
  );
}
