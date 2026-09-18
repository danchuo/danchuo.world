"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { DaySummary } from "@/lib/api/types";
import { weekdayMondayIndex, weekdayShortRu } from "@/lib/date";
import { formatSleepAxis, formatSleepShort, formatSteps, formatStepsAxis } from "@/lib/format";
import {
  average,
  axisBounds,
  clampOffset,
  maxOffset,
  visibleWindow,
  type SparkPoint,
} from "./statsSparkline";
import { StatsGhosts } from "./StatsGhosts";
import { SleepIcon, StepsIcon } from "./StatsIcons";
import { TileShell, type TileState } from "./TileShell";
import { useBoxSize } from "./useBoxSize";

interface StatsTileProps {
  /** History of days (old → new, "today" last), the source of the charts (DESIGN §7.4). */
  history: DaySummary[];
  /** The day selected in the calendar: the vertical marker stands on it, its value on the left. */
  selected: string;
  state: TileState;
  onRetry?: () => void;
  /**
   * The widget's edition (DESIGN §7.4, §10.1), chosen by the WAVE through the layout
   * (`tiles.stats.edition`); the component knows nothing of waves. `ghosts` draws every metric at
   * once with one lit (see [StatsGhosts]); an unknown name ⇒ the default two stacked bands.
   */
  edition?: string;
  /** Taking a day from the chart: the keyboard and a click on the plot address a DAY (§5.3). */
  onSelectDay?: (date: string) => void;
  style?: CSSProperties;
  className?: string;
}

/** How many days fit the full width; the rest hides behind scroll-into-the-past (DESIGN §7.4). */
const WINDOW = 10;
const PAD_X = 8;
const RIGHT_AXIS = 28; // right margin for the Y-axis labels
const AXIS_H = 14; // the date axis at the bottom
const BAND_PAD = 8; // the chart's inset within the band (top and bottom)
const DOT_R = 2.3;
const LABEL_EVERY = 3;
/** Wheel delta threshold for one day of scrolling (larger is slower; it damps trackpad jerks). */
const SCROLL_STEP_PX = 120;
/**
 * Minimum span of the Y axis (DESIGN §7.4): the axis autoscales to the visible window but never
 * compresses below this, so steady days give a calm wave rather than inflated noise.
 */
const STEPS_MIN_SPAN = 3000;
const SLEEP_MIN_SPAN = 90; // 1.5 h

/** `2026-07-16` → `16.07`. */
function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

interface Metric {
  key: "steps" | "sleep";
  caption: string;
  icon: ReactNode;
  stroke: string;
  labelColor: string;
  valueColor: string;
  minSpan: number;
  points: SparkPoint[];
  axisLabel: (v: number) => string;
  valueLabel: (v: number | null) => string;
}

/** Metric readout: icon and label (in colour), the selected day's value, and the window's average. */
function MetricReadout({ m, value, avg }: { m: Metric; value: number | null; avg: number | null }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5" style={{ color: m.labelColor }}>
        {m.icon}
        <span className="t-stats-label font-medium">{m.caption}</span>
      </div>
      <div
        className={`t-stats-value mt-0.5 truncate leading-tight ${value === null ? "text-center" : ""}`}
        style={{ color: m.valueColor, fontFamily: "var(--font-mono)" }}
      >
        {value === null ? "—" : m.valueLabel(value)}
      </div>
      <div className="t-stats-avg mt-1.5 truncate" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
        AVG {avg === null ? "—" : m.valueLabel(avg)}
      </div>
    </div>
  );
}

/**
 * The selected day's GitHub contributions chip, "activity of another kind" beside steps and sleep.
 * IT STAYS SILENT ON ZERO and on "not collected": it answers one question, and a daily "+0" across
 * many empty days would be noise. The colour is a token — green is meaningful but not ours. §7.4
 */
