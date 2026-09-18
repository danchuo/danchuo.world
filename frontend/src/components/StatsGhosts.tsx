"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { DaySummary } from "@/lib/api/types";
import { weekdayMondayIndex, weekdayShortRu } from "@/lib/date";
import { areaPath, traceIslands, traceSegments, type TracePoint } from "./ghostTrace";
import { STATS_METRICS, nextMetric } from "./statsMetrics";
import { average, axisBounds, clampOffset, maxOffset, visibleWindow } from "./statsSparkline";
import { useBoxSize } from "./useBoxSize";

/**
 * The stats tile, `ghosts` edition (DESIGN §7.4, §10.1): EVERY metric is on the tile at once, each
 * on its own scale, and the choice decides which one is lit. The others are not decoration — the
 * answer is usually in the pair, and one trace cannot say "steps fell the week sleep rose".
 */

/** Days across the width; the rest of the history lives behind the scrub. */
const WINDOW = 14;
/** Wheel travel for one day. Larger is slower, and it damps a trackpad's jerk. */
const SCROLL_STEP_PX = 110;
/** Room at the top for the date ticks, and at the bottom for the caption band. */
const TOP = 42;
/**
 * ASYMMETRIC on purpose: the plot bleeds off the LEFT, where the window runs into the past, and
 * stops short on the RIGHT, because the newest day is the one a reader reaches for and a target
 * on the very edge of the glass is awkward to hit. DESIGN §7.4.1
 */
const PAD_LEFT = 0;
const PAD_RIGHT = 16;
/** Corner dates keep their own inset: they are band type, and the tile's radius eats x=0. */
const TEXT_INSET = 14;
/** How far the drawing dissolves into the glass on the LEFT. The right side has its gap instead. */
const EDGE_FADE_PX = 18;
/** The selected day's date, right above the top horizon; its tick crosses it into the plot. */
const AXIS_TOP = TOP - 4;
/** The ruler sits ON the very top edge. */
const RULE_TOP = 4;
/** Where the lit trace bottoms out. The area keeps falling past it, under the band. */
const FLOOR_GAP = 74;

interface StatsGhostsProps {
  history: DaySummary[];
  selected: string;
  onSelect?: (date: string) => void;
}

/** `2026-09-14` → `14.09`. */
function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

