"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { DaySummary, DayView } from "@/lib/api/types";
import { anchorOnDay, shiftAnchor } from "@/lib/calendarWindow";
import { addDays, mskToday } from "@/lib/date";
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
 * The calendar window as whole weeks around today: two past, the current one and the next. Counted
 * in weeks rather than days, because the calendar's grid is Monday-to-Sunday rows and a window
 * from an arbitrary day left a ragged first row with half a week showing. PRD §5.3
 */
const WEEKS_BEFORE = 2;
const WEEKS_AFTER = 1;

/**
 * The "field" edition's window does not reach forward at all: a future week held a whole grid row
 * for something that cannot exist. The next week stays reachable by stepping — it lives in the
 * edge, and the edge is only drawn for a shifted window. DESIGN §5.2
 */
const FIELD_WEEKS_AFTER = 0;

/**
 * Depth of the wave's backdrop — the last two weeks, ALWAYS those, wherever the calendar is
 * scrolled. It first read the calendar's window, but that is ONE widget's state while the backdrop
 * lies under everything: a step repainted the whole page as if the wave had changed. DESIGN §10.2
 */
const BACKDROP_DAYS = 14;


/** The board's data and handlers, passed down into every tile. */
interface BoardData {
  day: DayView | null;
  dayStatus: Status;
  summaries: DaySummary[];
  /** The wave backdrop's range (§10.2) — the last two weeks, whatever the calendar shows. */
  backdropDays: DaySummary[];
  rangeStatus: Status;
  selected: string;
  today: string;
  /** Day history for the stats sparkline, ending today (§7.4). */
  statsHistory: DaySummary[];
  statsStatus: Status;
  selectDay: (date: string) => void;
  /** Take a day into the calendar: select it and move the window so it lands in the grid. */
  focusDay: (date: string) => void;
  /** The calendar window's anchor (§5.3): the day whose weeks `summaries` was built around. */
  anchor: string;
  /** Page the calendar window by N weeks (-1 back, +1 forward). */
  shiftWeeks: (weeks: number) => void;
  /** Return the calendar window to today. */
  resetWindow: () => void;
  /** Whether the window has hit genesis — there is nothing further back to page to. */
  canGoBack: boolean;
  /**
   * How many of the window's weeks belong to the calendar's edge (§5.2). The board decides, since
   * it loads the window: the window's width and the edge's size are one number and must not drift.
   */
  edgeWeeks: number;
  /** The discipline lens (§5.3): the quest-map stop the calendar is marked up by. */
  lens: DisciplineLens | null;
  setLens: (lens: DisciplineLens | null) => void;
  retryDay: () => void;
  retryRange: () => void;
  retryStats: () => void;
  /** Active wave key (fallback = wave-01 skin) — lets the today tile pick its quest sprite set. */
  wave: string;
}

/**
 * The board: data is fetched client-side with independent per-tile states, so there is no shared
 * spinner. The layout comes from the data-driven tile registry — bento on pointer devices, a
 * single column on touch with the same calendar grid as the bento. DESIGN §7, §8
 */
