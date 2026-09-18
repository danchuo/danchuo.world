"use client";

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, type CSSProperties } from "react";
import { getSleepNight } from "@/lib/api/client";
import type { SleepStagesView } from "@/lib/api/types";
import { formatSleep, formatSleepShort, sleepDurationParts } from "@/lib/format";
import { LANES, STAGE_COLOR, clockLabel, type SleepStageKey } from "./nightGeometry";
import { ECHO_VIEW, echoGeometry, echoNight, echoNightFromStages, type EchoNight } from "./soundingGeometry";
import { SleepMoon, SleepNoData } from "./SleepNoData";
import { sleepPhases } from "./sleepPhases";
import { useTileData } from "./useTileData";

/** The redraw dip, in step with `--sleep-echo-redraw-ms` in CSS: one number, two owners. */
const ECHO_REDRAW_MS = 320;

/**
 * The "echo sounder" edition: a night as a depth survey filling the tile. It follows the drop
 * tile's build — no margins, no label, all text lying ON the night in a blurred band. Switching
 * modes re-sorts the same bars rather than swapping the picture. DESIGN §7.7, §10.1
 */
export function SleepEcho({
  date,
  stages,
  byHours,
  onToggle,
}: {
  date: string;
  stages: SleepStagesView | null | undefined;
  /** The chosen view, held by [SleepTile] across calendar day changes. */
  byHours: boolean;
  onToggle: () => void;
}) {
  const fetcher = useCallback((signal: AbortSignal) => getSleepNight(date, { signal }), [date]);
  const { phase, data, settled, retry } = useTileData(fetcher, `sleep-night:${date}`);

  // The night by minutes comes from chunks; with none (the watch gave only totals) the same phases
  // arrive without a chronology, and the tile honestly stays in one mode instead of inventing an order.
  const fromBand = useMemo(() => echoNight(data?.band), [data?.band]);
  const night = useMemo(() => fromBand ?? echoNightFromStages(stages), [fromBand, stages]);
  // Which day the DRAWING belongs to, not which one is selected: while a night travels the previous
  // one stays on screen, and the moon and the entrance animations belong to what is shown.
  const shown = fromBand ? (data?.date ?? date) : date;

  // The first night appears only once it is whole. On calendar moves the last complete response
  // remains in `data` while useTileData fetches the replacement, so the graph never blanks and its
  // caption animation is not restarted merely because the date changed. DESIGN §7.7
  if (!settled && !data) {
    return null;
  }
  if (phase === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-xs">
        <span style={{ color: "var(--text-secondary)" }}>не удалось загрузить ночь</span>
        <button type="button" onClick={retry} className="cursor-pointer underline" style={{ color: "var(--accent)" }}>
          повторить
        </button>
      </div>
    );
  }
  if (!night) {
    return <SleepNoData date={date} textured />;
  }
  return (
    <Sounding
      night={night}
      date={shown}
      byHours={byHours}
      onToggle={onToggle}
      times={
        data?.band
          ? {
              from: clockLabel(data.band.onsetMinute, data.axisStartHour),
              to: clockLabel(data.band.wakeMinute, data.axisStartHour),
            }
          : null
      }
    />
  );
}

/**
 * The mode switch: thumbnails OF the modes, not a pair of words. "Sum" and "by hours" named
 * something the viewer had not seen yet, while a thumbnail shows the result in advance. The
 * segments are NOT buttons — the whole tile is one — so the pair is hidden from screen readers.
 */
function ModeSwitch({ timed }: { timed: boolean }) {
  return (
    <span className="sleep-echo__modes" data-testid="sleep-echo-modes" aria-hidden>
      <span className="sleep-echo__mode" data-on={!timed}>
        {/* The sum: four bars from the left edge, length is the phase's mass. */}
        <svg viewBox="0 0 16 12" className="sleep-echo__glyph">
          <rect x="0" y="1" width="3" height="1.6" rx="0.4" />
          <rect x="0" y="4" width="7" height="1.6" rx="0.4" />
          <rect x="0" y="7" width="13" height="1.6" rx="0.4" />
          <rect x="0" y="10" width="5" height="1.6" rx="0.4" />
        </svg>
      </span>
      <span className="sleep-echo__mode" data-on={timed}>
        {/* By the clock: the same night floor as a step — a descent and a climb between horizons. */}
        <svg viewBox="0 0 16 12" className="sleep-echo__glyph">
          <polyline points="0,2 3,2 3,8 6,8 6,5 10,5 10,11 13,11 13,4 16,4" />
        </svg>
      </span>
    </span>
  );
}