export function StatsGhosts({ history, selected, onSelect }: StatsGhostsProps) {
  const [boxRef, { w, h }] = useBoxSize();
  // Gradient and filter ids MUST be unique per instance: the board keeps both layouts mounted at
  // once, so every tile exists twice and `url(#…)` would find the hidden copy's paint.
  const uid = useId().replace(/[^a-z0-9]/gi, "");
  // `null` = not chosen yet, so the opening metric can be decided by the DATA (see `mi` below).
  const [picked, setPicked] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  // Parity alternates the class that restarts the redraw animation: a metric change is a REDRAW,
  // and a CSS animation only replays when the name it is applied under changes. DESIGN §7.4
  const [tick, setTick] = useState(0);
  const offsetRef = useRef(0);
  const wheelAccum = useRef(0);

  const setOff = useCallback((v: number) => {
    offsetRef.current = v;
    setOffset(v);
  }, []);

  useEffect(() => {
    setOff(clampOffset(offsetRef.current, history.length, WINDOW));
  }, [history.length, setOff]);

  // The opening metric is decided by the data IN THE OPENING WINDOW: a channel can be silent for
  // weeks, and a widget opened on an empty one looks broken. ONCE — neither a scrub into a quiet
  // stretch nor the reader's own choice may be overridden afterwards. DESIGN §7.4.1
  const chosen = useRef(false);
  useEffect(() => {
    if (chosen.current || history.length === 0) return;
    chosen.current = true;
    const opening = history.slice(-WINDOW);
    const at = STATS_METRICS.findIndex((m) => opening.some((d) => m.value(d) !== null));
    if (at > 0) setPicked(at);
  }, [history]);

  // A day chosen in the calendar pulls the window to it when it falls outside; a day already on
  // screen does not jolt it.
  useEffect(() => {
    const idx = history.findIndex((d) => d.date === selected);
    if (idx < 0) return;
    const right = history.length - 1 - offsetRef.current;
    if (idx <= right && idx >= right - (WINDOW - 1)) return;
    setOff(clampOffset(history.length - 1 - idx, history.length, WINDOW));
    setHover(null);
  }, [selected, history, setOff]);

  // The wheel scrubs the timeline and YIELDS at both ends: on a laptop the board is barely taller
  // than the screen, and a tile that swallowed the gesture would trap the page under the cursor.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const max = maxOffset(history.length, WINDOW);
      if (max === 0) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      const dir = delta > 0 ? -1 : 1;
      if ((dir > 0 && offsetRef.current >= max) || (dir < 0 && offsetRef.current <= 0)) {
        wheelAccum.current = 0;
        return;
      }
      e.preventDefault();
      wheelAccum.current += delta;
      const steps = Math.trunc(wheelAccum.current / SCROLL_STEP_PX);
      if (steps === 0) return;
      wheelAccum.current -= steps * SCROLL_STEP_PX;
      const next = clampOffset(offsetRef.current - steps, history.length, WINDOW);
      if (next === offsetRef.current) return;
      setOff(next);
      setHover(null);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [boxRef, history.length, setOff]);

  const mi = picked ?? 0;
  const metric = STATS_METRICS[mi];
  const plotH = Math.max(h - FLOOR_GAP, 1);
  const innerW = Math.max(w - PAD_RIGHT, 1);

  // Every metric is laid out, not only the chosen one. Each keeps its OWN axis: steps and minutes
  // share no unit, and one scale would flatten whichever number is smaller into a straight line.
  const rows = useMemo(() => {
    const win = visibleWindow(
      history.map((d) => ({ date: d.date, value: 0 })),
      WINDOW,
      offset,
    );
    const n = win.length;
    const denom = Math.max(n - 1, 1);
    const x = (i: number) => PAD_LEFT + (i / denom) * innerW;
    return STATS_METRICS.map((m) => {
      const pts = visibleWindow(
        history.map((d) => ({ date: d.date, value: m.value(d) })),
        WINDOW,
        offset,
      );
      const b = axisBounds(pts, m.minSpan);
      const span = b.max - b.min || 1;
      const y = (v: number) => TOP + (1 - (v - b.min) / span) * (plotH - TOP);
      const trace: TracePoint[] = pts.map((p, i) => ({
        x: Math.round(x(i) * 10) / 10,
        y: p.value === null ? null : Math.round(y(p.value) * 10) / 10,
      }));
      return { m, pts, bounds: b, y, trace, avg: average(pts) };
    });
  }, [history, offset, innerW, plotH]);

  const win = rows[0].pts;
  const n = win.length;
  const denom = Math.max(n - 1, 1);
  const x = (i: number) => PAD_LEFT + (i / denom) * innerW;
  const active = rows[mi];
  const selIdx = win.findIndex((p) => p.date === selected);
  const selValue = selIdx >= 0 ? active.pts[selIdx].value : null;
  const hoverIdx = hover !== null && hover >= 0 && hover < n ? hover : null;

  const pick = (i: number) => {
    if (i === mi) return;
    setPicked(i);
    setTick((t) => t + 1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      pick(nextMetric(mi, e.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const idx = history.findIndex((d) => d.date === selected);
    if (idx < 0 || !onSelect) return;
    const next = Math.max(0, Math.min(history.length - 1, idx + (e.key === "ArrowRight" ? 1 : -1)));
    e.preventDefault();
    onSelect(history[next].date);
  };

  /**
   * The day under the pointer, or `null` on the OLDEST day of the window: it is the one that
   * bleeds off the left edge, where a hit would be a guess. The newest day has the right-hand gap
   * and is picked like any other. The calendar can still reach the oldest one.
   */
  const trackIndex = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const i = Math.round(((clientX - r.left - PAD_LEFT) / innerW) * denom);
    if (i < 1) return null;
    // The right-hand gap belongs to the LAST day: leaving it dead would make the newest day the
    // narrowest target on the tile, which is the opposite of why the gap is there.
    return Math.min(i, n - 1);
  };

  // A history SHORTER than the window fills the run entirely: there is nowhere to scrub to, and
  // the honest arithmetic would put the mark off the left edge (it did — at -250%).
  const run = useMemo(() => {
    const total = Math.max(history.length, 1);
    const span = Math.min(WINDOW, total);
    const left = Math.max(0, Math.min(1, (total - offset - span) / total));
    return { left: `${left * 100}%`, width: `${(span / total) * 100}%` };
  }, [history.length, offset]);

  // A RULER instead of a row of dates. A line of labels along the top is wave 01's device, and
  // repeating it here made the tile's top read as someone else's axis; the rhythm of the week is
  // what the eye actually needs, and one tick per day carries it with no type at all. §7.4.1
  const ruler = useMemo(
    () => win.map((p, i) => ({ date: p.date, x: x(i), weekend: weekdayMondayIndex(p.date) >= 5 })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [win, innerW, n],
  );

  // The window's ends are set as the wave's OWN device: large, very dim numerals in the corners,
  // type used as ground exactly like the canvas ribbon under the board. `dd.mm` in small mono with
  // a tick is what waves 01 and 02 do, and repeated here it read as their axis. §7.4.1
  const bounds = useMemo(() => {
    if (n === 0) return [];
    // Always in the metric's colour: the ends are not days one can pick (see `trackIndex`), so
    // there is no selected state for them to carry. They caption the window, and they sit ABOVE
    // the top horizon rather than behind the data.
    return [
      { key: "from", text: shortDate(win[0].date), at: TEXT_INSET, anchor: "start" as const },
      { key: "to", text: shortDate(win[n - 1].date), at: w - TEXT_INSET, anchor: "end" as const },
    ];
  }, [win, n, w]);

  // The selected day's own date, over its column — unless an end numeral already carries it.
  const selDate = selIdx > 1 && selIdx < n - 2 ? { text: shortDate(win[selIdx].date), at: x(selIdx) } : null;

  const fx = tick % 2 ? "is-fx-b" : "is-fx-a";
  const paint = (part: string) => `stats-ghosts-${uid}-${part}`;

  return (
    <div
      ref={boxRef}
      className="stats-ghosts"
      data-testid="stats-ghosts"
      tabIndex={0}
      role="group"
      aria-label={`График: ${metric.label}, ${n} дней. Стрелки влево и вправо — день, вверх и вниз — метрика.`}
      onKeyDown={onKeyDown}
      onMouseMove={(e) => {
        const i = trackIndex(e.clientX, e.currentTarget);
        if (i !== hover) setHover(i);
      }}
      onMouseLeave={() => setHover(null)}
      onClick={(e) => {
        const i = trackIndex(e.clientX, e.currentTarget);
        if (i === null || !onSelect) return;
        onSelect(win[i].date);
      }}
    >
      {w > 0 && h > 0 && (
        <svg className="stats-ghosts__plot" width={w} height={h} aria-hidden>
          <defs>
            <linearGradient id={paint("fill")} gradientUnits="userSpaceOnUse" x1={0} y1={TOP} x2={0} y2={h}>
              <stop offset="0" stopColor={metric.color} stopOpacity="0.3" />
              <stop offset="0.76" stopColor={metric.color} stopOpacity="0.05" />
              <stop offset="1" stopColor={metric.color} stopOpacity="0" />
            </linearGradient>
            {/* The window is 14 days of 30, and the drawing says so by DISSOLVING into the left
                edge, where it runs into the past; a straight cut on the tile's radius would say
                the data ends there. `userSpaceOnUse` — a bounding box would move with the data. */}
            <linearGradient id={paint("edge")} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={w} y2={0}>
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset={Math.min(EDGE_FADE_PX / Math.max(w, 1), 0.49)} stopColor="#fff" stopOpacity="1" />
              <stop offset="1" stopColor="#fff" stopOpacity="1" />
            </linearGradient>
            <mask id={paint("edgemask")} maskUnits="userSpaceOnUse" x={0} y={0} width={w} height={h}>
              <rect x={0} y={0} width={w} height={h} fill={`url(#${paint("edge")})`} />
            </mask>
          </defs>

          {/* Horizons, engraved: without them a window whose values barely move has nothing to
              be read against, and the chart lies about its own scale. */}
          {[TOP, (TOP + plotH) / 2, plotH].map((y) => (
            <line key={y} className="stats-ghosts__floor" x1={0} x2={w} y1={y} y2={y} />
          ))}

          {/* The window's ends, halfway between the tile's top edge and the top horizon:
              `dominant-baseline` centres them on that line whatever the type size. */}
          {bounds.map((b) => (
            <text
              key={b.key}
              className="stats-ghosts__bound"
              style={{ color: metric.color }}
              x={b.at}
              y={TOP / 2}
              dominantBaseline="middle"
              textAnchor={b.anchor}
            >
              {b.text}
            </text>
          ))}

          {/* Masked as one layer: the traces and the engraving dissolve at the sides, while the
              selected marker and the crosshair below stay at full strength — they answer for a
              day, and a day is not a matter of degree. */}
          <g mask={`url(#${paint("edgemask")})`}>
          {/* The ghosts first, so the lit trace is never crossed by one of them. */}
          {rows.map((r, i) =>
            i === mi ? null : (
              <g key={r.m.key} className="stats-ghosts__ghost" style={{ color: r.m.color }}>
                {traceSegments(r.trace).map((pts, k) => (
                  <polyline key={k} points={pts} vectorEffect="non-scaling-stroke" />
                ))}
                {traceIslands(r.trace).map((p) => (
                  <circle key={p.x} cx={p.x} cy={p.y} r={1.4} />
                ))}
              </g>
            ),
          )}

          <g key={metric.key} className={`stats-ghosts__lit ${fx}`} style={{ color: metric.color }}>
            <path d={areaPath(active.trace, h)} fill={`url(#${paint("fill")})`} />
            {traceSegments(active.trace).map((pts, k) => (
              <polyline key={k} points={pts} vectorEffect="non-scaling-stroke" />
            ))}
            {traceIslands(active.trace).map((p) => (
              <circle key={p.x} cx={p.x} cy={p.y} r={2.4} className="stats-ghosts__island" />
            ))}
          </g>
          </g>

          {/* The selected day: the board shares one day, and a chart of many must say which one
              its figure answers for. */}
          {selIdx >= 0 && (
            <g className="stats-ghosts__sel" style={{ color: metric.color }}>
              <line x1={x(selIdx)} x2={x(selIdx)} y1={AXIS_TOP + 8} y2={h} />
              {selValue !== null && (
                <>
                  <circle cx={x(selIdx)} cy={active.y(selValue)} r={3.2} className="stats-ghosts__dot" />
                  <circle cx={x(selIdx)} cy={active.y(selValue)} r={6.2} className="stats-ghosts__ring" />
                </>
              )}
            </g>
          )}

          {/* The ruler: one tick per day along the top edge, a weekend's longer and brighter. It
              gives the week's rhythm without a single label — and the rhythm is what the eye was
              reading the dates for. */}
          <g mask={`url(#${paint("edgemask")})`}>
          {ruler.map((t) => (
            <line
              key={t.date}
              className="stats-ghosts__rule"
              data-weekend={t.weekend ? "true" : undefined}
              x1={t.x}
              x2={t.x}
              y1={RULE_TOP}
              y2={t.weekend ? RULE_TOP + 7 : RULE_TOP + 3.5}
            />
          ))}
          </g>

          {/* The selected day's date over its column — the one date written in small lit type. */}
          {selDate && (
            <g className="stats-ghosts__date" style={{ color: metric.color }}>
              <text x={selDate.at} y={AXIS_TOP} textAnchor="middle">
                {selDate.text}
              </text>
              <line x1={selDate.at} x2={selDate.at} y1={AXIS_TOP + 3} y2={TOP + 5} />
            </g>
          )}

          {/* One hover answers for ALL metrics at once — the whole point of keeping the others on
              the tile. The chosen one leads the column and is set a step larger. */}
          {hoverIdx !== null && (
            <g
              className="stats-ghosts__tip"
              transform={`translate(${x(hoverIdx)} 0)`}
              data-side={hoverIdx > n - 4 ? "left" : "right"}
            >
              <line x1={0} x2={0} y1={AXIS_TOP + 4} y2={h} />
              <text className="stats-ghosts__tip-date" y={AXIS_TOP + 22}>
                {`${win[hoverIdx].date.slice(8, 10)}.${win[hoverIdx].date.slice(5, 7)}`}
              </text>
              {rows
                .map((r, i) => ({ r, i }))
                .sort((a, b) => (a.i === mi ? -1 : 0) - (b.i === mi ? -1 : 0))
                .map(({ r, i }, k) => {
                  const v = r.pts[hoverIdx].value;
                  return (
                    <text
                      key={r.m.key}
                      className="stats-ghosts__tip-value"
                      data-on={i === mi ? "true" : undefined}
                      style={{ color: r.m.color }}
                      y={AXIS_TOP + 40 + k * 15}
                    >
                      {v === null ? "—" : r.m.format(v)}
                    </text>
                  );
                })}
            </g>
          )}
        </svg>
      )}

      <span className="stats-ghosts__blur stats-ghosts__blur--soft" aria-hidden />
      <span className="stats-ghosts__blur stats-ghosts__blur--deep" aria-hidden />

      <div className="stats-ghosts__band">
        {/* Two steps of type: the figure is the answer, and the line under it says whose answer
            it is and how the window sits around it. The average is written out and printed in the
            VALUE format — the axis format rounds to two characters and looked frozen. */}
        <div key={`${metric.key}:${selected}`} className="stats-ghosts__head" style={{ color: metric.color }}>
          <span className="stats-ghosts__figure">{selValue === null ? "—" : metric.format(selValue)}</span>
          <span className="stats-ghosts__meta">
            <span className="stats-ghosts__day">{shortDate(selected)}</span>
            {active.avg !== null && (
              <>
                <span className="stats-ghosts__sep" aria-hidden>
                  ·
                </span>
                {`среднее ${metric.format(active.avg)}`}
              </>
            )}
          </span>
        </div>

        {/* NAMES, not beads. A coloured dot says which trace is lit but never what it measures,
            and three short nouns fit the band exactly — an icon for steps would be a guess where
            the word is not. The lit one carries its trace's colour and its underline. */}
        <div className="stats-ghosts__rail" role="group" aria-label="метрика">
          {STATS_METRICS.map((m, i) => (
            <button
              key={m.key}
              type="button"
              className="stats-ghosts__seg"
              data-on={i === mi ? "true" : undefined}
              style={{ color: m.color }}
              aria-label={`метрика: ${m.label}`}
              aria-pressed={i === mi}
              onClick={(e) => {
                e.stopPropagation(); // the tile itself picks a DAY; the rail picks a metric
                pick(i);
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Where the window sits in the whole history, as a one-pixel engraving on the very edge: a
          scrollbar answers the same question and spends a whole strip doing it. */}
      <span className="stats-ghosts__run" aria-hidden>
        <span className="stats-ghosts__run-at" style={{ color: metric.color, ...run }} />
      </span>
    </div>
  );
}
