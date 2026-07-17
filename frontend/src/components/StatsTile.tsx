"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { DaySummary } from "@/lib/api/types";
import { formatSleepAxis, formatSleepShort, formatSteps, formatStepsAxis } from "@/lib/format";
import {
  average,
  axisBounds,
  clampOffset,
  maxOffset,
  visibleWindow,
  type SparkPoint,
} from "./statsSparkline";
import { SleepIcon, StepsIcon } from "./StatsIcons";
import { TileShell, type TileState } from "./TileShell";

interface StatsTileProps {
  /** История дней (старые→новые, «сегодня» последний) — источник графиков (§7.4). */
  history: DaySummary[];
  /** Выбранный в календаре день — на нём стоит вертикальный маркер, его значение — слева. */
  selected: string;
  state: TileState;
  onRetry?: () => void;
  style?: CSSProperties;
  className?: string;
}

/** Сколько дней помещаем во всю ширину; остальное прячется под скролл-в-прошлое (§7.4). */
const WINDOW = 10;
const PAD_X = 8;
const RIGHT_AXIS = 28; // поле справа под метки оси Y
const AXIS_H = 14; // ось дат снизу
const BAND_PAD = 8; // отступ графика внутри полосы (сверху и снизу)
const DOT_R = 2.3;
const LABEL_EVERY = 3;
/** Порог дельты колеса на один день прокрутки (больше = медленнее; гасит рывки тачпада). */
const SCROLL_STEP_PX = 120;
/**
 * Минимальный размах оси Y (§7.4): ось автомасштабируется по видимому окну, но не сжимается
 * ниже этого размаха — чтобы стабильные дни давали спокойную волну, а не раздутый шум.
 */
const STEPS_MIN_SPAN = 3000;
const SLEEP_MIN_SPAN = 90; // 1.5 ч

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

/** Замер контейнера графиков (px) — SVG рисуем в реальных пикселях, чтобы точки не искажались. */
function useSize(): [React.RefObject<HTMLDivElement | null>, { w: number; h: number }] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/** Читаут метрики: иконка+подпись (в цвет), значение выбранного дня, среднее по окну. */
function MetricReadout({ m, value, avg }: { m: Metric; value: number | null; avg: number | null }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5" style={{ color: m.labelColor }}>
        {m.icon}
        <span className="text-sm font-medium">{m.caption}</span>
      </div>
      <div
        className={`mt-0.5 truncate text-[15px] leading-tight ${value === null ? "text-center" : ""}`}
        style={{ color: m.valueColor, fontFamily: "var(--font-mono)" }}
      >
        {value === null ? "—" : m.valueLabel(value)}
      </div>
      <div className="mt-1.5 truncate text-[9px]" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
        AVG {avg === null ? "—" : m.valueLabel(avg)}
      </div>
    </div>
  );
}

/**
 * Статы (§7.4): два линейных графика с общим окном/скроллом — шаги (сверху) и сон (снизу).
 * Слева — иконка+значение выбранного дня и среднее по видимому окну (динамически), по центру
 * своей полосы (совпадает со средней линией). Справа рамка оси Y (низ 0 / середина / верх; шаги в
 * K, сон в ч; дефолт 15K/10ч, выше — если в окне есть такой день; пересчёт по окну). Вертикальный
 * маркер — на выбранном дне (клик по календарю переносит окно к нему). Колесо/тачпад листают окно
 * (инвертировано, ~120px/день), на краях отдаётся странице; наведение — тултип. Пропуски — разрывы.
 */
function StatsCharts({ history, selected }: { history: DaySummary[]; selected: string }) {
  const [boxRef, { w, h }] = useSize();
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

  // Клик по календарю: если выбранный день вне окна — подвинуть окно, чтобы он стал виден
  // (историчность сохраняется: вокруг него те же 10 дней). Уже видимый день окно не дёргает.
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
    <div className="flex h-full min-w-0 gap-2">
      {/* Левая колонка — читауты по центру своих полос (совпадает со средней линией). */}
      <div className="flex w-[58px] shrink-0 flex-col">
        <div className="flex flex-1 flex-col">
          {metrics.map((m) => (
            <div key={m.key} className="flex flex-1 items-center">
              <MetricReadout m={m} value={selectedValue(m.points)} avg={bands[metrics.indexOf(m)].avg} />
            </div>
          ))}
        </div>
        {/* Пустой поясок под ось дат — чтобы читауты центрировались ровно по полосам графиков. */}
        <div style={{ height: AXIS_H }} />
      </div>

      {/* Графики. */}
      <div ref={boxRef} className="relative min-w-0 flex-1">
        {w > 0 && h > 0 && (
          <svg width={w} height={h} className="block" aria-hidden>
            {/* Вертикальная сетка — одна линия на день, во всю высоту графиков. */}
            {dates.map((d, i) => (
              <line key={`g-${d}`} x1={x(i)} x2={x(i)} y1={0} y2={plotH} stroke="var(--text-tertiary)" strokeWidth={1} opacity={0.13} />
            ))}

            {/* Маркер выбранного дня — пунктирная вертикаль. */}
            {selIdx >= 0 && (
              <line x1={x(selIdx)} x2={x(selIdx)} y1={0} y2={plotH} stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 3" opacity={0.65} />
            )}

            {bands.map(({ m, row, wPts, min, max, top, innerH, y, segments }) => (
              <g key={m.key}>
                {/* Рамка + средняя линия оси Y с метками справа (верх / середина / низ). */}
                {[
                  { v: max, yy: top },
                  { v: (min + max) / 2, yy: top + innerH / 2 },
                  { v: min, yy: top + innerH },
                ].map((t, ti) => (
                  <g key={ti}>
                    <line x1={PAD_X} x2={plotRight} y1={t.yy} y2={t.yy} stroke="var(--text-tertiary)" strokeWidth={1} opacity={ti === 1 ? 0.12 : 0.22} />
                    <text x={plotRight + 3} y={t.yy + 3} fontSize={8.5} fill="var(--text-tertiary)" style={{ fontFamily: "var(--font-mono)" }}>
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

            {/* Ось дат снизу — реже, чтобы `16.07` не наезжали; крайняя слева якорится по началу. */}
            {dates.map((d, i) =>
              i % LABEL_EVERY === 0 || i === selIdx ? (
                <text
                  key={`d-${d}`}
                  x={i === 0 ? 2 : x(i)}
                  y={plotH + AXIS_H - 3}
                  fontSize={10}
                  textAnchor={i === 0 ? "start" : "middle"}
                  fill={d === selected ? "var(--accent)" : "var(--text-tertiary)"}
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {shortDate(d)}
                </text>
              ) : null,
            )}
          </svg>
        )}

        {/* Тултип наведённой точки — дата + значение метрики. */}
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
 * Статы (S) — активность (шаги) и сон за период (§7.4). Детали ночи и фазы — в отдельной плитке
 * «сон» (§7.7). Пустая история (нет ни шагов, ни сна) — тихое «нет данных».
 */
export function StatsTile({ history, selected, state, onRetry, style, className }: StatsTileProps) {
  const hasData = history.some((d) => d.steps !== null || d.sleepMinutes !== null);
  const effective: TileState = state === "loaded" && !hasData ? "empty" : state;

  return (
    <TileShell
      state={effective}
      onRetry={onRetry}
      label="активность и сон"
      ariaLabel="Статы — активность и сон"
      style={style}
      className={className}
    >
      <StatsCharts history={history} selected={selected} />
    </TileShell>
  );
}
