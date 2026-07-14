"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { readCache, writeCache } from "@/lib/api/cache";
import { getDay, getDays } from "@/lib/api/client";
import type { DaySummary, DayView } from "@/lib/api/types";
import { mskToday, windowAround } from "@/lib/date";
import { gridArea, type TileId, type TileOrientation } from "@/lib/layout";
import { ArtifactMarquee } from "./ArtifactMarquee";
import { Calendar } from "./Calendar";
import { FreshnessTile } from "./FreshnessTile";
import { HeroTile } from "./HeroTile";
import { LatestDropTile } from "./LatestDropTile";
import { MusicTile } from "./MusicTile";
import { PhotoDropsTile } from "./PhotoDropsTile";
import { PlaceholderTile } from "./PlaceholderTile";
import { ProjectsTile } from "./ProjectsTile";
import { RideTile } from "./RideTile";
import { SocialTile } from "./SocialTile";
import { StatsTile } from "./StatsTile";
import { TodayTile } from "./TodayTile";
import { useWave } from "./WaveProvider";
import { WaveSwitcher } from "./WaveSwitcher";
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
  /** Active wave key (fallback = wave-01 skin) — lets the today tile pick its quest sprite set. */
  wave: string;
}

/**
 * Борд danchuo.world (PRD §12 M2). Тянет данные на клиенте с независимыми per-tile
 * состояниями (DESIGN §7 — общего спиннера нет). Раскладка — из data-driven реестра
 * тайлов ([TILE_LAYOUT]): на десктопе (≥1440px) bento 20×14, ниже — одноколоночный стек,
 * на мобиле (<640px) календарь заменяется недельной полосой (DESIGN §8).
 */
export function Board() {
  // Раскладка активной волны (мерж волны с дефолтом, DESIGN §3, §10). Своп волны
  // переключателем меняет её вживую — борд перерисовывается в новой сетке без перезагрузки.
  const { layout, activeKey } = useWave();
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

  // Stale-while-revalidate (как у [useTileData]): сразу показываем последнюю удачную копию из
  // localStorage, чтобы серия F5 при сработавшем рейтлимите не обнуляла дневной слой борда.
  const loadRange = useCallback(() => {
    const key = `days:${from}:${to}`;
    const cached = readCache<DaySummary[]>(key);
    if (cached) {
      setSummaries(cached);
      setRangeStatus("loaded");
    } else {
      setRangeStatus("loading");
    }
    getDays(from, to)
      .then((data) => {
        setSummaries(data);
        setRangeStatus("loaded");
        writeCache(key, data);
      })
      .catch(() => {
        if (!cached) setRangeStatus("error");
      });
  }, [from, to]);

  useEffect(loadRange, [loadRange]);

  const loadDay = useCallback((date: string) => {
    const memo = dayCache.current[date];
    if (memo) {
      setDay(memo);
      setDayStatus("loaded");
      return;
    }
    // Перед сетью — последняя удачная копия дня с прошлой сессии (переживает F5/рейтлимит).
    const key = `day:${date}`;
    const persisted = readCache<DayView>(key);
    if (persisted) {
      setDay(persisted);
      setDayStatus("loaded");
    } else {
      setDayStatus("loading");
      setDay(null);
    }
    getDay(date)
      .then((d) => {
        dayCache.current[date] = d;
        setDay(d);
        setDayStatus("loaded");
        writeCache(key, d);
      })
      .catch(() => {
        if (!persisted) setDayStatus("error");
      });
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
    // null (деградированный SSR) ⇒ фолбэк-скин волны 01, поэтому и её спрайт-набор.
    wave: activeKey ?? "wave-01",
  };

  return (
    <main className="min-h-screen p-4">
      {/* Десктоп ≥1440px: полный bento 20×14 без скролла (DESIGN §3, §8). */}
      <div
        data-testid="bento"
        className="hidden min-[1440px]:grid"
        style={{
          gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
          gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
          // Прослойки между тайлами теперь структурные (пустые треки сетки 40×28,
          // см. layout.ts), поэтому CSS-gap минимальный — только чтобы не было касаний.
          gap: 4,
          height: "calc(100vh - 32px)",
        }}
      >
        {(Object.keys(layout.tiles) as TileId[]).map((id) => {
          const span = layout.tiles[id];
          if (span.hidden) return null; // волна спрятала тайл (DESIGN §10)
          return (
            // data-tile-id: атрибуция кликов для потайловой хитмапы (PRD §5.11 B2).
            <div key={id} data-tile-id={id} style={{ gridArea: gridArea(span), minHeight: 0 }}>
              <BoardTile
                id={id}
                variant="grid"
                data={data}
                orientation={span.orientation}
                style={{ height: "100%", width: "100%" }}
              />
            </div>
          );
        })}
      </div>

      {/* <1440px: одноколоночный стек; календарь → недельная полоса на мобиле (<640px). */}
      <div data-testid="stack" className="flex flex-col gap-4 min-[1440px]:hidden">
        {layout.mobileOrder.map((id) =>
          layout.tiles[id]?.hidden ? null : id === "calendar" ? (
            <div key={id} data-tile-id={id}>
              <div className="hidden sm:block">
                <BoardTile id={id} variant="grid" data={data} />
              </div>
              <div className="sm:hidden">
                <BoardTile id={id} variant="strip" data={data} />
              </div>
            </div>
          ) : (
            <div key={id} data-tile-id={id}>
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
  orientation,
  style,
  className,
}: {
  id: TileId;
  variant: TileVariant;
  data: BoardData;
  /** Ориентация контента из layout волны (DESIGN §10.1) — только bento; в стеке всё full-width. */
  orientation?: TileOrientation;
  style?: CSSProperties;
  className?: string;
}) {
  switch (id) {
    case "today":
      return (
        <TodayTile
          day={data.day}
          today={data.today}
          state={data.dayStatus}
          onRetry={data.retryDay}
          wave={data.wave}
          style={style}
          className={className}
        />
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
    // Контентные тайлы M4 тянут данные сами (независимо от выбранного дня) — как музыка.
    case "music":
      return <MusicTile style={style} className={className} />;
    case "projects":
      return <ProjectsTile style={style} className={className} />;
    case "ride":
      return <RideTile style={style} className={className} />;
    case "social":
      return <SocialTile style={style} className={className} />;
    case "marquee":
      return <ArtifactMarquee orientation={orientation} style={style} className={className} />;
    case "hero":
      return <HeroTile style={style} className={className} />;
    case "photoDrops":
      return <PhotoDropsTile orientation={orientation} style={style} className={className} />;
    case "latestDrop":
      return <LatestDropTile style={style} className={className} />;
    case "freshness":
      return <FreshnessTile style={style} className={className} />;
    case "waveSwitcher":
      return <WaveSwitcher style={style} className={className} />;
    case "identity":
      return <PlaceholderTile brand label="danchuo.world" style={style} className={className} />;
    default:
      // Пустых швов борда не осталось — все TileId имеют свой компонент.
      return <PlaceholderTile label={TILE_NOTES[id]} style={style} className={className} />;
  }
}

/** Подписи пустых швов борда (тайлы будущих эр, DESIGN §7 Empty). */
const TILE_NOTES: Record<TileId, string> = {
  identity: "danchuo.world",
  photoDrops: "дропы",
  latestDrop: "последний дроп",
  waveSwitcher: "волны",
  freshness: "свежесть данных",
  music: "музыка",
  stats: "статы",
  today: "сегодня",
  calendar: "календарь",
  projects: "проекты",
  ride: "велобайк",
  hero: "hero",
  social: "соцсети",
  marquee: "артефакты",
};