function ContributionChip({ count }: { count: number | null }) {
  if (count === null || count === 0) return null;
  return (
    <div
      data-testid="stats-contributions"
      className="t-stats-git flex min-w-0 items-center font-medium"
      style={{ color: "var(--accent-code)", fontFamily: "var(--font-mono)" }}
      title={`${count} вкладов на GitHub`}
    >
      {/* The channel's glyph is decorative: `title` already explains the number, and a duplicate
          would confuse a screen reader. */}
      <span className="git-chip-icon" aria-hidden />
      <span className="truncate">+{count}</span>
    </div>
  );
}

/**
 * The stats charts: steps above, sleep below, sharing one window and scroll. The left column shows
 * the selected day's value and the visible window's average; the right frames the Y axis, rescaled
 * per window. The wheel pages the window and yields at the edges; gaps stay breaks. DESIGN §7.4
 */
function StatsCharts({ history, selected }: { history: DaySummary[]; selected: string }) {
  const [boxRef, { w, h }] = useBoxSize();
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const wheelAccum = useRef(0);
  const [hover, setHover] = useState<{ row: number; i: number } | null>(null);

  const setOff = (v: number) => {
    offsetRef.current = v;
    setOffset(v);
  };

  useEffect(() => {
    setOff(clampOffset(offsetRef.current, history.length, WINDOW));
  }, [history.length]);

  // A click in the calendar: if the selected day falls outside the window, the window moves so it
  // becomes visible, keeping the same ten days around it. A day already visible does not jolt it.
  useEffect(() => {
    const idx = history.findIndex((d) => d.date === selected);
    if (idx < 0) return;
    const len = history.length;
    const rightIdx = len - 1 - offsetRef.current;
    const leftIdx = rightIdx - (WINDOW - 1);
    if (idx >= leftIdx && idx <= rightIdx) return;
    setOff(clampOffset(len - 1 - idx, len, WINDOW));
    setHover(null);
  }, [selected, history]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const max = maxOffset(history.length, WINDOW);
      if (max === 0) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      const dir = delta > 0 ? -1 : 1;
      const atEdge = (dir > 0 && offsetRef.current >= max) || (dir < 0 && offsetRef.current <= 0);
      if (atEdge) {
        wheelAccum.current = 0;
        return;
      }
      e.preventDefault();
      wheelAccum.current += delta;
      const stepsRaw = Math.trunc(wheelAccum.current / SCROLL_STEP_PX);
      if (stepsRaw === 0) return;
      wheelAccum.current -= stepsRaw * SCROLL_STEP_PX;
      const next = clampOffset(offsetRef.current - stepsRaw, history.length, WINDOW);
      if (next !== offsetRef.current) {
        setOff(next);
        setHover(null);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [boxRef, history.length]);

  const metrics: Metric[] = useMemo(
    () => [
      {
        key: "steps",
        caption: "шаги",
        icon: <StepsIcon />,
        stroke: "var(--accent)",
        labelColor: "var(--accent)",
        valueColor: "var(--accent)",
        minSpan: STEPS_MIN_SPAN,
        points: history.map((d) => ({ date: d.date, value: d.steps })),
        axisLabel: formatStepsAxis,
        valueLabel: formatSteps,
      },
      {
        key: "sleep",
        caption: "сон",
        icon: <SleepIcon />,
        stroke: "var(--text-secondary)",
        labelColor: "var(--text-secondary)",
        valueColor: "var(--text-primary)",
        minSpan: SLEEP_MIN_SPAN,
        points: history.map((d) => ({ date: d.date, value: d.sleepMinutes })),
        axisLabel: formatSleepAxis,
        valueLabel: formatSleepShort,
      },
    ],
    [history],
  );

  const win = useMemo(() => visibleWindow(metrics[0].points, WINDOW, offset), [metrics, offset]);
  const dates = win.map((p) => p.date);
  const selIdx = dates.indexOf(selected);
  const selHistoryIdx = history.findIndex((d) => d.date === selected);
  const n = win.length;
  const denom = Math.max(n - 1, 1);
  const plotRight = Math.max(w - RIGHT_AXIS, 0);
  const innerW = Math.max(plotRight - PAD_X, 0);
  const plotH = Math.max(h - AXIS_H, 0);
  const bandH = plotH / metrics.length;
  const x = (i: number) => PAD_X + (i / denom) * innerW;

  const selectedValue = (points: SparkPoint[]) => (selHistoryIdx >= 0 ? points[selHistoryIdx]?.value ?? null : null);
  // Contributions of the selected day — the chip follows the selection, as both readouts do.
  const selectedContributions = selHistoryIdx >= 0 ? history[selHistoryIdx]?.contributions ?? null : null;

  const bands = metrics.map((m, row) => {
    const wPts = visibleWindow(m.points, WINDOW, offset);
    const { min, max } = axisBounds(wPts, m.minSpan);
    const top = row * bandH + BAND_PAD;
    const innerH = Math.max(bandH - 2 * BAND_PAD, 0);
    const y = (v: number) => top + (1 - (v - min) / (max - min)) * innerH;

    const segments: string[] = [];
    let cur: string[] = [];
    wPts.forEach((p, i) => {
      if (p.value === null) {
        if (cur.length > 1) segments.push(cur.join(" "));
        cur = [];
      } else {
        cur.push(`${x(i)},${y(p.value)}`);
      }
    });
    if (cur.length > 1) segments.push(cur.join(" "));

    return { m, row, wPts, min, max, top, innerH, y, segments, avg: average(wPts) };
  });

  return (
    <div className="tile-frame flex h-full min-w-0 gap-2">
      {/* The left column: readouts centred on their bands (matching the middle line). */}
      <div className="t-stats-col shrink-0 flex flex-col">
        <div className="flex flex-1 flex-col">
          {metrics.map((m) => (
            <div key={m.key} className="flex flex-1 items-center">
              <MetricReadout m={m} value={selectedValue(m.points)} avg={bands[metrics.indexOf(m)].avg} />
            </div>
          ))}
        </div>
        {/* A belt under the date axis: it keeps the readouts centred on their bands and gives the
            contributions chip a place without moving either. Empty on a day with no git. */}
        <div className="flex items-center" style={{ height: AXIS_H }}>
          <ContributionChip count={selectedContributions} />
        </div>
      </div>

      {/* The charts. */}
      <div ref={boxRef} className="relative min-w-0 flex-1">
        {w > 0 && h > 0 && (
          <svg width={w} height={h} className="block" aria-hidden>
            {/* The vertical grid: one line per day, the full height of the charts. */}
            {dates.map((d, i) => (
              <line key={`g-${d}`} x1={x(i)} x2={x(i)} y1={0} y2={plotH} stroke="var(--text-tertiary)" strokeWidth={1} opacity={0.13} />
            ))}

            {/* The selected day's marker — a dashed vertical. */}
            {selIdx >= 0 && (
              <line x1={x(selIdx)} x2={x(selIdx)} y1={0} y2={plotH} stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 3" opacity={0.65} />
            )}

            {bands.map(({ m, row, wPts, min, max, top, innerH, y, segments }) => (
              <g key={m.key}>
                {/* The frame plus the Y axis's middle line, with labels on the right. */}
                {[
                  { v: max, yy: top },
                  { v: (min + max) / 2, yy: top + innerH / 2 },
                  { v: min, yy: top + innerH },
                ].map((t, ti) => (
                  <g key={ti}>
                    <line x1={PAD_X} x2={plotRight} y1={t.yy} y2={t.yy} stroke="var(--text-tertiary)" strokeWidth={1} opacity={ti === 1 ? 0.12 : 0.22} />
                    <text x={plotRight + 3} y={t.yy + 3} className="t-stats-axis" fill="var(--text-tertiary)" style={{ fontFamily: "var(--font-mono)" }}>
                      {m.axisLabel(t.v)}
                    </text>
                  </g>
                ))}

                {segments.map((pts, i) => (
                  <polyline key={`s-${m.key}-${i}`} points={pts} fill="none" stroke={m.stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                ))}
                {wPts.map((p, i) => {
                  if (p.value === null) return null;
                  const isSel = i === selIdx;
                  const isHover = hover?.row === row && hover.i === i;
                  const big = isHover || isSel;
                  return (
                    <g key={`p-${m.key}-${p.date}`}>
                      <circle cx={x(i)} cy={y(p.value)} r={big ? DOT_R + 1.5 : DOT_R} fill={m.stroke} stroke={big ? "var(--bg-page)" : "none"} strokeWidth={big ? 1.4 : 0} />
                      {isSel && <circle cx={x(i)} cy={y(p.value)} r={DOT_R + 3} fill="none" stroke={m.stroke} strokeWidth={1} />}
                      <circle
                        cx={x(i)}
                        cy={y(p.value)}
                        r={10}
                        fill="transparent"
                        style={{ cursor: "pointer" }}
                        onMouseEnter={() => setHover({ row, i })}
                        onMouseLeave={() => setHover((c) => (c?.row === row && c.i === i ? null : c))}
                      />
                    </g>
                  );
                })}
              </g>
            ))}

            {/* The date axis below, sparser so the dates do not collide; the leftmost anchors to
                the start. A weekend TAKES THE DATE'S SLOT rather than standing beside it, so
                nothing can overlap. Two rejected week-marking variants are in DESIGN §7.4. */}
            {dates.map((d, i) => {
              const weekend = weekdayMondayIndex(d) >= 5;
              if (!weekend && i % LABEL_EVERY !== 0 && i !== selIdx) return null;
              return (
                <text
                  key={`d-${d}`}
                  data-testid={weekend ? `stats-weekday-${d}` : `stats-tick-${d}`}
                  x={i === 0 ? 2 : x(i)}
                  y={plotH + AXIS_H - 3}
                  className="t-stats-tick"
                  textAnchor={i === 0 ? "start" : "middle"}
                  fill={d === selected ? "var(--accent)" : "var(--text-tertiary)"}
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {weekend ? weekdayShortRu(d) : shortDate(d)}
                </text>
              );
            })}
          </svg>
        )}

        {/* The hovered point's tooltip — the date plus the metric's value. */}
        {hover !== null && bands[hover.row]?.wPts[hover.i]?.value != null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded px-1.5 py-0.5 text-xs"
            style={{
              left: Math.min(Math.max(x(hover.i), 30), plotRight),
              top: bands[hover.row].y(bands[hover.row].wPts[hover.i]!.value as number) - 6,
              background: "var(--surface, var(--bg-page))",
              border: "1px solid var(--border-tile)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {shortDate(bands[hover.row].wPts[hover.i]!.date)} ·{" "}
            {bands[hover.row].m.valueLabel(bands[hover.row].wPts[hover.i]!.value as number)}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Stats — activity (steps) and sleep over a period (DESIGN §7.4). Night detail and phases live in
 * the separate sleep tile (§7.7). An empty history, with neither steps nor sleep, says "no data".
 */
export function StatsTile({
  history,
  selected,
  state,
  onRetry,
  edition,
  onSelectDay,
  style,
  className,
}: StatsTileProps) {
  const hasData = history.some((d) => d.steps !== null || d.sleepMinutes !== null);
  const effective: TileState = state === "loaded" && !hasData ? "empty" : state;

  if (edition === "ghosts") {
    return (
      <TileShell
        state={effective}
        onRetry={onRetry}
        ariaLabel="Статы — активность"
        style={style}
        className={`stats-card--ghosts ${className ?? ""}`}
      >
        {/* No label: this edition has no chrome at all, and the metric names itself in the band. */}
        <StatsGhosts history={history} selected={selected} onSelect={onSelectDay} />
      </TileShell>
    );
  }

  return (
    <TileShell
      state={effective}
      onRetry={onRetry}
      label="активность"
      ariaLabel="Статы — активность"
      style={style}
      className={className}
    >
      <StatsCharts history={history} selected={selected} />
    </TileShell>
  );
}
