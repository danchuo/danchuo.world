import type { CSSProperties } from "react";
import type { DayView } from "@/lib/api/types";
import { formatFraction, formatSleep, formatSteps, isDisciplineDone } from "@/lib/format";
import { TileShell, type TileState } from "./TileShell";

interface TodayTileProps {
  day: DayView | null;
  state: TileState;
  onRetry?: () => void;
  style?: CSSProperties;
  className?: string;
}

/** Длинная дата RU в mono (DESIGN §4 — «ДАТА крупно, mono»). */
function longDateRu(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

/**
 * Плитка «Сегодня» (T) — доминанта борда (DESIGN §3, §4). Иерархия: дата → имя дня →
 * статы строкой → дисциплина дробями → монстр. Пустой/будущий день — валидный вид:
 * статы «нет данных» (но 0 как 0), дисциплина в каркасе с 0, монстр «не пил».
 */
export function TodayTile({ day, state, onRetry, style, className }: TodayTileProps) {
  const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

  return (
    <TileShell
      state={state}
      onRetry={onRetry}
      elevated
      ariaLabel="Сегодня"
      style={style}
      className={className}
    >
      {day && (
        <div className="flex h-full flex-col gap-3">
          <div
            data-testid="today-date"
            style={{ ...mono, fontSize: "clamp(28px, 4vw, 40px)", lineHeight: 1.2 }}
          >
            {longDateRu(day.date)}
          </div>

          {day.title && (
            <div data-testid="today-title" style={{ ...mono, color: "var(--accent)", fontSize: 20 }}>
              {day.title}
            </div>
          )}

          <div style={{ ...mono, color: "var(--text-secondary)" }} className="flex flex-wrap gap-x-4">
            <span>шаги: {formatSteps(day.health.steps)}</span>
            <span>сон: {formatSleep(day.health.sleepMinutes)}</span>
            {day.workouts.length > 0 && (
              <span>
                тренировка: {day.workouts[0].type} {day.workouts[0].durationMinutes} мин
              </span>
            )}
          </div>

          <ul className="flex flex-col gap-1">
            {day.discipline.map((item) => {
              const done = isDisciplineDone(item.count, item.target);
              return (
                <li
                  key={item.key}
                  data-testid={`discipline-${item.key}`}
                  data-done={done}
                  className="flex justify-between"
                  style={{ ...mono, color: done ? "var(--success)" : "var(--text-secondary)" }}
                >
                  <span>{item.label}</span>
                  <span>{formatFraction(item.count, item.target)}</span>
                </li>
              );
            })}
          </ul>

          <div className="mt-auto flex items-center gap-3">
            {day.monster ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={day.monster.imageUrl}
                  alt={`Монстр: ${day.monster.name}`}
                  width={40}
                  height={40}
                  style={{ imageRendering: "pixelated" }}
                />
                <span style={mono}>{day.monster.name}</span>
                {day.monster.accentColor && (
                  <span
                    data-testid="monster-accent"
                    aria-hidden
                    style={{
                      width: "calc(var(--px) * 2)",
                      height: "calc(var(--px) * 2)",
                      background: day.monster.accentColor,
                      display: "inline-block",
                    }}
                  />
                )}
              </>
            ) : (
              <span data-testid="monster-none" style={{ ...mono, color: "var(--text-tertiary)" }}>
                монстр: не пил
              </span>
            )}
          </div>
        </div>
      )}
    </TileShell>
  );
}
