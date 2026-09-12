import { useMemo, useRef, type CSSProperties } from "react";
import type { DaySummary } from "@/lib/api/types";
import { monthEdges } from "@/lib/calendarWindow";
import { dayOfMonth, monthNameRu, monthOf, monthShortRu, weekdayMondayIndex } from "@/lib/date";
import {
  lensMatch,
  lensNote,
  lensTitle,
  lensTone,
  type DisciplineLens,
  type LensMatch,
} from "@/lib/disciplineLens";
import { formatSleep, formatSteps } from "@/lib/format";
import { relativeDayRu } from "@/lib/relativeDay";
import { TileShell, type TileState } from "./TileShell";
import { useWheelPaging } from "./useWheelPaging";

interface CalendarProps {
  days: DaySummary[];
  selected: string;
  today: string;
  /**
   * Опора окна (§5.3): день, вокруг недели которого борд собрал [days]. Двигается листанием,
   * по умолчанию равен «сегодня». Задаёт, какой месяц в сетке считается своим, — и только это:
   * «сегодня», «будущее» и «пропуск» по-прежнему считаются от [today].
   */
  anchor?: string;
  onSelect: (date: string) => void;
  state: TileState;
  onRetry?: () => void;
  /** Сдвиг окна на N недель (−1 назад, +1 вперёд). Без обработчика листания нет вовсе. */
  onShiftWeeks?: (weeks: number) => void;
  /** Возврат окна в домашнее положение. Показывается только у сдвинутого окна. */
  onResetWindow?: () => void;
  /** Есть ли что листать назад: у генезиса стрелка убирается, а не становится мёртвой. */
  canGoBack?: boolean;
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
 * Окно — не вся история, а четыре недели вокруг **опоры** ([anchor], §5.3). Недели за его
 * краем достаются листанием: тихий ряд стрелок над шапкой двигает опору на неделю за клик,
 * из сдвинутого окна есть шаг вперёд и возврат к сегодня. Листание меняет только ОКНО —
 * выбранный день (а с ним и плитка «Сегодня») остаётся там, где был: это просмотр, а не выбор.
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
  anchor,
  onSelect,
  state,
  onRetry,
  onShiftWeeks,
  onResetWindow,
  canGoBack = true,
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
  const windowAnchor = anchor ?? today;
  // Ступенька границ месяцев — прогонами, а не поклеточно (см. `monthEdges` и слой ниже).
  // Текущий месяц метку не получает: он назван плиткой «Сегодня», и линия там была бы шумом.
  const currentMonth = monthOf(today);
  const edges = useMemo(() => monthEdges(days, pad, currentMonth), [days, pad, currentMonth]);
  // Домашнее положение = окно вокруг сегодня. Оно же — единственное, из которого некуда
  // идти вперёд, поэтому вторая стрелка и возврат в нём просто не рисуются.
  const shifted = windowAnchor !== today;
  const canPage = Boolean(onShiftWeeks);
  const heading = shifted ? monthNameRu(windowAnchor, today) : "календарь";

  // Листание колесом/тачпадом по всей плитке (PRD §5.3): те же шаги, что у стрелок, и те же
  // границы — дома вперёд некуда, у генезиса некуда назад. Стрелки остаются: жест их не
  // заменяет, а дополняет (на таче колеса нет, а видимый орган управления нужен всегда).
  const shellRef = useRef<HTMLElement>(null);
  useWheelPaging(shellRef, onShiftWeeks, { back: canGoBack, forward: shifted });