function Sounding({
  night,
  date,
  times,
  byHours,
  onToggle,
}: {
  night: EchoNight;
  date: string;
  times: { from: string; to: string } | null;
  byHours: boolean;
  onToggle: () => void;
}) {
  // Gradients MUST be unique per instance: the board keeps both layouts in the DOM at once, so the
  // sleep tile is always there twice. With a shared id, `url(#…)` finds the first match — in the
  // hidden layout, where there is no paint — and the visible copy's bars had nothing to draw with.
  const uid = useId().replace(/[^a-z0-9]/gi, "");
  const paint = useCallback((stage: string) => `sleep-echo-${uid}-${stage}`, [uid]);
  // A new night is a REDRAW, not an entrance: the bars morph by their heights (CSS), and this dip
  // carries what cannot interpolate — a column's gradient and the floor profile. DESIGN §7.7
  const plotRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = plotRef.current;
    if (!el || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const play = el.animate(
      [{ opacity: 0.22 }, { opacity: 1 }],
      { duration: ECHO_REDRAW_MS, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" },
    );
    return () => play.cancel();
  }, [date]);
  const geometry = useMemo(() => echoGeometry(night), [night]);
  const durations = useMemo(() => LANES.flatMap((lane, index) => {
    if (night.totals[lane.stage] <= 0) return [];
    const columns = geometry.columns.filter((c) => c.stage === lane.stage);
    const barHeight = geometry.columns[0].height * geometry.columns[0].squash;
    return [{
      stage: lane.stage,
      minutes: night.totals[lane.stage],
      // The position comes from the end of the DRAWN row while the number comes from the night's
      // minutes: the bar quota rounds the proportions, and counting time by it would round that too.
      end: Math.max(0, ...columns.map((c) => c.x + c.shift + c.width)) / ECHO_VIEW.width,
      center: (geometry.floors[index] - barHeight / 2) / ECHO_VIEW.height,
    }];
  }), [geometry, night]);
  // The percentage legend is ONLY for the chronology: in the sum view exact minutes already stand
  // by their rows. Its order is BY DEPTH, matching how the horizons lie, or the reader would have
  // to match legend to picture by colour. Wakings are absent — they are not part of sleep.
  const { legend, names } = useMemo(() => {
    const byKey = sleepPhases({
      rem: night.totals.rem,
      deep: night.totals.deep,
      light: night.totals.light,
      awake: night.totals.awake,
    });
    const names: Partial<Record<SleepStageKey, string>> = { awake: "не спал" };
    byKey?.forEach((p) => {
      names[p.key] = p.label;
    });
    if (!byKey) return { legend: null, names };
    const legend = LANES.flatMap<{ key: SleepStageKey; color: string; text: string }>((lane) => {
      if (lane.stage === "awake") {
        return [{ key: lane.stage, color: STAGE_COLOR[lane.stage], text: `не спал ${formatSleepShort(night.totals.awake)}` }];
      }
      const p = byKey.find((x) => x.key === lane.stage);
      return p ? [{ key: p.key, color: STAGE_COLOR[p.key], text: `${p.label} ${p.pct}%` }] : [];
    });
    return { legend, names };
  }, [night]);
  // No chronology ⇒ nothing to show it with: the tile stays a summary and does not fake a gesture.
  // The choice survives a night without one, so stepping past it does not undo it either.
  const time = night.timed && byHours;
  // The tile is a button only when the gesture changes something: a control that does nothing must
  // not look like a control, nor catch focus.
  const Root = night.timed ? "button" : "span";

  return (
    <Root
      type={night.timed ? "button" : undefined}
      className={`sleep-echo${time ? " is-timed" : ""}`}
      style={{ "--sleep-summary-extent": Math.max(...durations.map((d) => d.end), 0.01) } as CSSProperties}
      aria-pressed={night.timed ? time : undefined}
      aria-label={night.timed ? "Ночь по часам" : undefined}
      onClick={night.timed ? onToggle : undefined}
    >
      <span className="sleep-echo__plot" ref={plotRef}>
        <svg
          className="sleep-echo__sounding"
          viewBox={`0 0 ${ECHO_VIEW.width} ${ECHO_VIEW.height}`}
          // Every shape in the sounding is an axis-aligned rectangle, so uneven stretching does not
          // spoil them and the tile needs neither a measurement nor a ResizeObserver.
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            {/* A column gains density with depth: light water at the surface, thick at the floor.
                `userSpaceOnUse` is deliberate — the gradient spans the whole sounding, so a
                shallow column shows only its pale top and a deep one the whole descent. */}
            {Object.entries(STAGE_COLOR).map(([stage, color]) => (
              <linearGradient
                key={stage}
                id={paint(stage)}
                gradientUnits="userSpaceOnUse"
                x1={0}
                y1={0}
                x2={0}
                y2={ECHO_VIEW.height}
              >
                <stop offset="0" stopColor={color} stopOpacity="0.1" />
                <stop offset="1" stopColor={color} stopOpacity="0.9" />
              </linearGradient>
            ))}
          </defs>

          {/* Depth horizons, the finest engraving: without them an empty level is lost entirely. */}
          {geometry.floors.map((y) => (
            <line key={y} className="sleep-echo__floor" x1={0} x2={ECHO_VIEW.width} y1={y} y2={y} />
          ))}

          <g className="sleep-echo__columns">
            {geometry.columns.map((c, i) => (
              <rect
                key={i}
                className="sleep-echo__col"
                data-testid="sleep-echo-col"
                data-stage={c.stage}
                x={c.x}
                y={c.y}
                width={c.width}
                height={c.height}
                fill={`url(#${paint(c.stage)})`}
                // The summary is one transform per bar: a shift by its rank and a squeeze to its
                // horizon's floor. The geometry is untouched, so CSS plays the transition, not rAF.
                style={time ? undefined : { transform: `translateX(${c.shift.toFixed(2)}px) scaleY(${c.squash.toFixed(4)})` }}
              />
            ))}
          </g>

          <polyline className="sleep-echo__trace" points={geometry.profile} vectorEffect="non-scaling-stroke" />
        </svg>
        {/* Keyed by the night on show: a remount replays the row-by-row entrance exactly when the
            figures change, which is when the answer they carry changed. */}
        <span key={date} className="sleep-echo__durations" data-testid="sleep-echo-durations" aria-hidden={time}>
          {durations.map((d) => (
            <span key={d.stage} style={{ color: STAGE_COLOR[d.stage] }}>
              {/* The duration follows its row IMMEDIATELY and takes the phase's colour, which is
                  what names it — so no "REM" is needed beside the number. The format is SHORT
                  because the full spelling ate the gap to the edge-pinned name. */}
              <span
                className="sleep-echo__duration"
                data-testid={`sleep-duration-${d.stage}`}
                aria-label={`${names[d.stage] ?? ""}: ${formatSleep(d.minutes)}`}
                style={{
                  left: `calc(${d.end * 100}% * var(--sleep-summary-scale) + var(--sleep-duration-gap))`,
                  top: `${d.center * 100}%`,
                }}
              >
                {formatSleepShort(d.minutes)}
              </span>
              {/* The phase name sits at the right edge, in the same colour but dimmer than the
                  number: the label is a legend to the row, not data, and the number must read first. */}
              <span
                className="sleep-echo__name"
                data-testid={`sleep-name-${d.stage}`}
                style={{ top: `${d.center * 100}%` }}
              >
                {names[d.stage]}
              </span>
            </span>
          ))}
        </span>
        {/* The night's ends belong to the DRAWING, not to the legend line: the axis runs left to
            right, and at the surface the columns are nearly transparent, so the top corners are
            the one free place on the picture. DESIGN §7.7 */}
        {time && times && (
          <span className="sleep-echo__bounds">
            <span className="sleep-echo__edge">{times.from}</span>
            <span className="sleep-echo__edge" data-side="to">{times.to}</span>
          </span>
        )}
      </span>

      {/* The caption's strip: two blur passes the height OF THE TILE, masked open only at the
          bottom. Full height because `backdrop-filter` sampling clamps at its box's edges, and a
          strip-height layer would smear along its top edge (docs/pitfalls.md). */}
      <span className="sleep-echo__blur sleep-echo__blur--soft" aria-hidden />
      <span className="sleep-echo__blur sleep-echo__blur--deep" aria-hidden />

      <span className="sleep-echo__band">
        <span className="sleep-echo__head">
          <SleepMoon date={date} textured />
          {/* Numerals in the strip's own large step, units a step down and quieter: the full words
              fit once they stop competing with the number, and the number still reads first. */}
          <span key={date} className="sleep-echo__total">
            {sleepDurationParts(night.asleep).map((p, i) => (
              <Fragment key={p.unit}>
                {i > 0 && " "}
                {p.value}
                <span className="sleep-echo__unit">&nbsp;{p.unit}</span>
              </Fragment>
            ))}
          </span>
          {night.timed && <ModeSwitch timed={time} />}
        </span>
        {/* The strip's second line exists only in the chronology, and it rises ABOVE the duration
            rather than pushing it: the duration is the strip's fixed anchor. DESIGN §7.7 */}
        {time && (
          <span className="sleep-echo__phases">
            {legend?.map((p) => (
              <span key={p.key} className="sleep-echo__phase" style={{ color: p.color }}>
                {p.text}
              </span>
            ))}
          </span>
        )}
      </span>
    </Root>
  );
}
