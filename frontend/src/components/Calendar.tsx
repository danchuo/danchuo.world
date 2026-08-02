import type { CSSProperties } from "react";
import type { DaySummary } from "@/lib/api/types";
import { dayOfMonth, monthOf, weekdayMondayIndex } from "@/lib/date";
import { lensMatch, lensNote, lensTitle, type DisciplineLens, type LensMatch } from "@/lib/disciplineLens";
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
  /** Линза дисциплины (§5.3): выбранная на карте-тропе остановка, по которой размечены дни. */
  lens?: DisciplineLens | null;
  /** Снятие линзы крестиком в ярлыке. Без обработчика крестик не рисуется. */
  onLensChange?: (lens: DisciplineLens | null) => void;
  style?: CSSProperties;
  className?: string;
}

/** Заголовки дней недели (понедельник первый, §5). Индексы 5,6 — выходные. */
const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

/**
 * Мини-сводка дня для ховер-превью (§5): относительное имя + ключевые статы.
 * Монстра тут нет намеренно — вкусы шлются, но нигде на борде не показываются.
 */
function hoverSummary(d: DaySummary, today: string, lensLine: string | null): string {
  const parts = [
    relativeDayRu(d.date, today),
    d.title,
    // Ответ линзы — первым после имени: пока она включена, это то, ради чего в ячейку смотрят.
    lensLine,
    `шаги ${formatSteps(d.steps)}`,
    `сон ${formatSleep(d.sleepMinutes)}`,
  ];
  return parts.filter(Boolean).join(" · ");
}

/**
 * Календарь (C) — главная навигация (DESIGN §5). Сетка выровнена по дням недели:
 * неделя с понедельника, новая неделя — новой строкой, выходные (сб/вс) подсвечены
 * оттенком, дни соседнего месяца приглушены (относительно месяца «сегодня»). В каждой
 * ячейке — число дня (mono) и маркер имени; сегодня в пиксель-рамке, выбранный — обводкой
 * акцента, будущие приглушены. Клик = перефокус «Сегодня». Цвет вкуса монстра не рисуется:
 * вкус читается только текстом в подписи дня (aria-label/title).
 *
 * С включённой **линзой** (§5.3) календарь становится фильтром по одной остановке карты-тропы:
 * совпавший день обводится рамкой со скошенными углами в чистом акценте, несовпавший гасит
 * цифру, а день без ответа (пропуск/будущее) остаётся как был. Заливка при этом НЕ трогается —
 * она отвечает только на вопрос «когда»; выключенная линза не меняет рендер вовсе.
 */
