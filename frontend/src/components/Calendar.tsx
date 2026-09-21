import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { DaySummary } from "@/lib/api/types";
import { FIELD_ROWS, splitFieldWindow } from "@/lib/calendarEdge";
import { monthEdges } from "@/lib/calendarWindow";
import { dayWeight } from "@/lib/dayWeight";
import { dayOfMonth, monthNameRu, monthOf, monthShortRu, startOfWeek, weekdayMondayIndex } from "@/lib/date";
import {
  lensMatch,
  lensNote,
  lensRun,
  lensTitle,
  STREAK_SHOWN_FROM,
  lensTone,
  type DisciplineLens,
  type LensMatch,
} from "@/lib/disciplineLens";
import { formatSleep, formatSteps } from "@/lib/format";
import { pluralDays, relativeDayRu } from "@/lib/relativeDay";
import { TileShell, type TileState } from "./TileShell";
import { useWheelPaging } from "./useWheelPaging";

interface CalendarProps {
  days: DaySummary[];
  selected: string;
  today: string;
  /**
   * The window's anchor (§5.3): the day whose weeks the board built [days] around. Paging moves it;
   * by default it is today. It decides which month the grid calls its own, and only that — today,
   * future and gap are still judged against [today].
   */
  anchor?: string;
  onSelect: (date: string) => void;
  /**
   * Take a day into the grid (§5.2): select it and move the window so it lands there. The edge
   * needs this — its days lie outside the grid by definition, and selection alone is not enough.
   * Without the handler a click on the edge merely selects, like a click on a cell.
   */
  onFocusDay?: (date: string) => void;
  state: TileState;
  onRetry?: () => void;
  /** Shift the window by N weeks (-1 back, +1 forward). With no handler there is no paging. */
  onShiftWeeks?: (weeks: number) => void;
  /** Return the window home. Shown only while the window is shifted. */
  onResetWindow?: () => void;
  /** Whether there is anything further back: at genesis the arrow is removed, not left dead. */
  canGoBack?: boolean;
  /** The discipline lens (§5.3): the quest-map stop the days are marked up by. */
  lens?: DisciplineLens | null;
  /** Clearing the lens from the label's cross. Without a handler the cross is not drawn. */
  onLensChange?: (lens: DisciplineLens | null) => void;
  /**
   * The tile's edition (DESIGN §10.1): `field` is a field of light instead of a table of cells
   * (§5.2). An unknown name, or none, means the base grid in frames.
   */
  edition?: string;
  /**
   * How many weeks wider than the grid the board took the window, for the EDGES (§5.2) — the
   * strips that page it. `0` (the default) means the window matches the grid, there are no edges
   * and arrows do the paging; the grid then gets the whole window, as there is nothing to trim.
   */
  edgeWeeks?: number;
  style?: CSSProperties;
  className?: string;
}

/** Weekday headings, Monday first (§5). Indices 5 and 6 are the weekend. */
const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

/**
 * A day's mini summary for the hover preview (§5): its relative name plus the key stats. The
 * monster is deliberately absent — flavours are posted but shown nowhere on the board.
 */
function hoverSummary(d: DaySummary, today: string, lensLine: string | null): string {
  const parts = [
    relativeDayRu(d.date, today),
    d.title,
    // The lens's answer comes first after the name: while it is on, that is what the cell is
    // being looked at for.
    lensLine,
    `шаги ${formatSteps(d.steps)}`,
    `сон ${formatSleep(d.sleepMinutes)}`,
  ];
  return parts.filter(Boolean).join(" · ");
}