export function Board() {
  // The active wave's layout, merged over the default. A swap in the switcher changes it live —
  // the board redraws into the new grid with no reload. DESIGN §3, §10
  const { layout, activeKey } = useWave();
  const today = useMemo(() => mskToday(), []);
  // The calendar window's anchor (§5.3). Home is today; paging moves the anchor by weeks, and ONLY
  // the anchor — the selected day is untouched, as this is viewing history, not choosing a day.
  const [anchor, setAnchor] = useState(today);

  // The calendar's edge (§5.2) shows REAL neighbouring weeks, so the window is taken a week wider
  // each side and the calendar trims them. Window size is known here because the board loads it;
  // which edition the tile wears is the wave's word.
  const fieldCalendar = layout.tiles.calendar.edition === "field";
  const edgeWeeks = fieldCalendar ? 1 : 0;
  const weeksAfter = fieldCalendar ? FIELD_WEEKS_AFTER : WEEKS_AFTER;

  const [selected, setSelected] = useState(today);
  // The lens lives on the board, not in a tile: the Today quest map sets it and the calendar reads
  // it. It deliberately survives a change of day — it is a view of history, not a day's state.
  const [lens, setLens] = useState<DisciplineLens | null>(null);
  // The day layer has its own seam ([useSelectedDay]), which has something to hold the screen with
  // while loading: the previously selected day.
  const { day, status: dayStatus, retry: retryDay } = useSelectedDay(selected);
  // The calendar's window layer has its own seam ([useCalendarWindow]) for the same reason: while a
  // paged window travels, the previous one stays on screen together with its anchor.
  const {
    days: summaries,
    status: rangeStatus,
    shownAnchor,
    canGoBack,
    retry: retryRange,
  } = useCalendarWindow(anchor, WEEKS_BEFORE + edgeWeeks, weeksAfter + edgeWeeks);

  // The charts' range is its own, wider than the calendar's, and FOLLOWS THE SELECTED DAY: the
  // board is a time machine, and a reader gone to June expects June's charts (§7.4). It moves
  // lazily, only once the day leaves its edges, or a click on a neighbour would cost a request.
  const [statsRange, setStatsRange] = useState<StatsRange>(() => statsWindow(today, today, null));
  useEffect(() => {
    // `statsWindow` returns the same object when there is nothing to move, so state stays put.
    setStatsRange((cur) => statsWindow(selected, today, cur));
  }, [selected, today]);

  // The wave backdrop reads its own range rather than the calendar's. Its end is pinned to today:
  // it is a ribbon of LIVED days, and beyond that there is nothing to take.
  const backdropFrom = useMemo(() => addDays(today, -(BACKDROP_DAYS - 1)), [today]);
  const { days: backdropDays } = useDayRange(backdropFrom, today, null);

  const {
    days: statsHistory,
    status: statsStatus,
    retry: retryStats,
  } = useDayRange(statsRange.from, statsRange.to, null);

  // Esc clears the lens — the habitual way out of a viewing mode, and the only keyboard one. The
  // listener is attached only while the lens is on; without it the board listens to nothing.
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
    backdropDays,
    rangeStatus,
    selected,
    today,
    statsHistory,
    statsStatus,
    selectDay: setSelected,
    // Selection and anchor together — this is NOT paging (§5.3): the gesture addresses a DAY, and
    // answering with a window alone would answer a different question.
    focusDay: (date: string) => {
      setSelected(date);
      setAnchor(anchorOnDay(date, today));
    },
    anchor: shownAnchor,
    shiftWeeks: (weeks: number) => setAnchor((cur) => shiftAnchor(cur, today, weeks)),
    resetWindow: () => setAnchor(today),
    canGoBack,
    edgeWeeks,
    lens,
    setLens,
    retryDay,
    retryRange,
    retryStats,
    // null (a degraded SSR) falls back to wave 01's skin, and therefore to its sprite set.
    wave: activeKey ?? "wave-01",
  };

  return (
    /* `relative` anchors the wave's backdrop layer: it spans `main`, that is the whole scrollable
       page, and travels with the board as one layer. Without it the layer would be measured from
       the viewport and, in the phone stack, lag behind the tiles by the entire scroll. */
    <main className="relative min-h-screen p-4">
      {/* The wave's backdrop layer (DESIGN §10.2): off by default, switched on by a wave's skin. */}
      <WaveBackdrop summaries={backdropDays} today={today} wave={activeKey} />

      {/* The wave's hover seam (DESIGN §10.2): off by default, switched on by a skin through
          `--tile-edge-light`. */}
      <TileEdgeLight wave={activeKey} />

      {/* Desktop (mouse or trackpad, window wider than the safety floor): the full bento without
          scrolling (DESIGN §3, §8). The mode condition lives in `.board-bento`/`.board-stack`:
          the pointer type decides, not the width, or browser zoom drops the board into the stack. */}
      <div
        data-testid="bento"
        className="board-bento"
        style={{
          // minmax(0, …): a bare 1fr means minmax(auto, 1fr), so track width would follow the
          // items' min-content. Tiles that size themselves in px from a measured cell then feed
          // back into the tracks and the mosaic oscillates. A 0 minimum keeps tracks pure layout.
          gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
          // The air between tiles is now structural (empty tracks of the 40x28 grid, see
          // layout.ts), so the CSS gap is minimal — just enough to prevent touching.
          gap: 4,
          height: "calc(100vh - 32px)",
        }}
      >
        {(Object.keys(layout.tiles) as TileId[]).map((id) => {
          const span = layout.tiles[id];
          if (span.hidden) return null; // the wave hid this tile (DESIGN §10)
          // Place in the grid and height within it come from the registry ([tileBox]): almost every
          // tile fills its span, while a content-height tile gets that span as a ceiling.
          const box = tileBox(id, span);
          return (
            // data-tile-id: click attribution for the per-tile heatmap (PRD §5.11).
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

      {/* Touch devices (and, as a fallback, very narrow windows): a single-column stack. The
          calendar here is the same full week grid as in bento — 7 columns fit, a cell at 360px is
          ~44px, exactly a tap target. A week strip was considered and rejected (DESIGN §8). */}
      <div data-testid="stack" className="board-stack flex-col gap-4">
        {layout.mobileOrder.map((id) =>
          layout.tiles[id]?.hidden ? null : (
            <div key={id} data-tile-id={id}>
              {/* The edition travels into the stack too: it is a choice of layout, not of flow. */}
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
 * One registry tile as a real component rather than an inline function in render — otherwise React
 * would lose the subtree's identity.
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
  /** Content orientation from the wave's layout — bento only; in the stack everything is full width. */
  orientation?: TileOrientation;
  /** The tile's edition from the wave's layout — in both bento and stack. */
  edition?: string;
  /** How the wave dresses project planets — in both modes as well. */
  planet?: string;
  /** The drop GALLERY's edition, shared per wave: both drop tiles open it. */
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
          edition={edition}
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
          onFocusDay={data.focusDay}
          state={data.rangeStatus}
          onRetry={data.retryRange}
          onShiftWeeks={data.shiftWeeks}
          onResetWindow={data.resetWindow}
          canGoBack={data.canGoBack}
          lens={data.lens}
          onLensChange={data.setLens}
          edition={edition}
          edgeWeeks={data.edgeWeeks}
          style={style}
          className={className}
        />
      );
    // Content tiles fetch their own data, independently of the selected day — as music does.
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
      // The switcher receives EXACTLY the range the board's backdrop does: a wave whose background
      // is made of data shows a piece of that background, not a lookalike pattern. DESIGN §2.6
      return (
        <WaveSwitcher
          orientation={orientation}
          summaries={data.backdropDays}
          today={data.today}
          style={style}
          className={className}
        />
      );
    case "identity":
      return <PlaceholderTile brand label="danchuo.world" style={style} className={className} />;
    default:
      // No empty seams are left on the board — every TileId has its component.
      return <PlaceholderTile label={TILE_NOTES[id]} style={style} className={className} />;
  }
}

/** Captions for the board's empty seams (tiles of future eras, DESIGN §7). */
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
