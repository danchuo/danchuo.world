import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { DaySummary } from "@/lib/api/types";
import { FIELD_ROWS, splitFieldWindow } from "@/lib/calendarEdge";
import { monthEdges } from "@/lib/calendarWindow";
import { dayWeight } from "@/lib/dayWeight";
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
  /**
   * Забрать день в сетку (§5.2): выбрать его и переставить окно так, чтобы он в неё попал.
   * Нужен кромке — её дни по определению лежат за краем сетки, и одного выбора им мало.
   * Без обработчика клик по кромке просто выбирает день, как клик по клетке.
   */
  onFocusDay?: (date: string) => void;
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
  /**
   * Редакция тайла (DESIGN §10.1): `field` — поле света вместо таблицы клеток (§5.2).
   * Незнакомое имя и пустое значение — базовая сетка в рамках.
   */
  edition?: string;
  /**
   * На сколько недель борд взял окно шире сетки — под **кромки** (§5.2), полоски, которыми
   * листают. `0` (дефолт) — окно ровно по сетке, кромок нет и листают стрелками; тогда сетке
   * достаётся всё окно целиком, потому что резать нечего.
   */
  edgeWeeks?: number;
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
 * Два жеста из правила выходят намеренно: клик по еле видному дню кромки забирает его в сетку
 * (выбор плюс опора на него), а «сегодня» возвращает домой и окно, и выбранный день разом.
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
  onFocusDay,
  state,
  onRetry,
  onShiftWeeks,
  onResetWindow,
  canGoBack = true,
  lens = null,
  onLensChange,
  edition,
  edgeWeeks = 0,
  style,
  className,
}: CalendarProps) {
  // Редакция «поле» (§5.2): клетка теряет рамку и подложку, а вопрос «сколько» уезжает
  // в яркость. Ветка одна на весь рендер — вид клетки расходится только здесь.
  const field = edition === "field";

  // Кромки (§5.2) — недели по краям окна, показанные полоской: они же орган листания.
  // Здесь же считается раскладка месяцев и держится потолок высоты сетки: всё это арифметика
  // по позициям в окне, и ошибиться в ней тихо — значит уронить высоту сетки.
  const slices = useMemo(
    () =>
      field
        ? splitFieldWindow(days, { edges: edgeWeeks > 0, canGoBack, maxRows: FIELD_ROWS })
        : null,
    [days, field, edgeWeeks, canGoBack],
  );
  const gridDays = useMemo(() => (slices ? slices.grid.map((p) => p.day) : days), [slices, days]);

  // Выравнивание по неделям: пустые ячейки перед первым днём до понедельника. Борд шлёт
  // окно целыми неделями (§5.3), так что штатно pad = 0; расчёт остаётся страховкой на
  // случай произвольного диапазона — сетка не должна разъезжаться от чужой выборки.
  const pad = !field && gridDays.length > 0 ? weekdayMondayIndex(gridDays[0].date) : 0;
  const weeks = Math.max(1, slices ? slices.rows : Math.ceil((pad + gridDays.length) / 7));
  const windowAnchor = anchor ?? today;
  // Ступенька границ месяцев — прогонами, а не поклеточно (см. `monthEdges` и слой ниже).
  // Текущий месяц метку не получает: он назван плиткой «Сегодня», и линия там была бы шумом.
  const currentMonth = monthOf(today);
  const edges = useMemo(
    () => (field ? null : monthEdges(gridDays, pad, currentMonth)),
    [field, gridDays, pad, currentMonth],
  );
  // Первые числа, которым пустого куска не досталось: месяц начался с понедельника, с самого
  // края окна или его кусок уехал за потолок высоты. Имя тогда несёт сама клетка.
  const inlineMonths = useMemo(() => new Set(slices?.inline ?? []), [slices]);
  // Домашнее положение = окно вокруг сегодня. Оно же — единственное, из которого некуда
  // идти вперёд, поэтому вторая стрелка и возврат в нём просто не рисуются.
  const shifted = windowAnchor !== today;
  const canPage = Boolean(onShiftWeeks);
  // В «поле» шаг несёт кромка (§5.2), поэтому стрелки не рисуются: полоска и глиф сказали бы
  // одно и то же дважды. Возврат домой кромкой не выражается — она умеет шаг, а не прыжок, —
  // и «сегодня» остаётся единственным жильцом строки. Дома в ней не остаётся ничего, и
  // строка не рисуется вовсе: пустой ряд на волне без подписей читался бы дырой.
  const showStepGlyphs = !field;
  const showHome = shifted && Boolean(onResetWindow);
  // …а сама «сегодня» в этой редакции уезжает таблеткой на нижний край плитки: в ярлыке она
  // держала целую строку ради одного слова, и появлялась эта строка ровно тогда, когда
  // читатель смотрит историю, — то есть сдвигала сетку под ним. Снизу она ничего не двигает.
  const homeAtBottom = field;
  const hasNav =
    canPage && ((showHome && !homeAtBottom) || (showStepGlyphs && (canGoBack || shifted)));
  const heading = shifted ? monthNameRu(windowAnchor, today) : "календарь";

  // «Сегодня» возвращает не только окно, но и выбранный день. Кнопка названа днём, и читатель
  // ждёт от неё именно день; окно само по себе возвращает жест листания, которым его и увели.
  // Обработчик общий на обе редакции: таблетка «поля» и глиф базовой сетки — одна кнопка,
  // просто в разных местах плитки.
  const goHome = () => {
    onResetWindow?.();
    onSelect(today);
  };

  // Листание колесом/тачпадом по всей плитке (PRD §5.3): те же шаги, что у стрелок, и те же
  // границы — дома вперёд некуда, у генезиса некуда назад. Стрелки остаются: жест их не
  // заменяет, а дополняет (на таче колеса нет, а видимый орган управления нужен всегда).
  const shellRef = useRef<HTMLElement>(null);
  useWheelPaging(shellRef, onShiftWeeks, { back: canGoBack, forward: shifted });

  /**
   * Ход окна — коротким наплывом вместо подмены (§5.2): колесом листают подряд, и содержимое,
   * меняющееся мгновенно, читается обрывом. Здесь только НАПРАВЛЕНИЕ хода, само движение
   * рисует скин: длительность приезжает токеном, и волна вправе не анимировать ничего.
   *
   * Метка снимается через два кадра отрисовки: первый показывает стартовое смещение, со
   * второго идёт переход обратно. Одного мало — состояние и разметка успевают слиться в один
   * кадр, и перехода не случается вовсе.
   */
  const [roll, setRoll] = useState<"back" | "forward" | null>(null);
  const rolledFrom = useRef(windowAnchor);
  useEffect(() => {
    const from = rolledFrom.current;
    if (from === windowAnchor) return;
    rolledFrom.current = windowAnchor;
    setRoll(windowAnchor < from ? "back" : "forward");
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setRoll(null));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [windowAnchor]);

  /**
   * Кромка (§5.2) — соседняя неделя полоской в треть высоты, растворённая маской в плиту.
   * Орган управления тут — сами данные: видно не «можно листать», а какие дни там лежат
   * и насколько они были плотными.
   *
   * Клик по еле видному дню **забирает его в сетку**: день становится выбранным, а окно
   * переставляется опорой НА него. Поэтому кнопка здесь у каждого дня своя, а не одна на
   * полоску: действия у них разные, и общая кнопка обещала бы шаг вслепую.
   */
  function edgeRow(week: DaySummary[], back: boolean) {
    if (week.length === 0) return null;
    return (
      <div
        data-testid={back ? "calendar-edge-prev" : "calendar-edge-next"}
        className={`cal-edge ${back ? "cal-edge--before" : "cal-edge--after"}`}
      >
        {week.map((d) => (
          <button
            key={d.date}
            type="button"
            data-testid={`edge-day-${d.date}`}
            aria-label={`${dayOfMonth(d.date)} ${monthShortRu(d.date)}, показать в календаре`}
            data-weekend={weekdayMondayIndex(d.date) >= 5 || undefined}
            data-future={d.date > today || undefined}
            data-selected={d.date === selected || undefined}
            onClick={() => (onFocusDay ?? onSelect)(d.date)}
            className="cal-edge-cell cursor-pointer"
            style={
              {
                // Колонка своя у каждой клетки: после среза строк кромке может достаться
                // неполная неделя, а стоять под своей подписью дня она обязана всё равно.
                gridColumn: weekdayMondayIndex(d.date) + 1,
                "--day-weight": dayWeight(d).toFixed(3),
              } as CSSProperties
            }
          >
            {dayOfMonth(d.date)}
          </button>
        ))}
      </div>
    );
  }

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

          {hasNav && (
            <span className="cal-nav flex shrink-0 items-center gap-1">
              {showStepGlyphs && canGoBack && (
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
              {showStepGlyphs && shifted && (
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
                  onClick={goHome}
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
      <div className="tile-frame relative flex h-full flex-col gap-1" data-roll={(field && roll) || undefined}>
        {/* Шапка дней недели — выходные тоном выделены. Зазор общий с сеткой дней (6px):
            разойдись они, колонки шапки перестали бы стоять над своими числами. */}
        <div
          className={`grid gap-1.5${field ? " cal-grid--field-head" : ""}`}
          style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
        >
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              aria-hidden
              data-weekend={i >= 5 || undefined}
              className="t-cal-weekday text-center"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--text-tertiary)",
                // Плашка выходного — инлайном только в базе: в «поле» выходной несёт тон
                // (§5.2), и заливка шапки стала бы вторым голосом того же сигнала.
                background: !field && i >= 5 ? "var(--cal-weekend)" : undefined,
                borderRadius: "var(--radius-sm)",
              }}
            >
              {w}
            </div>
          ))}
        </div>

        {/* Прошлая неделя над сеткой — кромка (§5.2). */}
        {slices && edgeRow(slices.before, true)}

        {/* Сетка дней: ровно `weeks` строк, недели слева направо с понедельника. */}
        {/* Зазор 6px, а не 4: линия стыка месяцев живёт В ЖЁЛОБЕ и на узком зазоре садилась
            на край клетки. Расширение жёлоба ужимает саму клетку — ширина сетки фиксирована. */}
        <div
          role="grid"
          // Линза гасит поле насовсем (§5.2): её отметка — кольцо в акценте, и на светящейся
          // клетке того же тона она бы утонула. Свет и линза отвечают на разные вопросы,
          // поэтому сильнее тот, ради которого линзу включили.
          data-lens={field && lens ? true : undefined}
          className={`relative grid min-h-0 gap-1.5${field ? " cal-grid--field" : ""}`}
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
          {edges && (
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
          )}

          {/* Имена месяцев редакции «поле» — в том же слое-двойнике и по той же причине, что
              линии выше: подпись занимает несколько клеток разом, и грид-элементом сетки дней
              ей не стать, не заняв их места. Имя всегда называет месяц, который НАЧИНАЕТСЯ,
              и стоит в пустом куске перед ним (§5.2). */}
          {slices && slices.marks.length > 0 && (
            <div
              aria-hidden
              className="cal-month-gaps grid gap-1.5"
              style={{
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))`,
              }}
            >
              {slices.marks.map((m) => (
                <span
                  key={`month-gap-${m.date}`}
                  data-testid={`month-gap-${m.date}`}
                  className="cal-month-gap"
                  style={{ gridRow: m.row + 1, gridColumn: `${m.from + 1} / ${m.to + 1}` }}
                >
                  {monthNameRu(m.date, today)}
                </span>
              ))}
            </div>
          )}

          {gridDays.map((d, i) => {
            const isToday = d.date === today;
            const isSelected = d.date === selected;
            const isFuture = d.date > today;
            const isWeekend = weekdayMondayIndex(d.date) >= 5;
            // Дырка в записи: день прошёл, а данных за него нет. У будущего дня их и быть не
            // может, а сегодня ещё идёт — незаполненность там не пропуск.
            const isGap = d.date < today && !d.hasData;

            // Подпись месяца ходит парой со своей линией: без неё она повисла бы сиротой,
            // а в домашнем окне ещё и повторяла бы то, что уже написано в «Сегодня».
            // В «поле» линий нет, и в клетке остаётся только то, чему не нашлось пустого
            // куска: месяц, начавшийся с понедельника или с самого края окна.
            const startsMonth = field
              ? inlineMonths.has(d.date)
              : dayOfMonth(d.date) === 1 && monthOf(d.date) < currentMonth;
            // Явные координаты — только в «поле»: там слоты не идут подряд (§5.2).
            const place = slices ? slices.grid[i] : null;

            // Пропуск несёт РАМКА, а не заливка: заливка занята вопросом «когда» (выходной /
            // будущее), и раньше «прошёл, но пусто» и «ещё не наступил» красились одинаково —
            // пропуск читался как будущее.
            // В «поле» рамок и подложек нет вовсе — вид клетки целиком за скином редакции,
            // поэтому инлайн-стили ей не назначаются: инлайн перебил бы CSS без шанса.
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
                // Нативной подсказки в «поле» нет (§5.2): её рисует ОС мимо всей визуальной
                // системы борда — тот же довод, по которому `title` снят с даты (§4.1).
                // Скринридеру сводка остаётся: она в `aria-label`, а не в подсказке.
                title={field ? undefined : hoverSummary(d, today, lensLine)}
                onClick={() => onSelect(d.date)}
                className="t-cal-day relative flex min-h-0 cursor-pointer items-center justify-center"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: isToday ? 500 : 400,
                  borderRadius: "var(--radius-sm)",
                  ...(field
                    ? // Вес дня едет переменной, а не готовым цветом: из него скин считает и
                      // яркость свечения, и всё, что волна захочет к нему привязать.
                      { "--day-weight": dayWeight(d).toFixed(3) }
                    : { border, background: base }),
                  ...(place === null ? null : { gridRow: place.row + 1, gridColumn: place.col + 1 }),
                  // Цифра чужого месяца больше не приглушается: это был тот же сигнал, что и
                  // снятая заливка, и он инвертировался бы ровно так же — просто тише.
                  color:
                    isFuture || dimmedByLens ? "var(--text-tertiary)" : "var(--text-primary)",
                  opacity: isFuture ? 0.7 : 1,
                } as CSSProperties}
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

                {/* Маркер «есть имя» (§5) — мелкая пиксель-точка снизу. В «поле» её нет:
                    на поле света точка читается ответом на вопрос «доехал ли день», а на
                    него уже отвечает яркость клетки (§5.2). */}
                {d.title && !field && (
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

        {/* Следующая неделя. Дома её нет: там она была бы неделей будущего — пустой полоской
            из одних чисел, ровно той мёртвой формой, от которой в базовой редакции убрана
            вторая стрелка. */}
        {shifted && slices && edgeRow(slices.after, false)}

        {/* Возврат домой — таблетка на нижнем крае плитки (§5.2). Своей строки она не берёт
            и сетку не двигает: лежит поверх, наполовину съезжая в поля карточки. */}
        {homeAtBottom && showHome && (
          <button
            type="button"
            data-testid="calendar-home"
            aria-label="вернуть календарь к сегодня"
            onClick={goHome}
            className="cal-home-pill cursor-pointer"
          >
            сегодня
          </button>
        )}
      </div>
    </TileShell>
  );
}
