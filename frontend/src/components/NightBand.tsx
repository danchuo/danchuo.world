"use client";

import { useCallback, useEffect } from "react";
import { getSleepNight } from "@/lib/api/client";
import { clockLabel, LANES, nightBandGeometry, STAGE_COLOR } from "./nightGeometry";
import { SleepNoData } from "./SleepNoData";
import { useTileData } from "./useTileData";

/**
 * Ночь по дорожкам (§7.7, идея I-23): ночь выбранного дня во времени — во сколько лёг, где
 * провалился, в какие минуты не спал. Вертикаль несёт глубину сна, поэтому у ночи появляется
 * рельеф: глубокий сон в начале, REM к утру, пробуждения всплесками вверх.
 *
 * Данные тянутся отдельным запросом и только когда график открыли: борду он не нужен. Компонент
 * монтируется по дню (`key`), поэтому смена дня начинает загрузку заново.
 */
export function NightBand({ date, onTimes }: { date: string; onTimes?: (label: string | null) => void }) {
  const fetcher = useCallback((signal: AbortSignal) => getSleepNight(date, { signal }), [date]);
  const { phase, data, retry } = useTileData(fetcher, `sleep-night:${date}`);

  // «Лёг–встал» показывает шапка плитки, но знает эти числа только загруженная ночь, а грузится
  // она здесь: компонент пересоздаётся по дню (`key`), и только так смена дня начинает загрузку
  // заново. Поэтому времена уезжают наверх колбэком, а не тянут за собой запрос в родителя.
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
      {/*
        Подписи дорожек и сами дорожки — одна строка: только так подпись стоит строго напротив
        своей дорожки. Подписи заодно работают вечной легендой — они видны всегда, а не
        вспоминаются, поэтому отдельной строки-легенды нет вовсе и её высота досталась графику.
      */}
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

        {/* Дорожки фаз. Вертикаль здесь несёт глубину сна — см. LANES. */}
        <div className="relative min-h-[44px] min-w-0 flex-1">
          {LANES.map((lane, i) => (
            <span
              key={lane.stage}
              className="absolute left-0 w-full"
              style={{
                top: laneTop(i),
                height: laneHeight,
                // Тонкая направляющая: без неё пустая дорожка теряется и рельеф не читается.
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
                // Кусок не во всю дорожку: зазор сверху и снизу держит дорожки различимыми.
                top: `calc(${laneTop(part.lane)} + 2px)`,
                height: `calc(${laneHeight} - 4px)`,
                background: STAGE_COLOR[part.stage],
              }}
            />
          ))}
        </div>
      </div>

      {/* Шкала часов — под дорожками, с тем же отступом слева, что и они. */}
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
