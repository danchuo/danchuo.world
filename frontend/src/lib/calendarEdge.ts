import type { DaySummary } from "@/lib/api/types";
import { monthRowsLayout, type MonthGap } from "./calendarMonthRows";
import { addDays, startOfWeek } from "./date";

/**
 * Нарезка окна календаря на **кромки и сетку** (DESIGN §5.2, редакция «поле»).
 *
 * Кромка — неделя, показанная полоской в треть высоты и растворённая маской в плиту: она
 * же орган листания. Чтобы полоска несла настоящий свет дней, а не одни числа, борд берёт
 * окно **на неделю шире с каждого края**, а компонент отделяет эти недели от сетки здесь.
 *
 * Здесь же держится **высота сетки**: перенос месяца (§5.2) добавляет строку, и без потолка
 * плитка на таких окнах становилась на ряд выше, а клетки мельчали от того, в каком месте
 * истории стоит окно.
 *
 * Чистая функция и свой модуль по той же причине, что и у [monthEdges]: это арифметика по
 * позициям в окне, и ошибиться в ней тихо — значит уронить высоту сетки, чего в разметке
 * не видно.
 */

const DAYS_IN_WEEK = 7;

/**
 * Сколько строк показывает сетка «поля»: две прошлые недели и текущая.
 *
 * Будущая неделя в сетку не попадает вовсе (§5.2): данных за неё не бывает, и строка под неё
 * гарантированно пустая — ровно та пустота, ради которой редакция и затевалась.
 */
export const FIELD_ROWS = 3;

/** День со своим местом в сетке: слоты после переноса месяца идут не подряд. */
export interface PlacedDay {
  day: DaySummary;
  row: number;
  col: number;
}

export interface FieldWindow {
  /** Неделя над сеткой — шаг назад. Пусто, если листать назад некуда. */
  before: DaySummary[];
  grid: PlacedDay[];
  /** Неделя после сетки — шаг вперёд. Рисовать её или нет, решает компонент. */
  after: DaySummary[];
  /** Имена месяцев в пустых кусках (§5.2), уже в координатах показанной сетки. */
  marks: MonthGap[];
  /** Первые числа, которые называет сама клетка. */
  inline: string[];
  rows: number;
}

export interface FieldWindowOptions {
  /**
   * Взял ли борд окно шире сетки. `false` — кромок нет вовсе, и тогда сетке достаётся всё
   * окно целиком: резать нечего, а срезанное было бы недостижимо.
   */
  edges: boolean;
  /** Есть ли что листать назад (ответ бэка, §5.3). У генезиса кромка была бы мёртвой. */
  canGoBack: boolean;
  /** Потолок высоты сетки в строках. */
  maxRows: number;
}

const EMPTY: FieldWindow = { before: [], grid: [], after: [], marks: [], inline: [], rows: 0 };

/**
 * Разложить окно на кромки и сетку.
 *
 * ⚠️ **Хвостовая неделя отрезается всегда, даже когда шага вперёд нет.** Дома вперёд идти
 * некуда, но если вернуть эту неделю в сетку, сетка дома была бы на ряд выше, чем
 * в отлистанном окне — высота плитки не может зависеть от того, листали её или нет.
 *
 * ⚠️ **Лишние строки срезаются сверху, и только когда есть куда шагнуть.** У генезиса
 * листать назад нечем, и срезанная строка не просто спряталась бы, а стала бы недостижимой.
 */
export function splitFieldWindow(
  days: readonly DaySummary[],
  { edges, canGoBack, maxRows }: FieldWindowOptions,
): FieldWindow {
  if (days.length === 0) return EMPTY;

  const tailAt = edges ? Math.max(0, days.length - DAYS_IN_WEEK) : days.length;
  const after = days.slice(tailAt);
  const head = days.slice(0, tailAt);
  if (head.length === 0) return { ...EMPTY, after: [...after] };

  const layout = monthRowsLayout(head);
  const drop = edges && canGoBack ? Math.max(0, layout.rows - maxRows) : 0;

  const grid: PlacedDay[] = [];
  head.forEach((day, i) => {
    const row = Math.floor(layout.slots[i] / DAYS_IN_WEEK) - drop;
    if (row >= 0) grid.push({ day, row, col: layout.slots[i] % DAYS_IN_WEEK });
  });
  if (grid.length === 0) return { ...EMPTY, after: [...after] };

  const shown = new Set(grid.map((p) => p.day.date));
  const marks = layout.marks
    .filter((m) => m.row >= drop)
    .map((m) => ({ ...m, row: m.row - drop }));
  // Месяц, чей пустой кусок уехал за верхний край, не может остаться безымянным: имя
  // возвращается в клетку первого числа — тем же способом, что у месяца с понедельника.
  const inline = [
    ...layout.inline,
    ...layout.marks.filter((m) => m.row < drop).map((m) => m.date),
  ].filter((date) => shown.has(date));

  return {
    before: edges && canGoBack ? weekBefore(head, grid[0].day.date) : [],
    grid,
    after: [...after],
    marks,
    inline,
    rows: layout.rows - drop,
  };
}

/**
 * Неделя перед сеткой — **календарная**, пн→вс, а не «семь дней назад».
 *
 * Колонки кромки стоят под теми же подписями дней недели, что колонки сетки, поэтому полоска
 * обязана быть неделей, а не произвольным отрезком. Отсчёт идёт от недели, которой принадлежит
 * первый день сетки: после среза строк он не обязан быть понедельником.
 */
function weekBefore(head: readonly DaySummary[], firstShown: string): DaySummary[] {
  const from = addDays(startOfWeek(firstShown), -DAYS_IN_WEEK);
  const to = addDays(from, DAYS_IN_WEEK - 1);
  const week = head.filter((d) => d.date >= from && d.date <= to);
  return week.length === DAYS_IN_WEEK ? week : [];
}
