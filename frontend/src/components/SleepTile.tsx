"use client";

import { useState, type CSSProperties } from "react";
import type { DayView } from "@/lib/api/types";
import { formatSleep, formatSleepShort } from "@/lib/format";
import { HoverTip } from "./HoverTip";
import { NightBand } from "./NightBand";
import { STAGE_COLOR } from "./nightGeometry";
import { SleepEcho } from "./SleepEcho";
import { SleepNoData } from "./SleepNoData";
import { sleepPhases } from "./sleepPhases";
import { BedIcon, SleepBigIcon } from "./StatsIcons";
import { TileShell, type TileState } from "./TileShell";

interface SleepTileProps {
  /** The selected day (the calendar's refocus) — the source of the duration and phases. */
  day: DayView | null;
  state: TileState;
  onRetry?: () => void;
  /**
   * The widget's edition (DESIGN §7.7, §10.1), chosen by the WAVE through the layout
   * (`tiles.sleep.edition`); the component knows nothing of waves. `echo` is a depth sounding
   * across the tile (see [SleepEcho]); an unknown name ⇒ the default sum-plus-band layout.
   */
  edition?: string;
  style?: CSSProperties;
  className?: string;
}

/** Cells in a phase's pixel bar (the same length, smaller cells, as in the mock-up). */
const BAR_CELLS = 15;

/** A phase's share as a pixel bar: a row of cells filled in proportion to the percentage (§7.7). */
function PixelBar({ pct, color }: { pct: number; color: string }) {
  const filled = Math.round((pct / 100) * BAR_CELLS);
  return (
    <div className="flex min-w-0 flex-1 gap-[2px]" aria-hidden>
      {Array.from({ length: BAR_CELLS }, (_, i) => (
        <span
          key={i}
          className="aspect-square flex-1 rounded-[1px]"
          style={{
            background: i < filled ? color : "var(--text-tertiary)",
            opacity: i < filled ? 1 : 0.16,
          }}
        />
      ))}
    </div>
  );
}

/**
 * The sleep tile: the selected day's night as duration, wakings and a phase breakdown. No phases
 * degrades to duration alone; no sleep at all is a quiet "no data". The second view is the night
 * BAND — the same question asked at a different precision, so it is a switch, not a tile. §7.7
 */
