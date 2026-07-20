import type { CSSProperties } from "react";
import type { DaySummary } from "@/lib/api/types";
import { dayOfMonth, monthOf, weekdayMondayIndex } from "@/lib/date";
import { formatSleep, formatSteps } from "@/lib/format";
import { relativeDayRu } from "@/lib/relativeDay";
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

/** Заголовки дней недели (понедельник первый, §5). Индексы 5,6 — выходные. */
const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

/**
 * Мини-сводка дня для ховер-превью (§5): относительное имя + ключевые статы.
 * Монстра тут нет намеренно — вкусы шлются, но нигде на борде не показываются.
 */
function hoverSummary(d: DaySummary, today: string): string {
  const parts = [relativeDayRu(d.date, today), d.title, `шаги ${formatSteps(d.steps)}`, `сон ${formatSleep(d.sleepMinutes)}`];
  return parts.filter(Boolean).join(" · ");
}

/**
 * Календарь (C) — главная навигация (DESIGN §5). Сетка выровнена по дням недели:
 * неделя с понедельника, новая неделя — новой строкой, выходные (сб/вс) подсвечены
 * оттенком, дни соседнего месяца приглушены (относительно месяца «сегодня»). В каждой
 * ячейке — число дня (mono) и маркер имени; сегодня в пиксель-рамке, выбранный — обводкой
 * акцента, будущие приглушены. Клик = перефокус «Сегодня». Цвет вкуса монстра не рисуется:
 * вкус читается только текстом в подписи дня (aria-label/title).
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
  // Выравнивание по неделям: пустые ячейки перед первым днём до понедельника.
  const pad = days.length > 0 ? weekdayMondayIndex(days[0].date) : 0;
  const weeks = Math.max(1, Math.ceil((pad + days.length) / 7));
  const todayMonth = monthOf(today);

  return (
    <TileShell state={state} onRetry={onRetry} label="календарь" ariaLabel="Календарь" style={style} className={className}>
      <div className="flex h-full flex-col gap-1">
        {/* Шапка дней недели — выходные тоном выделены. */}
        <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              aria-hidden
              className="text-center"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-tertiary)",
                background: i >= 5 ? "var(--cal-weekend)" : undefined,
                borderRadius: "var(--radius-sm)",
              }}
            >
              {w}
            </div>
          ))}
        </div>

        {/* Сетка дней: ровно `weeks` строк, недели слева направо с понедельника. */}
        <div
          role="grid"
          className="grid min-h-0 flex-1 gap-1"
          style={{
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: pad }, (_, i) => (
            <div key={`pad-${i}`} aria-hidden />
          ))}

          {days.map((d) => {
            const isToday = d.date === today;
            const isSelected = d.date === selected;
            const isFuture = d.date > today;
            const isWeekend = weekdayMondayIndex(d.date) >= 5;
            const isOtherMonth = monthOf(d.date) !== todayMonth;

            const border = isToday
              ? "2px solid var(--border-pixel)"
              : isSelected
                ? "2px solid var(--accent)"
                : "1px solid var(--border)";

            // Приоритет фона: соседний месяц → выходной → есть данные → пусто.
            const background = isOtherMonth
              ? "var(--cal-othermonth)"
              : isWeekend
                ? "var(--cal-weekend)"
                : d.hasData
                  ? "var(--bg-surface)"
                  : "var(--bg-surface-muted)";

            return (
              <button
                key={d.date}
                type="button"
                role="gridcell"
                data-testid={`day-${d.date}`}
                data-today={isToday || undefined}
                data-selected={isSelected || undefined}
                data-future={isFuture || undefined}
                data-other-month={isOtherMonth || undefined}
                data-weekend={isWeekend || undefined}
                data-has-name={d.title ? true : undefined}
                aria-current={isToday ? "date" : undefined}
                aria-label={`${dayOfMonth(d.date)}, ${hoverSummary(d, today)}`}
                title={hoverSummary(d, today)}
                onClick={() => onSelect(d.date)}
                className="relative flex min-h-0 cursor-pointer items-center justify-center"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  fontWeight: isToday ? 500 : 400,
                  border,
                  borderRadius: "var(--radius-sm)",
                  background,
                  color: isFuture ? "var(--text-tertiary)" : isOtherMonth ? "var(--text-secondary)" : "var(--text-primary)",
                  opacity: isFuture ? 0.7 : 1,
                }}
              >
                {dayOfMonth(d.date)}

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
      </div>
    </TileShell>
  );
}
