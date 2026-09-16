"use client";

import { useCallback, useEffect } from "react";
import { getSleepNight } from "@/lib/api/client";
import { clockLabel, LANES, nightBandGeometry, STAGE_COLOR } from "./nightGeometry";
import { SleepNoData } from "./SleepNoData";
import { useTileData } from "./useTileData";

/**
 * The night on tracks: the selected day's night laid out in time — when sleep began, where it
 * broke, which minutes were awake. Depth drives the vertical, so the night gains relief. It is
 * fetched only when the chart is opened, and remounts per day by `key`. DESIGN §7.7
 */
export function NightBand({ date, onTimes }: { date: string; onTimes?: (label: string | null) => void }) {
  const fetcher = useCallback((signal: AbortSignal) => getSleepNight(date, { signal }), [date]);
  const { phase, data, retry } = useTileData(fetcher, `sleep-night:${date}`);

  // The header shows "asleep–awake", but only the loaded night knows those numbers and it loads
  // here: the component is recreated per day (`key`), which is the only way a day change starts a
  // fresh load. So the times go up by callback rather than dragging the request into the parent.
  const times =
    data?.band != null
      ? `${clockLabel(data.band.onsetMinute, data.axisStartHour)}–${clockLabel(data.band.wakeMinute, data.axisStartHour)}`
      : null;
  useEffect(() => onTimes?.(times), [times, onTimes]);

  if (phase === "loading") {
    return <div className="pixel-shimmer h-full min-h-[52px] w-full" aria-hidden />;
  }
  if (phase === "error") {
    return (
      <div className="flex h-full flex-col items-start justify-center gap-1 text-xs">
        <span style={{ color: "var(--text-secondary)" }}>не удалось загрузить ночь</span>
        <button type="button" onClick={retry} className="cursor-pointer underline" style={{ color: "var(--accent)" }}>
          повторить
        </button>
      </div>
    );
  }

  const geometry = nightBandGeometry(data?.band, data?.axisStartHour);
  if (!geometry || !data?.band) {
    return <SleepNoData />;
  }

  const laneTop = (i: number) => `${(i * 100) / LANES.length}%`;
  const laneHeight = `${100 / LANES.length}%`;

  return (
    <div data-testid="night-band" className="flex h-full min-w-0 flex-col gap-1">
      {/* Lane labels and the lanes share one row: only then does a label stand exactly opposite its
          lane. The labels double as a permanent legend, so there is no legend row at all and its
          height went to the chart. */}
      <div className="flex min-h-0 w-full flex-1 gap-2">
        <div className="relative w-[52px] shrink-0 text-[9px] leading-none">
          {LANES.map((lane, i) => (
            <span
              key={lane.stage}
              className="absolute right-0 flex items-center justify-end"
              style={{ top: laneTop(i), height: laneHeight, color: STAGE_COLOR[lane.stage] }}
            >
              {lane.label}
            </span>
          ))}
        </div>

        {/* The phase lanes. The vertical axis here carries sleep depth — see LANES. */}
        <div className="relative min-h-[44px] min-w-0 flex-1">
          {LANES.map((lane, i) => (
            <span
              key={lane.stage}
              className="absolute left-0 w-full"
              style={{
                top: laneTop(i),
                height: laneHeight,
                // A thin guide: without it an empty lane is lost and the relief stops reading.
                borderBottom: i < LANES.length - 1 ? "1px solid var(--border-tile)" : undefined,
                opacity: 0.35,
              }}
              aria-hidden
            />
          ))}
          {geometry.parts.map((part, i) => (
            <span
              key={i}
              data-testid="night-band-part"
              className="absolute rounded-[2px]"
              style={{
                left: `${part.left}%`,
                width: `${part.width}%`,
                // A chunk does not fill the lane: gaps above and below keep the lanes distinct.
                top: `calc(${laneTop(part.lane)} + 2px)`,
                height: `calc(${laneHeight} - 4px)`,
                background: STAGE_COLOR[part.stage],
              }}
            />
          ))}
        </div>
      </div>

      {/* The hour scale, under the lanes and with the same left inset as they have. */}
      <div className="relative ml-[60px] h-3" aria-hidden>
        {geometry.ticks.map((tick) => (
          <span
            key={tick.minute}
            className="absolute text-[10px] leading-none"
            style={{
              left: `${tick.left}%`,
              transform: tick.left === 0 ? "none" : tick.left === 100 ? "translateX(-100%)" : "translateX(-50%)",
              color: "var(--text-tertiary)",
            }}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  );
}
