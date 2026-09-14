"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { DaySummary, DayView } from "@/lib/api/types";
import { shiftAnchor } from "@/lib/calendarWindow";
import { mskToday } from "@/lib/date";
import type { DisciplineLens } from "@/lib/disciplineLens";
import { statsWindow, type StatsRange } from "@/lib/statsWindow";
import { tileBox, type TileId, type TileOrientation } from "@/lib/layout";
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
import { TileEdgeLight } from "./TileEdgeLight";
import { TodayTile } from "./TodayTile";
import { WaveBackdrop } from "./WaveBackdrop";
import { useCalendarWindow } from "./useCalendarWindow";
import { useDayRange } from "./useDayRange";
import { useSelectedDay } from "./useSelectedDay";
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
  /** Опора окна календаря (§5.3): день, вокруг недели которого собрано `summaries`. */
  anchor: string;
  /** Листание окна календаря на N недель (−1 назад, +1 вперёд). */
  shiftWeeks: (weeks: number) => void;
  /** Возврат окна календаря к сегодня. */
  resetWindow: () => void;
  /** Упёрлось ли окно в генезис — дальше назад листать нечего. */
  canGoBack: boolean;
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
 * одноколоночный стек с той же сеткой календаря, что в бенто (DESIGN §8).
 */
