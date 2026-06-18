import type { CSSProperties } from "react";
import type { DaySummary } from "@/lib/api/types";
import { dayOfMonth } from "@/lib/date";
import { formatSleep, formatSteps } from "@/lib/format";
import { TileShell, type TileState } from "./TileShell";

interface CalendarProps {
  days: DaySummary[];
  selected: string;
  today: string;
  onSelect: (date: string) => void;
  state: TileState;
  onRetry?: () => void;
  style?: CSSProperties;
  className?: string;
}

/** Мини-сводка дня для ховер-превью (§5): имя + ключевые статы. */
function hoverSummary(d: DaySummary): string {
  const parts = [d.title, `шаги ${formatSteps(d.steps)}`, `сон ${formatSleep(d.sleepMinutes)}`];
  if (d.monster) parts.push(`монстр ${d.monster.name}`);
  return parts.filter(Boolean).join(" · ");
}

/**
 * Календарь ±15 (C) — главная навигация (DESIGN §5). В каждой ячейке — число дня (mono),
 * акцент-пиксель монстра, маркер имени; сегодня в пиксель-рамке, выбранный — обводкой
 * акцента, будущие приглушены. Клик = перефокус «Сегодня» на дату (через [onSelect]).
 */
export function Calendar({
  days,
  selected,
  today,
  onSelect,
  state,
  onRetry,
  style,
  className,
}: CalendarProps) {
  return (
    <TileShell state={state} onRetry={onRetry} ariaLabel="Календарь" style={style} className={className}>
      <div
        role="grid"
        className="grid h-full gap-1"
        style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
      >
        {days.map((d) => {
          const isToday = d.date === today;
          const isSelected = d.date === selected;
          const isFuture = d.date > today;

          const border = isToday
            ? "2px solid var(--border-pixel)"
            : isSelected
              ? "2px solid var(--accent)"
              : "1px solid var(--border)";

          return (
            <button
              key={d.date}
              type="button"
              role="gridcell"
              data-testid={`day-${d.date}`}
              data-today={isToday || undefined}
              data-selected={isSelected || undefined}
              data-future={isFuture || undefined}
              data-has-monster={d.monster ? true : undefined}
              data-has-name={d.title ? true : undefined}
              aria-current={isToday ? "date" : undefined}
              aria-label={`${dayOfMonth(d.date)}: ${hoverSummary(d)}`}
              title={hoverSummary(d)}
              onClick={() => onSelect(d.date)}
              className="relative flex aspect-square min-h-0 cursor-pointer items-center justify-center"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                fontWeight: isToday ? 500 : 400,
                border,
                borderRadius: "var(--radius-sm)",
                background: d.hasData ? "var(--bg-surface)" : "var(--bg-surface-muted)",
                color: isFuture ? "var(--text-tertiary)" : "var(--text-primary)",
                opacity: isFuture ? 0.7 : 1,
              }}
            >
              {dayOfMonth(d.date)}

              {/* Крупный пиксель цвета вкуса в углу (§6) — дублируется в aria-label/title. */}
              {d.monster?.accentColor && (
                <span
                  data-testid={`monster-pixel-${d.date}`}
                  aria-hidden
                  className="absolute right-0 top-0"
                  style={{
                    width: "var(--px)",
                    height: "var(--px)",
                    background: d.monster.accentColor,
                  }}
                />
              )}

              {/* Маркер «есть имя» (§5) — мелкая пиксель-точка снизу. */}
              {d.title && (
                <span
                  data-testid={`name-mark-${d.date}`}
                  aria-hidden
                  className="absolute bottom-0.5 left-1/2 -translate-x-1/2"
                  style={{ width: 2, height: 2, background: "var(--accent)" }}
                />
              )}
            </button>
          );
        })}
      </div>
    </TileShell>
  );
}
