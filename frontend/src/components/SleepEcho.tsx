"use client";

import { Fragment, useCallback, useId, useMemo, type CSSProperties } from "react";
import { getSleepNight } from "@/lib/api/client";
import type { SleepStagesView } from "@/lib/api/types";
import { formatSleep, formatSleepShort, sleepDurationParts } from "@/lib/format";
import { moonLitPath, moonPhase } from "@/lib/moonPhase";
import { LANES, STAGE_COLOR, clockLabel, type SleepStageKey } from "./nightGeometry";
import { ECHO_VIEW, echoGeometry, echoNight, echoNightFromStages, type EchoNight } from "./soundingGeometry";
import { SleepNoData } from "./SleepNoData";
import { sleepPhases } from "./sleepPhases";
import { useTileData } from "./useTileData";

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
  /** The chosen view, held by [SleepTile]: this component is remounted per day (see its `key`). */
  byHours: boolean;
  onToggle: () => void;
}) {
  const fetcher = useCallback((signal: AbortSignal) => getSleepNight(date, { signal }), [date]);
  const { data, settled } = useTileData(fetcher, `sleep-night:${date}`);

  // The night by minutes comes from chunks; with none (the watch gave only totals) the same phases
  // arrive without a chronology, and the tile honestly stays in one mode instead of inventing an order.
  const night = useMemo(
    () => echoNight(data?.band) ?? echoNightFromStages(stages),
    [data?.band, stages],
  );

  // Nothing at all until the NETWORK HAS ANSWERED, not even a shimmer. The day's totals alone would
  // already draw a sounding, and the real night then moved every bar under a 720ms transition: the
  // figures arrived first and the picture caught up. It appears once, whole. DESIGN §7.7
  if (!settled) {
    return null;
  }
  if (!night) {
    return <SleepNoData />;
  }
  return (
    <Sounding
      night={night}
      date={date}
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

/**
 * The moon over this night, the sign by which the tile names its subject: the edition has no word
 * "sleep", and a depth survey alone does not say it. The disc is always drawn whole with the lit
 * part over it — the dark side is the moon in shadow, not emptiness, or a new moon vanishes.
 */
function MoonMark({ date }: { date: string }) {
  const phase = moonPhase(date);
  // Ids MUST be unique per instance, as for the sounding's gradients below: the board keeps both
  // layouts in the DOM, and a shared id sends `url(#…)` into the hidden copy. DESIGN §7.7
  const uid = useId().replace(/[^a-z0-9]/gi, "");
  if (!phase) return null;
  const id = (part: string) => `sleep-moon-${uid}-${part}`;
  const lit = moonLitPath(phase.cycle, MOON_R);
  return (
    <svg className="sleep-echo__moon" viewBox="-8 -8 16 16" aria-hidden>
      <defs>
        {/* Earthshine: the shadowed side is lightest next to the lit limb, not evenly grey. */}
        <radialGradient id={id("dark")} cx="0.78" cy="0.4" r="0.95">
          <stop offset="0" stopColor="var(--text-secondary)" stopOpacity="0.2" />
          <stop offset="0.5" stopColor="var(--text-tertiary)" stopOpacity="0.12" />
          <stop offset="1" stopColor="var(--text-tertiary)" stopOpacity="0.05" />
        </radialGradient>
        {/* What makes the disc a SPHERE rather than a paper cut-out: the lit side carries limb
            darkening, so it dims toward its own edge. Extra stops, because a two-stop ramp at this
            alpha bands into visible steps on dark glass. */}
        <radialGradient id={id("lit")} cx="0.6" cy="0.36" r="0.78">
          <stop offset="0" stopColor="var(--text-secondary)" stopOpacity="0.82" />
          <stop offset="0.42" stopColor="var(--text-secondary)" stopOpacity="0.7" />
          <stop offset="0.72" stopColor="var(--text-secondary)" stopOpacity="0.58" />
          <stop offset="1" stopColor="var(--text-tertiary)" stopOpacity="0.46" />
        </radialGradient>
        {/* Maria as three octaves of one noise: the 0.3 fundamental gives the blotches, its
            harmonics the grain that DITHERS the gradients above — the same grain that removes
            their banding. The house recipe, as on the wave-01 body. */}
        <filter id={id("mare")} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.3"
            numOctaves="3"
            seed="7"
            stitchTiles="stitch"
            result="noise"
          />
          <feColorMatrix in="noise" type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="linear" slope="0.35" intercept="0" />
            <feFuncG type="linear" slope="0.35" intercept="0" />
            <feFuncB type="linear" slope="0.42" intercept="0" />
          </feComponentTransfer>
        </filter>
        <clipPath id={id("clip")}>
          <path d={lit} />
        </clipPath>
      </defs>
      {/* A waning moon is the same body mirrored: the lit edge moves to the disc's left side, and
          shading, maria and the crescent's own shape all have to travel with it. */}
      <g className="sleep-echo__moon-body" transform={phase.waxing ? undefined : "scale(-1 1)"}>
        <circle className="sleep-echo__moon-disc" r={MOON_R} fill={`url(#${id("dark")})`} />
        <path className="sleep-echo__moon-lit" d={lit} fill={`url(#${id("lit")})`} />
        <rect
          className="sleep-echo__moon-mare"
          x={-MOON_R}
          y={-MOON_R}
          width={MOON_R * 2}
          height={MOON_R * 2}
          filter={`url(#${id("mare")})`}
          clipPath={`url(#${id("clip")})`}
        />
        {/* The limb keeps the edge crisp over the soft shading, and it is what carries the sign
            through a new moon, where there is nothing lit to draw at all. */}
        <circle className="sleep-echo__moon-limb" r={MOON_R} />
      </g>
    </svg>
  );
}

const MOON_R = 6;

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
    const legend = LANES.flatMap((lane) => {
      if (lane.stage === "awake") return [];
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
      <span className="sleep-echo__plot">
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
        <span className="sleep-echo__durations" data-testid="sleep-echo-durations" aria-hidden={time}>
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
          <MoonMark date={date} />
          {/* Numerals in the strip's own large step, units a step down and quieter: the full words
              fit once they stop competing with the number, and the number still reads first. */}
          <span className="sleep-echo__total">
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