/**
 * The calendar, and the board's main navigation: a week-aligned grid over a four-week window
 * around an anchor. Stepping moves only the WINDOW — the selected day stays put, because this is
 * viewing, not choosing. The lens filters by one quest stop without touching fill. DESIGN §5
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
  // The "field" edition (§5.2): a cell loses its frame and plate, and the question "how much"
  // moves into brightness. One branch for the whole render — a cell's look diverges only here.
  const field = edition === "field";

  // The edges (§5.2) are the window's outer weeks shown as strips, and the paging control too.
  // Month layout and the grid's height ceiling are computed here as well: all of it is arithmetic
  // over positions in the window, and getting it silently wrong drops the grid's height.
  const slices = useMemo(
    () =>
      field
        ? splitFieldWindow(days, { edges: edgeWeeks > 0, canGoBack, maxRows: FIELD_ROWS })
        : null,
    [days, field, edgeWeeks, canGoBack],
  );
  const gridDays = useMemo(() => (slices ? slices.grid.map((p) => p.day) : days), [slices, days]);

  // Week alignment: empty cells before the first day, back to Monday. The board sends whole weeks
  // (§5.3), so normally pad is 0; the calculation stays as insurance against an arbitrary range —
  // the grid must not skew because of someone else's selection.
  const pad = !field && gridDays.length > 0 ? weekdayMondayIndex(gridDays[0].date) : 0;
  const weeks = Math.max(1, slices ? slices.rows : Math.ceil((pad + gridDays.length) / 7));
  // The live run behind the lens (§5.2): in this edition the light answers "how many days running",
  // so it is computed over the whole WINDOW rather than the grid — the run may start in an edge week.
  const run = useMemo(
    () => (field && lens ? lensRun(days, lens, today) : null),
    [field, lens, days, today],
  );
  // A run of one day is not a run — the same floor the sheet's socket keeps for its numeral (§4.3).
  const runLabel =
    run && run.length >= STREAK_SHOWN_FROM
      ? `${run.length}${run.truncated ? "+" : ""} ${pluralDays(run.length)} подряд`
      : null;
  const windowAnchor = anchor ?? today;
  // Month boundary steps come as runs, not per cell (see `monthEdges` and the layer below). The
  // current month gets no mark: the Today tile already names it, and a line there would be noise.
  const currentMonth = monthOf(today);
  const edges = useMemo(
    () => (field ? null : monthEdges(gridDays, pad, currentMonth)),
    [field, gridDays, pad, currentMonth],
  );
  // First days that got no empty slot: the month began on a Monday, at the window's very edge, or
  // its piece ran past the height ceiling. The cell then carries the name itself.
  const inlineMonths = useMemo(() => new Set(slices?.inline ?? []), [slices]);
  // Everything that asks "has the window moved?" must ask it BY WEEK, because that is what an
  // anchor builds: an anchor on any day of this week gives the very same window. Comparing dates
  // turned "take this day into the grid" into a phantom step — a forward edge and a glide.
  const windowWeek = startOfWeek(windowAnchor);
  // Home is the window around today, and the only position with nowhere forward to go.
  const shifted = windowWeek !== startOfWeek(today);
  const canPage = Boolean(onShiftWeeks);
  // In "field" the edge carries the step (§5.2), so arrows are not drawn — strip and glyph would
  // say the same thing twice. Home is not expressible as an edge, leaving "today" alone in the
  // row; at home the row holds nothing and is not drawn at all, as an empty row reads as a hole.
  const showStepGlyphs = !field;
  const showHome = shifted && Boolean(onResetWindow);
  // ...and "today" itself moves to a pill at the tile's bottom edge in this edition: in the label
  // it held a whole row for one word, and that row appeared exactly when the reader was browsing
  // history — shifting the grid under them. At the bottom it moves nothing.
  const homeAtBottom = field;
  const hasNav =
    canPage && ((showHome && !homeAtBottom) || (showStepGlyphs && (canGoBack || shifted)));
  const heading = shifted ? monthNameRu(windowAnchor, today) : "календарь";

  // "Today" restores the selected day as well as the window: the button is named after a day and
  // that is what a reader expects from it. One handler serves both editions — the field's pill and
  // the base grid's glyph are the same button in different places.
  const goHome = () => {
    onResetWindow?.();
    onSelect(today);
  };

  // Wheel and trackpad page the whole tile (PRD §5.3): the same steps as the arrows and the same
  // bounds. The arrows stay — the gesture supplements them rather than replacing them, since touch
  // has no wheel and a visible control is always needed.
  const shellRef = useRef<HTMLElement>(null);
  useWheelPaging(shellRef, onShiftWeeks, { back: canGoBack, forward: shifted });

  /**
   * Window movement as a short glide rather than a swap (§5.2): the wheel scrolls through weeks,
   * and content changing instantly reads as a cut. Only the DIRECTION lives here; the skin draws
   * the motion. The flag clears after TWO frames — with one, no transition happens at all.
   */
  const [roll, setRoll] = useState<"back" | "forward" | null>(null);
  const rolledFrom = useRef(windowWeek);
  useEffect(() => {
    const from = rolledFrom.current;
    if (from === windowWeek) return;
    rolledFrom.current = windowWeek;
    setRoll(windowWeek < from ? "back" : "forward");
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setRoll(null));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [windowWeek]);

  /**
   * The edge (§5.2): the neighbouring week as a third-height strip. The control here is the DATA
   * itself — you see which days lie there, not merely that stepping is possible. Clicking a day
   * TAKES IT INTO the grid, so each day owns its button rather than the strip having one.
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
                // Each cell carries its own column: after rows are trimmed the edge may be left
                // with a partial week, and it must still stand under its own weekday heading.
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
      // The label names the lens and lets it go: on a weekend the quest map gives way to the rest
      // scene, and there is nowhere left to click a stop again. Week stepping shares this row on
      // purpose — its own row stole height from the grid and the cells shrank (§5.3).
      label={
        <span className="cal-label-row flex w-full items-center justify-between gap-2">
          <span
            className="min-w-0 truncate"
            data-testid={shifted ? "calendar-window-month" : undefined}
          >
            {lens ? (
              <span className="inline-flex items-center gap-1" data-testid="calendar-lens-label">
                {heading} — {lensTitle(lens)}
                {/* The run's length in words, where the light already draws it: the tile's socket
                    answers for the SELECTED day, and the field answers for today. */}
                {runLabel && (
                  <span className="cal-lens-run" data-testid="calendar-lens-run">
                    · {runLabel}
                  </span>
                )}
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
        {/* The weekday header, weekends picked out by tone. Its gap matches the day grid's (6px):
            diverge and the header columns would stop standing over their numbers. */}
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
                // The weekend plate is inline only in the base edition: in "field" the weekend is
                // carried by tone (§5.2), and a filled heading would be a second voice for it.
                background: !field && i >= 5 ? "var(--cal-weekend)" : undefined,
                borderRadius: "var(--radius-sm)",
              }}
            >
              {w}
            </div>
          ))}
        </div>

        {/* Last week above the grid — the margin (§5.2). */}
        {slices && edgeRow(slices.before, true)}

        {/* The day grid: exactly `weeks` rows, weeks left to right from Monday. */}
        {/* The gap is 6px, not 4: the month edge line lives IN THE GUTTER and on a narrow gap sat
            on the cell's border. Widening the gutter narrows the cell — the grid width is fixed. */}
        <div
          role="grid"
          // The lens puts the field out entirely (§5.2): its mark is an accent ring, which would
          // drown on a cell glowing in the same tone. Light and lens answer different questions, so
          // the one the lens was switched on for wins.
          data-lens={field && lens ? true : undefined}
          className={`relative grid min-h-0 gap-1.5${field ? " cal-grid--field" : ""}`}
          style={{
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))`,
            // Its own height, where the parent gives none (DESIGN §8): in the mobile stack the tile
            // has no height, and a grid of flex plus `1fr` rows would collapse into a strip of
            // digits. Computed from the window's week count, which the board decides, not this.
            aspectRatio: `7 / ${weeks}`,
            // The full trio of the §8 technique, as on `.quest-map`: apart it breaks. `width: 100%`
            // is LOAD-BEARING — without it the ratio may drive WIDTH instead of height, and Safari
            // does exactly that. `flex: 1 1 auto`, not a 0 basis, or a bare strip is left below.
            width: "100%",
            flex: "1 1 auto",
          }}
        >
          {Array.from({ length: pad }, (_, i) => (
            <div key={`pad-${i}`} aria-hidden />
          ))}

          {/* The month-border layer: a second grid of THE SAME geometry over the day grid. A line
              inside the cells breaks into per-cell pieces that overlap in the gutter and restart
              their dashes; in its own layer the segment is one per run. DESIGN §5.2 */}
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

          {/* The field edition's month names sit in the same twin layer, for the same reason as the
              lines above: a caption spans several cells at once and cannot be a grid item without
              taking their place. A name always names the month that BEGINS (§5.2). */}
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
            // A gap in the record: the day has passed and there is no data for it. A future day
            // cannot have any, and today is still running — emptiness there is not a gap.
            const isGap = d.date < today && !d.hasData;

            // A month caption travels with its line: alone it would hang orphaned, and in the home
            // window it would repeat what "Today" already says. In "field" there are no lines, so
            // only a month starting on Monday or at the window's very edge keeps its caption.
            const startsMonth = field
              ? inlineMonths.has(d.date)
              : dayOfMonth(d.date) === 1 && monthOf(d.date) < currentMonth;
            // Explicit coordinates only in "field": there the slots are not consecutive (§5.2).
            const place = slices ? slices.grid[i] : null;

            // A gap is carried by the BORDER, not the fill: fill answers "when" (weekend, future),
            // and "passed but empty" used to be painted like "not yet here". In "field" the cell's
            // look belongs wholly to the skin, so no inline styles — inline would beat the CSS.
            const border = isToday
              ? "2px solid var(--border-pixel)"
              : isSelected
                ? "2px solid var(--accent)"
                : isGap
                  ? "1px dashed var(--border)"
                  : "1px solid var(--border)";

            // Background priority: weekend, then future, then plain. MONTH IS DELIBERATELY ABSENT
            // — a month-based fill depends on where the window sits, so a single step can invert
            // nearly all 28 cells. A day must not change appearance because the window moved.
            const base = isWeekend
              ? "var(--cal-weekend)"
              : isFuture
                ? "var(--bg-surface-muted)"
                : "var(--bg-surface)";

            // The lens does NOT touch the fill: a marked day carries a frame around its digit.
            // Mixing the accent into the fill was tried and the tone came out muddy.
            const match: LensMatch | null = lens ? lensMatch(d, lens) : null;
            const lensLine = lens && match ? lensNote(match, lens) : null;
            // The mark's tone is the lens's call (§5.1): an ordinary item marks only "yes", while
            // the monster marks BOTH answers in different colours.
            const tone = lens && match ? lensTone(match, lens) : null;
            // A non-matching day is dimmed by its NUMBER, the only free channel: the border is
            // taken by today/selected/gap and the lower dot by the day's name. Only unmarked days
            // dim — dimming and outlining at once would say two different things about one day.
            const dimmedByLens = match === "no" && tone == null;
            // In the field the lens speaks with LIGHT (§5.2), and the ring on the digit is the
            // previous waves' way of saying the very same thing — one answer, one mark.
            const ringed = tone != null && !field;

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
                data-lens-run={run?.marks.get(d.date)}
                data-lens-tone={tone ?? undefined}
                aria-current={isToday ? "date" : undefined}
                aria-label={`${dayOfMonth(d.date)}, ${hoverSummary(d, today, lensLine)}`}
                // There is no native tooltip in "field" (§5.2): the OS draws it outside the board's
                // whole visual system — the same argument that removed `title` from the date
                // (§4.1). The screen reader keeps the summary: it lives in `aria-label`.
                title={field ? undefined : hoverSummary(d, today, lensLine)}
                onClick={() => onSelect(d.date)}
                className="t-cal-day relative flex min-h-0 cursor-pointer items-center justify-center"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: isToday ? 500 : 400,
                  borderRadius: "var(--radius-sm)",
                  ...(field
                    ? // The day's weight travels as a variable rather than a finished colour: the
                      // skin derives the glow from it, and whatever else a wave ties to it.
                      { "--day-weight": dayWeight(d).toFixed(3) }
                    : { border, background: base }),
                  ...(place === null ? null : { gridRow: place.row + 1, gridColumn: place.col + 1 }),
                  // A foreign month's digit is no longer dimmed: that was the same signal as the
                  // removed fill, and it would invert in exactly the same way, only more quietly.
                  color:
                    isFuture || dimmedByLens ? "var(--text-tertiary)" : "var(--text-primary)",
                  opacity: isFuture ? 0.7 : 1,
                } as CSSProperties}
              >
                {/* The lens mark is a rounded frame on the digit itself (DESIGN §5.1); the lens's
                    tone gives the frame its colour. */}
                <span
                  data-testid={ringed ? `lens-frame-${d.date}` : undefined}
                  className={`cal-lens-digit${ringed ? ` cal-lens-digit--marked cal-lens-digit--${tone}` : ""}`}
                >
                  {dayOfMonth(d.date)}
                </span>

                {/* The month's name only on its first day: the border answers "where the edge is",
                    the caption "which month began". On every day it would become a list of months. */}
                {startsMonth && (
                  <span
                    aria-hidden
                    data-testid={`month-mark-${d.date}`}
                    className="cal-month-mark"
                  >
                    {monthShortRu(d.date)}
                  </span>
                )}

                {/* The "has a name" marker (§5), a small pixel dot below. The field edition drops
                    it: on a field of light a dot reads as the answer to "did the day arrive",
                    which the cell's brightness already gives (§5.2). */}
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

        {/* Next week. At home there is none: it would be a week of the future, an empty strip of
            bare numbers — the same dead form the second arrow was removed for. */}
        {shifted && slices && edgeRow(slices.after, false)}

        {/* The way home is a pill on the tile's bottom edge (§5.2). It takes no row of its own and
            does not move the grid: it lies on top, half sunk into the card's padding. */}
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