export function Calendar({
  days,
  selected,
  today,
  onSelect,
  state,
  onRetry,
  lens = null,
  onLensChange,
  style,
  className,
}: CalendarProps) {
  // Выравнивание по неделям: пустые ячейки перед первым днём до понедельника. Борд шлёт
  // окно целыми неделями (§5.3), так что штатно pad = 0; расчёт остаётся страховкой на
  // случай произвольного диапазона — сетка не должна разъезжаться от чужой выборки.
  const pad = days.length > 0 ? weekdayMondayIndex(days[0].date) : 0;
  const weeks = Math.max(1, Math.ceil((pad + days.length) / 7));
  const todayMonth = monthOf(today);

  return (
    <TileShell
      state={state}
      onRetry={onRetry}
      // Ярлык называет линзу и даёт её снять. Это не украшение: в выходной карта-тропа уступает
      // место сцене отдыха, и кликнуть по остановке повторно становится негде.
      label={
        lens ? (
          <span className="inline-flex items-center gap-1" data-testid="calendar-lens-label">
            календарь — {lensTitle(lens)}
            {onLensChange && (
              <button
                type="button"
                data-testid="calendar-lens-reset"
                aria-label={`снять линзу: ${lensTitle(lens)}`}
                onClick={() => onLensChange(null)}
                className="cursor-pointer leading-none"
                style={{ color: "var(--accent)" }}
              >
                ✕
              </button>
            )}
          </span>
        ) : (
          "календарь"
        )
      }
      ariaLabel="Календарь"
      style={style}
      className={className}
    >
      <div className="tile-frame flex h-full flex-col gap-1">
        {/* Шапка дней недели — выходные тоном выделены. */}
        <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              aria-hidden
              className="t-cal-weekday text-center"
              style={{
                fontFamily: "var(--font-mono)",
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
            // Дырка в записи: день прошёл, а данных за него нет. У будущего дня их и быть не
            // может, а сегодня ещё идёт — незаполненность там не пропуск.
            const isGap = d.date < today && !d.hasData;

            // Пропуск несёт РАМКА, а не заливка: заливка занята вопросом «когда» (соседний
            // месяц / выходной / будущее), и раньше «прошёл, но пусто» и «ещё не наступил»
            // красились одинаково — пропуск читался как будущее.
            const border = isToday
              ? "2px solid var(--border-pixel)"
              : isSelected
                ? "2px solid var(--accent)"
                : isGap
                  ? "1px dashed var(--border)"
                  : "1px solid var(--border)";

            // Приоритет фона: выходной соседнего месяца → соседний месяц → выходной → будущее →
            // обычная поверхность. Своя заливка у чужого выходного нужна потому, что «чужой
            // месяц» перебивал «выходной», и внутри соседнего месяца колонка сб/вс исчезала —
            // а в начале месяца он занимает большую часть окна (замерено 19 ячеек из 28), то
            // есть выходных не было видно на две трети календаря.
            const base = isOtherMonth
              ? isWeekend
                ? "var(--cal-othermonth-weekend)"
                : "var(--cal-othermonth)"
              : isWeekend
                ? "var(--cal-weekend)"
                : isFuture
                  ? "var(--bg-surface-muted)"
                  : "var(--bg-surface)";

            // Линза заливку НЕ трогает: совпавший день несёт рамку со скошенными углами в чистом
            // акценте (`.cal-lens-frame`). Подмес акцента в заливку пробовали — тон выходил мутный.
            const match: LensMatch | null = lens ? lensMatch(d, lens) : null;
            const lensLine = lens && match ? lensNote(match, lens) : null;
            // Несовпавший день гасим цифрой — это единственный свободный канал: рамка занята
            // «сегодня/выбран/пропуск», нижняя точка — именем дня.
            const dimmedByLens = match === "no";

            return (
              <button
                key={d.date}
                type="button"
                role="gridcell"
                data-testid={`day-${d.date}`}
                data-today={isToday || undefined}
                data-selected={isSelected || undefined}
                data-future={isFuture || undefined}
                data-gap={isGap || undefined}
                data-other-month={isOtherMonth || undefined}
                data-weekend={isWeekend || undefined}
                data-has-name={d.title ? true : undefined}
                data-lens={match ?? undefined}
                aria-current={isToday ? "date" : undefined}
                aria-label={`${dayOfMonth(d.date)}, ${hoverSummary(d, today, lensLine)}`}
                title={hoverSummary(d, today, lensLine)}
                onClick={() => onSelect(d.date)}
                className="t-cal-day relative flex min-h-0 cursor-pointer items-center justify-center"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: isToday ? 500 : 400,
                  border,
                  borderRadius: "var(--radius-sm)",
                  background: base,
                  color:
                    isFuture || dimmedByLens
                      ? "var(--text-tertiary)"
                      : isOtherMonth
                        ? "var(--text-secondary)"
                        : "var(--text-primary)",
                  opacity: isFuture ? 0.7 : 1,
                }}
              >
                {/* Отметка линзы — скруглённая рамка на самой цифре (§5.1 DESIGN). */}
                <span
                  data-testid={match === "yes" ? `lens-frame-${d.date}` : undefined}
                  className={`cal-lens-digit${match === "yes" ? " cal-lens-digit--marked" : ""}`}
                >
                  {dayOfMonth(d.date)}
                </span>

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
