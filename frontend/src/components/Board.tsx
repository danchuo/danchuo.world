"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getDay, getDays } from "@/lib/api/client";
import type { DaySummary, DayView } from "@/lib/api/types";
import { mskToday, windowAround } from "@/lib/date";
import { BENTO_COLS, BENTO_ROWS, gridArea, MOBILE_ORDER, TILE_LAYOUT, type TileId } from "@/lib/layout";
import { Calendar } from "./Calendar";
import { PlaceholderTile } from "./PlaceholderTile";
import { StatsTile } from "./StatsTile";
import { TodayTile } from "./TodayTile";
import { WeekStrip } from "./WeekStrip";

type Status = "loading" | "error" | "loaded";
type TileVariant = "grid" | "stack" | "strip";

/** Радиус окна календаря/мини-графика — ±15 дней (PRD §5.3). */
const RADIUS = 15;

/** Данные/хендлеры борда, прокидываемые в каждый тайл. */
interface BoardData {
  day: DayView | null;
  dayStatus: Status;
  summaries: DaySummary[];
  rangeStatus: Status;
  selected: string;
  today: string;
  selectDay: (date: string) => void;
  retryDay: () => void;
  retryRange: () => void;
}

/**
 * Борд danchuo.world (PRD §12 M2). Тянет данные на клиенте с независимыми per-tile
 * состояниями (DESIGN §7 — общего спиннера нет). Раскладка — из data-driven реестра
 * тайлов ([TILE_LAYOUT]): на десктопе (≥1440px) bento 20×14, ниже — одноколоночный стек,
 * на мобиле (<640px) календарь заменяется недельной полосой (DESIGN §8).
 */
export function Board() {
  const today = useMemo(() => mskToday(), []);
  const { from, to } = useMemo(() => windowAround(today, RADIUS), [today]);

  const [selected, setSelected] = useState(today);
  const [rangeStatus, setRangeStatus] = useState<Status>("loading");
  const [summaries, setSummaries] = useState<DaySummary[]>([]);
  const [dayStatus, setDayStatus] = useState<Status>("loading");
  const [day, setDay] = useState<DayView | null>(null);
  // Кэш загруженных дней — это накопитель ответов сети, не отображаемое состояние:
  // держим в ref, чтобы запись в кэш не вызывала лишний рендер.
  const dayCache = useRef<Record<string, DayView>>({});

  const loadRange = useCallback(() => {
    setRangeStatus("loading");
    getDays(from, to)
      .then((data) => {
        setSummaries(data);
        setRangeStatus("loaded");
      })
      .catch(() => setRangeStatus("error"));
  }, [from, to]);

  useEffect(loadRange, [loadRange]);

  const loadDay = useCallback((date: string) => {
    const cached = dayCache.current[date];
    if (cached) {
      setDay(cached);
      setDayStatus("loaded");
      return;
    }
    setDayStatus("loading");
    setDay(null);
    getDay(date)
      .then((d) => {
        dayCache.current[date] = d;
        setDay(d);
        setDayStatus("loaded");
      })
      .catch(() => setDayStatus("error"));
  }, []);

  useEffect(() => loadDay(selected), [selected, loadDay]);

  const data: BoardData = {
    day,
    dayStatus,
    summaries,
    rangeStatus,
    selected,
    today,
    selectDay: setSelected,
    retryDay: () => loadDay(selected),
    retryRange: loadRange,
  };

  return (
    <main className="min-h-screen p-4">
      {/* Десктоп ≥1440px: полный bento 20×14 без скролла (DESIGN §3, §8). */}
      <div
        data-testid="bento"
        className="hidden min-[1440px]:grid"
        style={{
          gridTemplateColumns: `repeat(${BENTO_COLS}, 1fr)`,
          gridTemplateRows: `repeat(${BENTO_ROWS}, minmax(0, 1fr))`,
          gap: 12,
          height: "calc(100vh - 32px)",
        }}
      >
        {(Object.keys(TILE_LAYOUT) as TileId[]).map((id) => (
          <div key={id} style={{ gridArea: gridArea(TILE_LAYOUT[id]), minHeight: 0 }}>
            <BoardTile id={id} variant="grid" data={data} style={{ height: "100%", width: "100%" }} />
          </div>
        ))}
      </div>

      {/* <1440px: одноколоночный стек; календарь → недельная полоса на мобиле (<640px). */}
      <div data-testid="stack" className="flex flex-col gap-4 min-[1440px]:hidden">
        {MOBILE_ORDER.map((id) =>
          id === "calendar" ? (
            <div key={id}>
              <div className="hidden sm:block">
                <BoardTile id={id} variant="grid" data={data} />
              </div>
              <div className="sm:hidden">
                <BoardTile id={id} variant="strip" data={data} />
              </div>
            </div>
          ) : (
            <div key={id}>
              <BoardTile id={id} variant="stack" data={data} />
            </div>
          ),
        )}
      </div>
    </main>
  );
}

/**
 * Один тайл реестра как полноценный компонент (а не inline-функция в рендере —
 * иначе React терял бы идентичность поддерева). [variant] управляет тем, чем заменить
 * календарь на узких экранах: сетка (`grid`/`stack`) или недельная полоса (`strip`).
 */
function BoardTile({
  id,
  variant,
  data,
  style,
  className,
}: {
  id: TileId;
  variant: TileVariant;
  data: BoardData;
  style?: CSSProperties;
  className?: string;
}) {
  switch (id) {
    case "today":
      return (
        <TodayTile day={data.day} state={data.dayStatus} onRetry={data.retryDay} style={style} className={className} />
      );
    case "stats":
      return (
        <StatsTile
          day={data.day}
          window={data.summaries}
          state={data.dayStatus}
          onRetry={data.retryDay}
          style={style}
          className={className}
        />
      );
    case "calendar":
      return variant === "strip" ? (
        <WeekStrip
          days={data.summaries}
          selected={data.selected}
          today={data.today}
          onSelect={data.selectDay}
          state={data.rangeStatus}
          onRetry={data.retryRange}
          style={style}
          className={className}
        />
      ) : (
        <Calendar
          days={data.summaries}
          selected={data.selected}
          today={data.today}
          onSelect={data.selectDay}
          state={data.rangeStatus}
          onRetry={data.retryRange}
          style={style}
          className={className}
        />
      );
    case "identity":
      return <PlaceholderTile brand label="danchuo.world" style={style} className={className} />;
    default:
      return <PlaceholderTile label={TILE_NOTES[id]} style={style} className={className} />;
  }
}

/** Подписи пустых швов борда (тайлы будущих эр, DESIGN §7 Empty). */
const TILE_NOTES: Record<TileId, string> = {
  identity: "danchuo.world",
  photoDrops: "фото-дропы",
  waveSwitcher: "волны",
  freshness: "свежесть данных",
  music: "музыка",
  stats: "статы",
  today: "сегодня",
  calendar: "календарь",
  projects: "проекты",
  hero: "hero",
  social: "соцсети",
  marquee: "артефакты",
};
