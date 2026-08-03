"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { readCache, writeCache } from "@/lib/api/cache";
import { getDay, getDays } from "@/lib/api/client";
import type { DaySummary, DayView } from "@/lib/api/types";
import { addDays, mskToday, weekWindowAround } from "@/lib/date";
import type { DisciplineLens } from "@/lib/disciplineLens";
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
import { SleepTile } from "./SleepTile";
import { SocialTile } from "./SocialTile";
import { StatsTile } from "./StatsTile";
import { TodayTile } from "./TodayTile";
import { useWave } from "./WaveProvider";
import { WaveSwitcher } from "./WaveSwitcher";

type Status = "loading" | "error" | "loaded";

/**
 * Окно календаря — целые недели вокруг сегодня (PRD §5.3): две прошлые + текущая + следующая.
 * Считаем неделями, а не «±N дней»: сетка календаря — это ряды пн→вс, и окно с произвольного
 * дня давало рваный первый ряд, где прошлая неделя видна наполовину.
 */
const WEEKS_BEFORE = 2;
const WEEKS_AFTER = 1;

/**
 * Глубина истории для графиков статов (§7.4): окно календаря в четыре недели мало под скролл-в-прошлое,
 * поэтому статы тянут свою выборку [сегодня−(N−1), сегодня]. Ограничена 30 днями — дальше
 * листать пустоту смысла нет (при WINDOW=10 отлистывается максимум 20 дней назад).
 */
const STATS_HISTORY = 30;

/** Данные/хендлеры борда, прокидываемые в каждый тайл. */
interface BoardData {
  day: DayView | null;
  dayStatus: Status;
  summaries: DaySummary[];
  rangeStatus: Status;
  selected: string;
  today: string;
  /** История дней для спарклайна статов [сегодня−(STATS_HISTORY−1), сегодня] (§7.4). */
  statsHistory: DaySummary[];
  statsStatus: Status;
  selectDay: (date: string) => void;
  /** Линза дисциплины (§5.3): выбранная на карте-тропе остановка, по которой размечен календарь. */
  lens: DisciplineLens | null;
  setLens: (lens: DisciplineLens | null) => void;
  retryDay: () => void;
  retryRange: () => void;
  retryStats: () => void;
  /** Active wave key (fallback = wave-01 skin) — lets the today tile pick its quest sprite set. */
  wave: string;
}

/**
 * Борд danchuo.world (PRD §12 M2). Тянет данные на клиенте с независимыми per-tile
 * состояниями (DESIGN §7 — общего спиннера нет). Раскладка — из data-driven реестра
 * тайлов ([TILE_LAYOUT]): на десктопе (мышь/трекпад) bento 40×28, на тач-устройствах —
 * одноколоночный стек, в нём при <640px календарь заменяется недельной полосой (DESIGN §8).
 */
