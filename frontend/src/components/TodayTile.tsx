import type { CSSProperties } from "react";
import type { DayView } from "@/lib/api/types";
import { formatFraction, formatSleep, formatSteps, isDisciplineDone } from "@/lib/format";
import { relativeDayRu } from "@/lib/relativeDay";
import { TileShell, type TileState } from "./TileShell";

interface TodayTileProps {
  day: DayView | null;
  /** Сегодня MSK — для относительной подписи плитки («вчера», «в прошлый вторник», …). */
  today: string;
  state: TileState;
  onRetry?: () => void;
  style?: CSSProperties;
  className?: string;
}

// Форматтер строится один раз на модуль (создание Intl дорогое). День+месяц — из Intl,
// год дописываем словом «год» (Intl в ru-RU даёт «г.», а мы хотим полностью, DESIGN §4).
const DAY_MONTH_RU_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** Mono-стиль — статичен, держим вне компонента (не пересобираем на рендер). */
const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

/** Длинная дата RU в mono (DESIGN §4): «3 июля 2026 год» — год словом, без «г.». */
function longDateRu(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAY_MONTH_RU_FMT.format(d)} ${d.getUTCFullYear()} год`;
}

/**
 * Плитка «Сегодня» (T) — доминанта борда (DESIGN §3, §4). Иерархия: дата → имя дня →
 * статы строкой → дисциплина дробями → монстр. Пустой/будущий день — валидный вид:
 * статы «нет данных» (но 0 как 0), дисциплина в каркасе с 0, монстр «не пил».
 */
export function TodayTile({ day, today, state, onRetry, style, className }: TodayTileProps) {
  // Подпись плитки относительна выбранной дате: «сегодня» только когда выбран сегодня.
  const label = day ? relativeDayRu(day.date, today) : "сегодня";
  // Выбран день соседнего месяца → фон плитки чуть меняется (§4), как и ячейка в календаре.
  const otherMonth = day != null && day.date.slice(0, 7) !== today.slice(0, 7);
  const tileStyle = otherMonth ? { ...style, background: "var(--surface-othermonth)" } : style;
  return (
    <TileShell
      state={state}
      onRetry={onRetry}
      elevated
      label={label}
      ariaLabel="Сегодня"
      style={tileStyle}
      // Заклёпки (§2.4) — только на фокусной плитке; кант приходит из .pixel-tile.
      className={["pixel-tile--rivets", className].filter(Boolean).join(" ")}
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