export function Board() {
  // Раскладка активной волны (мерж волны с дефолтом, DESIGN §3, §10). Своп волны
  // переключателем меняет её вживую — борд перерисовывается в новой сетке без перезагрузки.
  const { layout, activeKey } = useWave();
  const today = useMemo(() => mskToday(), []);
  // Опора окна календаря (§5.3). Домашнее положение — «сегодня»; листание двигает её неделями,
  // и только её: выбранный день листание не трогает — это просмотр истории, а не выбор дня.
  const [anchor, setAnchor] = useState(today);

  const [selected, setSelected] = useState(today);
  // Линза живёт на борде, а не в плитке: её ставит карта-тропа «Сегодня», а читает календарь.
  // Смену выбранного дня она переживает намеренно — это взгляд на историю, а не состояние дня.
  const [lens, setLens] = useState<DisciplineLens | null>(null);
  // Дневной слой — свой шов ([useSelectedDay]): у него есть чем занять экран на время загрузки —
  // предыдущий выбранный день.
  const { day, status: dayStatus, retry: retryDay } = useSelectedDay(selected);
  // Оконный слой календаря — тоже свой шов ([useCalendarWindow]) и по той же причине: пока
  // едет отлистанное окно, на экране остаётся предыдущее вместе со своей опорой.
  const {
    days: summaries,
    status: rangeStatus,
    shownAnchor,
    canGoBack,
    retry: retryRange,
  } = useCalendarWindow(anchor, WEEKS_BEFORE, WEEKS_AFTER);

  // Выборка графиков — своя (шире окна календаря) и **следует за выбранным днём**: борд это
  // машина времени, и уехав в июнь, читатель ждёт июньских графиков (§7.4). Переносится лениво,
  // только когда выбранный день вышел за края, — иначе клик по соседнему дню гонял бы запрос.
  const [statsRange, setStatsRange] = useState<StatsRange>(() => statsWindow(today, today, null));
  useEffect(() => {
    // `statsWindow` возвращает тот же объект, когда двигать нечего, — состояние не меняется.
    setStatsRange((cur) => statsWindow(selected, today, cur));
  }, [selected, today]);

  const {
    days: statsHistory,
    status: statsStatus,
    retry: retryStats,
  } = useDayRange(statsRange.from, statsRange.to, null);

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
    anchor: shownAnchor,
    shiftWeeks: (weeks: number) => setAnchor((cur) => shiftAnchor(cur, today, weeks)),
    resetWindow: () => setAnchor(today),
    canGoBack,
    lens,
    setLens,
    retryDay,
    retryRange,
    retryStats,
    // null (деградированный SSR) ⇒ фолбэк-скин волны 01, поэтому и её спрайт-набор.
    wave: activeKey ?? "wave-01",
  };

  return (
    /* `relative` — опора фонового слоя волны: он растянут на `main`, то есть на всю
       прокручиваемую страницу, и едет вместе с бордом одним слоем (см. врез у
       `.wave-backdrop` в common.css). Без неё слой считался бы от вьюпорта и на стеке
       телефона отставал бы от плиток на всю прокрутку. */
    <main className="relative min-h-screen p-4">
      {/* Фоновый слой волны (DESIGN §10.2): по умолчанию выключен, волна включает его скином.
          Волне 03 он рисует холст — ленту прожитых дней из того же окна календаря, что и сетка. */}
      <WaveBackdrop summaries={summaries} today={today} wave={activeKey} />

      {/* Ховер-шов волны (DESIGN §10.2): по умолчанию выключен, волна включает его скином
          через `--tile-edge-light`. Волне 03 он даёт кромку, ловящую свет курсора. */}
      <TileEdgeLight wave={activeKey} />

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
          // Место в сетке и высота в нём — из реестра ([tileBox]): почти все тайлы занимают
          // спан целиком, тайл с высотой по содержимому получает спан потолком.
          const box = tileBox(id, span);
          return (
            // data-tile-id: атрибуция кликов для потайловой хитмапы (PRD §5.11 B2).
            <div key={id} data-tile-id={id} style={box.cell}>
              <BoardTile
                id={id}
                data={data}
                orientation={span.orientation}
                edition={span.edition}
                planet={span.planet}
                gallery={layout.gallery}
                style={box.tile}
              />
            </div>
          );
        })}
      </div>

      {/* Тач-устройства (и аварийно — очень узкие окна): одноколоночный стек. Календарь тут
          такой же, как в бенто, — полная сетка недель: 7 колонок влезают, ячейка на 360px
          это ~44px, ровно тач-таргет. Подменять его недельной полосой рассмотрено и
          отклонено — полоса показывает одну неделю, то есть отвечает на другой вопрос. */}
      <div data-testid="stack" className="board-stack flex-col gap-4">
        {layout.mobileOrder.map((id) =>
          layout.tiles[id]?.hidden ? null : (
            <div key={id} data-tile-id={id}>
              {/* Редакция едет и в стек: это выбор вёрстки, а не потока, и она общая для обоих режимов. */}
              <BoardTile
                id={id}
                data={data}
                edition={layout.tiles[id]?.edition}
                planet={layout.tiles[id]?.planet}
                gallery={layout.gallery}
              />
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
  edition,
  planet,
  gallery,
  style,
  className,
}: {
  id: TileId;
  data: BoardData;
  /** Ориентация контента из layout волны (DESIGN §10.1) — только bento; в стеке всё full-width. */
  orientation?: TileOrientation;
  /** Редакция тайла из layout волны (DESIGN §10.1) — и в bento, и в стеке. */
  edition?: string;
  /** Чем волна одевает планеты проектов (DESIGN §12.5) — тоже в обоих режимах. */
  planet?: string;
  /** Редакция ГАЛЕРЕИ дропа (общая на волну): её открывают обе дроп-плитки. */
  gallery?: string;
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
          anchor={data.anchor}
          onSelect={data.selectDay}
          state={data.rangeStatus}
          onRetry={data.retryRange}
          onShiftWeeks={data.shiftWeeks}
          onResetWindow={data.resetWindow}
          canGoBack={data.canGoBack}
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
      return (
        <ProjectsTile
          orientation={orientation}
          edition={edition}
          planet={planet}
          style={style}
          className={className}
        />
      );
    case "ride":
      return <RideTile wave={data.wave} edition={edition} style={style} className={className} />;
    case "social":
      return <SocialTile edition={edition} style={style} className={className} />;
    case "marquee":
      return <ArtifactMarquee orientation={orientation} style={style} className={className} />;
    case "hero":
      return <HeroTile style={style} className={className} />;
    case "photoDrops":
      return (
        <PhotoDropsTile orientation={orientation} edition={edition} gallery={gallery} style={style} className={className} />
      );
    case "latestDrop":
      return <LatestDropTile edition={edition} gallery={gallery} style={style} className={className} />;
    case "freshness":
      return <FreshnessTile style={style} className={className} />;
    case "waveSwitcher":
      // Окно календаря едет в переключатель тем же материалом, что и в холст борда: карта
      // волны, чей фон сделан из данных, показывает кусок этого фона (DESIGN §2.6).
      return (
        <WaveSwitcher
          orientation={orientation}
          summaries={data.summaries}
          today={data.today}
          style={style}
          className={className}
        />
      );
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