export function Board() {
  // Раскладка активной волны (мерж волны с дефолтом, DESIGN §3, §10). Своп волны
  // переключателем меняет её вживую — борд перерисовывается в новой сетке без перезагрузки.
  const { layout, activeKey } = useWave();
  const today = useMemo(() => mskToday(), []);
  const { from, to } = useMemo(() => weekWindowAround(today, WEEKS_BEFORE, WEEKS_AFTER), [today]);
  const statsFrom = useMemo(() => addDays(today, -(STATS_HISTORY - 1)), [today]);

  const [selected, setSelected] = useState(today);
  // Линза живёт на борде, а не в плитке: её ставит карта-тропа «Сегодня», а читает календарь.
  // Смену выбранного дня она переживает намеренно — это взгляд на историю, а не состояние дня.
  const [lens, setLens] = useState<DisciplineLens | null>(null);
  const [rangeStatus, setRangeStatus] = useState<Status>("loading");
  const [summaries, setSummaries] = useState<DaySummary[]>([]);
  const [statsStatus, setStatsStatus] = useState<Status>("loading");
  const [statsHistory, setStatsHistory] = useState<DaySummary[]>([]);
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

  // История статов — своя выборка (шире окна календаря), тот же stale-while-revalidate.
  const loadStats = useCallback(() => {
    const key = `days:${statsFrom}:${today}`;
    const cached = readCache<DaySummary[]>(key);
    if (cached) {
      setStatsHistory(cached);
      setStatsStatus("loaded");
    } else {
      setStatsStatus("loading");
    }
    getDays(statsFrom, today)
      .then((rows) => {
        setStatsHistory(rows);
        setStatsStatus("loaded");
        writeCache(key, rows);
      })
      .catch(() => {
        if (!cached) setStatsStatus("error");
      });
  }, [statsFrom, today]);

  useEffect(loadStats, [loadStats]);

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

  // Esc снимает линзу — привычный выход из «режима просмотра», и единственный клавиатурный.
  // Вешаем слушатель только когда линза включена: без неё борд событий не слушает.
  useEffect(() => {
    if (!lens) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLens(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lens]);

  const data: BoardData = {
    day,
    dayStatus,
    summaries,
    rangeStatus,
    selected,
    today,
    statsHistory,
    statsStatus,
    selectDay: setSelected,
    lens,
    setLens,
    retryDay: () => loadDay(selected),
    retryRange: loadRange,
    retryStats: loadStats,
    // null (деградированный SSR) ⇒ фолбэк-скин волны 01, поэтому и её спрайт-набор.
    wave: activeKey ?? "wave-01",
  };

  return (
    <main className="min-h-screen p-4">
      {/* Десктоп (мышь/трекпад, окно шире страховочного пола): полный bento без скролла
          (DESIGN §3, §8). Условие режима — в `.board-bento`/`.board-stack` (common.css):
          решает тип указателя, а не ширина, иначе браузерный зум ронял борд в стек. */}
      <div
        data-testid="bento"
        className="board-bento"
        style={{
          // minmax(0, …): bare 1fr means minmax(auto, 1fr) — track width would follow the
          // items' min-content. Tiles that size themselves in px from a measured cell width
          // (LatestDropTile/MusicTile shrink-to-content) then feed back into the tracks and
          // the mosaic oscillates. With a 0 minimum the tracks are pure layout, content can't
          // push them (rows below are already minmax(0, 1fr) for the same reason).
          gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
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
                data={data}
                orientation={span.orientation}
                style={{ height: "100%", width: "100%" }}
              />
            </div>
          );
        })}
      </div>

      {/* Тач-устройства (и аварийно — очень узкие окна): одноколоночный стек. Календарь тут
          такой же, как в бенто, — полная сетка недель (решение владельца). Раньше на узких
          экранах его подменяла недельная полоса, потому что «влезут ли 7 колонок» считалось
          открытым вопросом; замер показал, что влезают: ячейка на 360px это ~44px — ровно
          тач-таргет. А полоса показывала одну неделю, то есть отвечала на другой вопрос. */}
      <div data-testid="stack" className="board-stack flex-col gap-4">
        {layout.mobileOrder.map((id) =>
          layout.tiles[id]?.hidden ? null : (
            <div key={id} data-tile-id={id}>
              <BoardTile id={id} data={data} />
            </div>
          ),
        )}
      </div>
    </main>
  );
}

/**
 * Один тайл реестра как полноценный компонент (а не inline-функция в рендере —
 * иначе React терял бы идентичность поддерева).
 */
function BoardTile({
  id,
  data,
  orientation,
  style,
  className,
}: {
  id: TileId;
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
          lens={data.lens}
          onLensChange={data.setLens}
          style={style}
          className={className}
        />
      );
    case "stats":
      return (
        <StatsTile
          history={data.statsHistory}
          selected={data.selected}
          state={data.statsStatus}
          onRetry={data.retryStats}
          style={style}
          className={className}
        />
      );
    case "sleep":
      return (
        <SleepTile
          day={data.day}
          today={data.today}
          state={data.dayStatus}
          onRetry={data.retryDay}
          style={style}
          className={className}
        />
      );
    case "calendar":
      return (
        <Calendar
          days={data.summaries}
          selected={data.selected}
          today={data.today}
          onSelect={data.selectDay}
          state={data.rangeStatus}
          onRetry={data.retryRange}
          lens={data.lens}
          onLensChange={data.setLens}
          style={style}
          className={className}
        />
      );
    // Контентные тайлы M4 тянут данные сами (независимо от выбранного дня) — как музыка.
    case "music":
      return <MusicTile style={style} className={className} />;
    case "projects":
      return <ProjectsTile orientation={orientation} style={style} className={className} />;
    case "ride":
      return <RideTile wave={data.wave} style={style} className={className} />;
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
      return <WaveSwitcher orientation={orientation} style={style} className={className} />;
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
  sleep: "сон",
  today: "сегодня",
  calendar: "календарь",
  projects: "проекты",
  ride: "велобайк",
  hero: "hero",
  social: "соцсети",
  marquee: "артефакты",
};