  return (
    <TileShell
      ref={shellRef}
      state={state}
      onRetry={onRetry}
      // Ярлык называет линзу и даёт её снять. Это не украшение: в выходной карта-тропа уступает
      // место сцене отдыха, и кликнуть по остановке повторно становится негде.
      //
      // Здесь же, у правого края той же строки, живёт листание недель (§5.3): своей строки ему
      // не дали намеренно — она отбирала высоту у сетки, и клетки мельчали (замечено владельцем).
      // Отлистанное окно подменяет слово «календарь» именем своего месяца: по числам дней месяц
      // не опознать, а дома он и так известен из «Сегодня», и второе слово было бы шумом.
      label={
        <span className="cal-label-row flex w-full items-center justify-between gap-2">
          <span
            className="min-w-0 truncate"
            data-testid={shifted ? "calendar-window-month" : undefined}
          >
            {lens ? (
              <span className="inline-flex items-center gap-1" data-testid="calendar-lens-label">
                {heading} — {lensTitle(lens)}
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
              heading
            )}
          </span>

          {canPage && (
            <span className="cal-nav flex shrink-0 items-center gap-1">
              {canGoBack && (
                <button
                  type="button"
                  data-testid="calendar-prev"
                  aria-label="показать предыдущую неделю"
                  onClick={() => onShiftWeeks?.(-1)}
                  className="cal-nav-btn cursor-pointer"
                >
                  ‹
                </button>
              )}
              {shifted && (
                <button
                  type="button"
                  data-testid="calendar-next"
                  aria-label="показать следующую неделю"
                  onClick={() => onShiftWeeks?.(1)}
                  className="cal-nav-btn cursor-pointer"
                >
                  ›
                </button>
              )}
              {shifted && onResetWindow && (
                <button
                  type="button"
                  data-testid="calendar-home"
                  aria-label="вернуть календарь к сегодня"
                  onClick={onResetWindow}
                  className="cal-nav-home cursor-pointer"
                >
                  сегодня
                </button>
              )}
            </span>
          )}
        </span>
      }
      ariaLabel="Календарь"
      style={style}
      className={className}
    >
      <div className="tile-frame flex h-full flex-col gap-1">
        {/* Шапка дней недели — выходные тоном выделены. Зазор общий с сеткой дней (6px):
            разойдись они, колонки шапки перестали бы стоять над своими числами. */}
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
        >
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
        {/* Зазор 6px, а не 4: линия стыка месяцев живёт В ЖЁЛОБЕ и на узком зазоре садилась
            на край клетки. Расширение жёлоба ужимает саму клетку — ширина сетки фиксирована. */}
        <div
          role="grid"
          className="relative grid min-h-0 gap-1.5"
          style={{
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))`,
            // Своя высота — там, где её не даёт родитель (DESIGN §8): в мобильном стеке у тайла
            // высоты нет, и сетка из flex + строк `1fr` схлопнулась бы в полоску цифр.
            // Считаем от числа недель окна: сколько их — решает борд, а не компонент.
            aspectRatio: `7 / ${weeks}`,
            // ⚠️ Полная тройка приёма §8, как у эталонного `.quest-map`, — порознь она ломается.
            // `width: 100%` НЕСУЩИЙ: без него пропорция вольна задавать не высоту, а ШИРИНУ, и
            // Safari так и делает — сетка выезжала за плитку, седьмая колонка («вс») обрезалась.
            // `flex: 1 1 auto` вместо tailwind-`flex-1` (то есть basis `0%`): при нулевом базисе
            // высоту тоже считает пропорция, сетка выходит ниже доступного места, и под ней
            // остаётся полоса голой поверхности карточки. Обе шалости — одна причина.
            width: "100%",
            flex: "1 1 auto",
          }}
        >
          {Array.from({ length: pad }, (_, i) => (
            <div key={`pad-${i}`} aria-hidden />
          ))}

          {/* Слой границ месяцев — второй грид ТОЙ ЖЕ геометрии поверх сетки. Линия не может
              жить внутри клеток: там она разваливается на отрезки по клетке, они лезут в жёлоб
              внахлёст (перекрытие даёт лишнюю плотность — линия читается толще и ярче),
              пунктир перезапускается на каждой клетке, а отсчёт идёт от `padding box`, который
              у клетки с толстой рамкой сдвинут внутрь (отсюда просевший кусок над выбранным
              днём). В своём слое отрезок один на весь прогон и ни от чего этого не зависит.
              Слой `absolute`, поэтому грид-элементом родителя не становится; `aria-hidden` +
              `pointer-events: none` — он декорация и кликам не мешает. */}
          <div
            aria-hidden
            className="cal-month-edges grid gap-1.5"
            style={{
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))`,
            }}
          >
            {edges.rows.map((r) => (
              <span
                key={`edge-h-${r.row}-${r.from}`}
                data-testid={`month-edge-h-${r.row}-${r.from}-${r.to}`}
                className="cal-month-edge cal-month-edge--h"
                style={{ gridRow: r.row + 1, gridColumn: `${r.from + 1} / ${r.to + 1}` }}
              />
            ))}
            {edges.cols.map((c) => (
              <span
                key={`edge-v-${c.row}-${c.col}`}
                data-testid={`month-edge-v-${c.row}-${c.col}`}
                className="cal-month-edge cal-month-edge--v"
                style={{ gridRow: c.row + 1, gridColumn: c.col + 1 }}
              />
            ))}
          </div>

          {days.map((d) => {
            const isToday = d.date === today;
            const isSelected = d.date === selected;
            const isFuture = d.date > today;
            const isWeekend = weekdayMondayIndex(d.date) >= 5;
            // Дырка в записи: день прошёл, а данных за него нет. У будущего дня их и быть не
            // может, а сегодня ещё идёт — незаполненность там не пропуск.
            const isGap = d.date < today && !d.hasData;

            // Подпись месяца ходит парой со своей линией: без неё она повисла бы сиротой,
            // а в домашнем окне ещё и повторяла бы то, что уже написано в «Сегодня».
            const startsMonth = dayOfMonth(d.date) === 1 && monthOf(d.date) < currentMonth;

            // Пропуск несёт РАМКА, а не заливка: заливка занята вопросом «когда» (выходной /
            // будущее), и раньше «прошёл, но пусто» и «ещё не наступил» красились одинаково —
            // пропуск читался как будущее.
            const border = isToday
              ? "2px solid var(--border-pixel)"
              : isSelected
                ? "2px solid var(--accent)"
                : isGap
                  ? "1px dashed var(--border)"
                  : "1px solid var(--border)";

            // Приоритет фона: выходной → будущее → обычная поверхность. Месяца в списке НЕТ,
            // и это несущее: заливка по месяцу зависит от того, где стоит окно, и на листании
            // всё полотно инвертируется разом (опора пересекает границу месяца раз в 4–5
            // кликов — до 28 клеток из 28 меняют тон от шага в одну неделю). Вид дня не
            // зависит от положения окна вовсе, а месяц метит граница между клетками.
            const base = isWeekend
              ? "var(--cal-weekend)"
              : isFuture
                ? "var(--bg-surface-muted)"
                : "var(--bg-surface)";

            // Линза заливку НЕ трогает: отмеченный день несёт рамку вокруг цифры
            // (`.cal-lens-digit--marked`). Подмес акцента в заливку пробовали — тон выходил мутный.
            const match: LensMatch | null = lens ? lensMatch(d, lens) : null;
            const lensLine = lens && match ? lensNote(match, lens) : null;
            // Тон отметки решает линза (§5.1): у обычного пункта отмечается только «да», у
            // монстра — ОБА ответа, разными цветами (зелёный «не пил» / тревожный «пил»).
            const tone = lens && match ? lensTone(match, lens) : null;
            // Несовпавший день гасим цифрой — это единственный свободный канал: рамка занята
            // «сегодня/выбран/пропуск», нижняя точка — именем дня. Но гасим только то, что НЕ
            // отмечено: приглушить и обвести разом значило бы сказать про день два разных
            // слова сразу («этого тут нет» и «вот оно»).
            const dimmedByLens = match === "no" && tone == null;

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
                  // Цифра чужого месяца больше не приглушается: это был тот же сигнал, что и
                  // снятая заливка, и он инвертировался бы ровно так же — просто тише.
                  color:
                    isFuture || dimmedByLens ? "var(--text-tertiary)" : "var(--text-primary)",
                  opacity: isFuture ? 0.7 : 1,
                }}
              >
                {/* Отметка линзы — скруглённая рамка на самой цифре (§5.1 DESIGN); цвет
                    рамки даёт тон линзы. */}
                <span
                  data-testid={tone ? `lens-frame-${d.date}` : undefined}
                  className={`cal-lens-digit${tone ? ` cal-lens-digit--marked cal-lens-digit--${tone}` : ""}`}
                >
                  {dayOfMonth(d.date)}
                </span>

                {/* Имя месяца — только на первом числе: граница отвечает «где стык», подпись
                    «какой месяц начался». На каждом дне она превратила бы сетку в перечисление. */}
                {startsMonth && (
                  <span
                    aria-hidden
                    data-testid={`month-mark-${d.date}`}
                    className="cal-month-mark"
                  >
                    {monthShortRu(d.date)}
                  </span>
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
      </div>
    </TileShell>
  );
}