export function SleepTile({ day, state, onRetry, edition, style, className }: SleepTileProps) {
  // The view lives ABOVE the day, and both editions ask the same question of the night — sum or
  // clock. The echo tile stays mounted while the calendar moves so its complete previous night can
  // remain visible until the replacement arrives. DESIGN §7.7
  const [byHours, setByHours] = useState(false);
  // "Asleep–awake" arrives from the loaded night (see NightBand): the header is a tight fit by
  // meaning, but there it costs no separate line below the band, and vertical space is dear here.
  const [nightTimes, setNightTimes] = useState<string | null>(null);
  const minutes = day?.health.sleepMinutes ?? null;
  const hasData = day != null && minutes !== null;
  // We draw the empty state ourselves, so TileShell is kept in "loaded".
  const showEmpty = state === "loaded" && !hasData;
  const phases = sleepPhases(day?.health.sleepStages);
  const awake = day?.health.sleepStages?.awake ?? null;

  if (edition === "echo") {
    return (
      <TileShell
        state={showEmpty ? "loaded" : state}
        onRetry={onRetry}
        ariaLabel="Сон"
        style={style}
        className={`sleep-card--echo ${className ?? ""}`}
      >
        {/* The moon is THIS edition's empty mark; the default one keeps its bed and caption. */}
        {showEmpty && <SleepNoData date={day?.date} />}
        {/* The data key changes inside SleepEcho; keeping this instance preserves the finished graph
            while the next night travels, and avoids replaying its caption entrance delay. */}
        {hasData && (
          <SleepEcho
            date={day.date}
            stages={day.health.sleepStages}
            byHours={byHours}
            onToggle={() => setByHours((v) => !v)}
          />
        )}
      </TileShell>
    );
  }

  return (
    <TileShell
      state={showEmpty ? "loaded" : state}
      onRetry={onRetry}
      ariaLabel="Сон"
      style={style}
      className={className}
    >
      {showEmpty && (
        <div className="flex h-full items-center justify-center gap-4" data-testid="sleep-empty">
          <BedIcon height={62} />
          <span className="text-sm" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
            нет данных о сне
          </span>
        </div>
      )}
      {hasData && (
        <div className="tile-frame flex h-full min-w-0 flex-col" style={{ fontFamily: "var(--font-mono)" }}>
          {/* The header is one line: label, the night's times and the view switcher. Which day is
              selected is captioned in the "Today" tile and the calendar; repeating it here is
              pointless — the choice of day is shared by the whole board. */}
          <div className="mb-1 flex items-baseline gap-3">
            <span className="tile-label">сон</span>
            {/* The sleep times are data, not a meta label: the `tile-chrome` class, or a wave skin
                hiding `.tile-label` would carry the figures off with the labels. */}
            {byHours && nightTimes && <span className="tile-chrome">{nightTimes}</span>}
            {/* The switcher is flush right: it is a utility and must not argue with the night's
                figure. It is a control, so it too sits outside `.tile-label`. */}
            <button
              type="button"
              onClick={() => setByHours((v) => !v)}
              aria-pressed={byHours}
              className="tile-chrome ml-auto cursor-pointer underline decoration-dotted underline-offset-2"
              style={{ color: "var(--accent)" }}
            >
              {byHours ? "сумма" : "по часам"}
            </button>
          </div>

          {/* key by day: changing the selected day loads the night afresh, not someone else's. */}
          {byHours && (
            <div className="min-h-0 flex-1">
              <NightBand key={day.date} date={day.date} onTimes={setNightTimes} />
            </div>
          )}

          {!byHours && (
            <div className="flex min-h-0 flex-1 items-stretch gap-3">
              {/* Left: the night's duration and the wakings. */}
              <div className="flex w-[128px] shrink-0 flex-col justify-center">
                <div className="flex items-center gap-2">
                  <SleepBigIcon height={26} />
                  <span className="t-sleep-value whitespace-nowrap leading-none" style={{ color: "var(--text-primary)" }}>
                    {formatSleepShort(minutes)}
                  </span>
                </div>
                {awake !== null && (
                  <div className="mt-1.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
                    ворочался и не спал <span style={{ color: "var(--accent)" }}>{formatSleep(awake)}</span>
                  </div>
                )}
              </div>

              {/* Right: the phases as pixel bars, split off by a vertical rule (as in the mock-up). */}
              {phases ? (
                <div
                  className="flex min-w-0 flex-1 flex-col justify-center gap-2 pl-3"
                  style={{ borderLeft: "1px solid var(--border-tile)" }}
                >
                  {phases.map((p) => (
                    <div key={p.key} className="flex items-center gap-1.5 text-xs">
                      {/* The phase label anchors the wave's hint (the same [HoverTip] as the
                          life-day number and the streak flame): the phase names mean nothing on
                          their own, and the minutes beside them answer a different question. */}
                      <span className="w-10 shrink-0 whitespace-nowrap font-medium" style={{ color: STAGE_COLOR[p.key] }}>
                        <HoverTip text={p.hint} phrase>
                          {p.label}
                        </HoverTip>
                      </span>
                      <PixelBar pct={p.pct} color={STAGE_COLOR[p.key]} />
                      <span className="w-12 shrink-0 whitespace-nowrap text-right" style={{ color: "var(--text-tertiary)" }}>
                        {formatSleepShort(p.minutes)}
                      </span>
                      <span className="w-7 shrink-0 whitespace-nowrap text-right" style={{ color: STAGE_COLOR[p.key] }}>
                        {p.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="flex min-w-0 flex-1 items-center pl-3 text-xs"
                  style={{ color: "var(--text-tertiary)", borderLeft: "1px solid var(--border-tile)" }}
                >
                  фазы не записаны
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </TileShell>
  );
}
