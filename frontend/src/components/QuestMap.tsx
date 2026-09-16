"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type {
  DisciplineItemView,
  PodcastEpisodeView,
  ReadingBookView,
  TrackView,
} from "@/lib/api/types";
import { MONSTER_LENS_KEY, sameLens, type DisciplineLens } from "@/lib/disciplineLens";
import { monsterVerdict, type MonsterTone } from "@/lib/monster";
import { Cover, Marquee, NowPlayingCard } from "./NowPlayingCard";
import { CoverPlate } from "./SpotifyMark";
import { LISTENED_CAPTION, episodeForStop, listenedLabel, stretchLabel } from "@/lib/podcastCard";
import { bookForStop, progressLabel, PROGRESS_CAPTION } from "@/lib/readingCard";
import { SummaryModal } from "./SummaryModal";
import { bookSubject, episodeSubject, type SummarySubject } from "@/lib/summarySubject";

/**
 * The discipline quest map: the day's checklist as a winding morning-to-night route of stops.
 * States are derived from counters, since the model has no time in it. The monster stands BESIDE
 * the route, joined to nothing — it is a fact about the day, not a stage of it. DESIGN §4.1
 */

interface QuestMapProps {
  items: DisciplineItemView[];
  /**
   * Whether the monster was drunk; `null` means there is no record for the day, so we have no
   * verdict either. The THIRD STATE is mandatory: without it a missing record passed for a clean
   * day, and future days and gaps read silently as "did not drink". DESIGN §4.1
   */
  monsterDrunk: boolean | null;
  /** Inverse "clean" streak: consecutive days the monster was NOT drunk (§5.6). Shield badge ≥2. */
  monsterCleanStreak?: number;
  /** Active wave key (Board → TodayTile). Waves in [QUEST_SPRITE_WAVES] swap the hand-drawn
   *  pixel glyphs for generated raster sprites (DESIGN §12); other waves and tests (no wave)
   *  keep the currentColor cells and render unchanged. */
  wave?: string | null;
  /** The stop the calendar is currently looking through (PRD §5.3) — raised and outlined. */
  lens?: DisciplineLens | null;
  /** Lens selection handler. Without it the stops are NOT interactive and the map renders as a
   *  picture, which is what skins, tests and picture-only placements need. */
  onLensChange?: (lens: DisciplineLens | null) => void;
}

/** Waves shipping a generated quest sprite set (/assets/waves/<wave>/quest/*.png, DESIGN §12). */
const QUEST_SPRITE_WAVES = new Set(["wave-01"]);

/** The day's route: an item plus which completion in order closes that stop. */
const ROUTE = [
  { key: "stretch", occurrence: 1, label: "растяжка" },
  { key: "podcasts", occurrence: 1, label: "подкаст" },
  { key: "office", occurrence: 1, label: "офис" },
  { key: "reading", occurrence: 1, label: "чтение" },
  { key: "podcasts", occurrence: 2, label: "подкаст" },
  { key: "reading", occurrence: 2, label: "чтение" },
  { key: "journal", occurrence: 1, label: "дневник" },
] as const;

/** Stop centres (S1..S7) in viewBox coordinates. */
const STOPS_XY: ReadonlyArray<readonly [number, number]> = [
  [45, 45],
  [140, 45],
  [235, 45],
  [330, 45],
  [300, 160],
  [190, 160],
  [75, 160],
];

/** Trail segments between stops, plus the position and rotation of the chevron at the midpoint.
 *  Arrows sit on the EXACT midpoint (t=0.5 of the quadratic Bézier) with the angle taken from the
 *  tangent (P2−P0): eyeballed ax/ay/deg drift off the curve, worst in the bottom row. */
const SEGMENTS = [
  { d: "M60 45 Q92 37 125 45", ax: 92, ay: 41, deg: 0 },
  { d: "M155 45 Q187 53 220 45", ax: 187, ay: 49, deg: 0 },
  { d: "M250 45 Q282 37 315 45", ax: 282, ay: 41, deg: 0 },
  { d: "M344 53 Q382 78 372 115 Q364 143 318 154", ax: 372, ay: 115, deg: 105 },
  { d: "M285 160 Q245 168 205 160", ax: 245, ay: 164, deg: 180 },
  { d: "M175 160 Q132 152 90 160", ax: 132, ay: 156, deg: 180 },
] as const;

/** Monster lens: on the route it is a single dead-end stop, so `occurrence` is always 1. Its mark
 *  in the calendar has inverted polarity — CLEAN days are highlighted; see `lensMatch`. */
const MONSTER_LENS: DisciplineLens = { key: MONSTER_LENS_KEY, occurrence: 1, label: "монстр" };

/** The "clean" wording, used as the caption of the monster's streak flame (it always counts days
 *  WITHOUT the monster). */
const CLEAN_PHRASE = monsterVerdict(false).phrase;

/**
 * The monster figure's class by verdict tone. "No data" deliberately takes `--pending`, the same
 * grey dash as any unclosed stop: a day nothing arrived for must look UNFILLED rather than clean.
 * It needs no look of its own — "like every other picture" is the answer here.
 */
const MONSTER_STOP_CLASS: Record<MonsterTone, string> = {
  clean: "quest-stop--clean",
  drunk: "quest-stop--drunk",
  unknown: "quest-stop--pending",
};

/**
 * The monster sits APART from the route, in the empty band between its rows (a detour path was
 * considered and rejected, DESIGN §4.1). It is left of centre because the book cover peeks out
 * right of the lower reading stop, and its streak flame must clear the podcast minutes above.
 */
const MONSTER_XY = [86, 100] as const;

/** The streak badge shows from 2: a run of one day, or zero, is noise on the map, not achievement. */
const STREAK_MIN = 2;
/** Streak flame — a compact ~12px vector, the same for items and for the monster (DESIGN §4.1). */
const FLAME_D = "M0 -6 C3 -2 3 0 2 2 C1 4 -1 4 -2 2 C-3 0 -2 -2 -1 -3 C-1 -1 1 -2 0 -6 Z";

// Decorative rocks along the trail (sprite-set waves only). Positions sit in empty parts of the
// viewBox, away from stops and captions, with a slight variation in size.
const ROCKS: ReadonlyArray<{ x: number; y: number; s: number }> = [
  { x: 60, y: 118, s: 13 },
  { x: 258, y: 104, s: 9 },
  { x: 360, y: 104, s: 12 },
  { x: 356, y: 168, s: 10 },
  { x: 128, y: 194, s: 11 },
  { x: 22, y: 66, s: 8 },
];

type Cell = readonly [number, number];

function rect(x1: number, x2: number, y1: number, y2: number, skip: Cell[] = []): Cell[] {
  const out: Cell[] = [];
  for (let y = y1; y <= y2; y++)
    for (let x = x1; x <= x2; x++)
      if (!skip.some(([sx, sy]) => sx === x && sy === y)) out.push([x, y]);
  return out;
}

/** Pixel icons for the stops: cells of an 8×8 grid, rendered as rects (DESIGN §2.4 — decor). */
const ICONS: Record<string, Cell[]> = {
  stretch: [
    [3, 0], [4, 0], [1, 1], [6, 1], [2, 2], [3, 2], [4, 2], [5, 2],
    [3, 3], [4, 3], [3, 4], [4, 4], [2, 5], [5, 5], [2, 6], [5, 6],
  ],
  podcasts: [
    [3, 0], [4, 0], [2, 1], [5, 1], [1, 2], [6, 2], [1, 3], [6, 3],
    [0, 4], [1, 4], [6, 4], [7, 4], [0, 5], [1, 5], [6, 5], [7, 5],
  ],
  office: rect(1, 6, 1, 6, [[2, 2], [5, 2], [2, 4], [5, 4], [3, 6], [4, 6]]),
  reading: [
    [3, 1], [4, 1],
    ...rect(1, 6, 2, 2), ...rect(0, 7, 3, 4),
    [0, 5], [1, 5], [6, 5], [7, 5],
  ],
  journal: [...rect(1, 5, 1, 6, [[2, 3], [3, 3], [4, 3]]), [6, 2], [7, 1]],
  monster: [[3, 0], [4, 0], ...rect(2, 5, 1, 7, [[3, 3], [4, 4], [3, 5]])],
  flag: [...rect(0, 0, 0, 6), ...rect(1, 3, 0, 1), [1, 2], [2, 2]],
  sun: [
    ...rect(2, 5, 2, 5),
    [3, 0], [4, 0], [0, 3], [0, 4], [7, 3], [7, 4], [3, 7], [4, 7],
    [1, 1], [6, 1], [1, 6], [6, 6],
  ],
  moon: [
    [3, 0], [4, 0], [5, 0], [2, 1], [3, 1], [1, 2], [2, 2], [1, 3], [2, 3],
    [1, 4], [2, 4], [2, 5], [3, 5], [3, 6], [4, 6], [5, 6],
  ],
  star: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]], // a 3×3 grid
};

/** Stop cloud stand (wave-02 skin decor): a body plus a lower shadow face, on a 14×6 grid. */
const CLOUD_BODY: Cell[] = [
  ...rect(5, 8, 0, 0), ...rect(3, 10, 1, 1), ...rect(2, 11, 2, 2),
  ...rect(1, 12, 3, 3), ...rect(1, 12, 4, 4),
];
const CLOUD_SHADE: Cell[] = rect(2, 11, 5, 5);

function PixelIcon({
  cells, cell, cx, cy, gridW = 8, gridH = 8,
}: { cells: Cell[]; cell: number; cx: number; cy: number; gridW?: number; gridH?: number }) {
  // the gridW×gridH grid is centred on (cx, cy)
  const offX = (gridW / 2) * cell;
  const offY = (gridH / 2) * cell;
  return (
    <g aria-hidden>
      {cells.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={cx - offX + x * cell}
          y={cy - offY + y * cell}
          width={cell}
          height={cell}
          fill="currentColor"
        />
      ))}
    </g>
  );
}

/** Decor layers switched on by a wave's skin; hidden by default in CSS (see common.css). */
function Cloud({ cx, cy, cell }: { cx: number; cy: number; cell: number }) {
  return (
    <g className="quest-cloud" aria-hidden>
      <g className="quest-cloud__body">
        <PixelIcon cells={CLOUD_BODY} cell={cell} cx={cx} cy={cy} gridW={14} gridH={6} />
      </g>
      <g className="quest-cloud__shade">
        <PixelIcon cells={CLOUD_SHADE} cell={cell} cx={cx} cy={cy} gridW={14} gridH={6} />
      </g>
    </g>
  );
}

/** Chevron on a segment, drawn by hand because markers with context-stroke are not alive
 *  everywhere. In sprite mode it is a heavy FILLED head to match the set's pixel style, otherwise
 *  a thin stroked `>`. Being a vector, it rotates cleanly to any segment angle. */
function Chevron({ ax, ay, deg, sprite }: { ax: number; ay: number; deg: number; sprite?: boolean }) {
  const tf = `translate(${ax} ${ay}) rotate(${deg})`;
  return sprite ? (
    <path className="quest-chevron quest-chevron--bold" d="M-4 -5 L5 0 L-4 5 L-1 0 Z" transform={tf} />
  ) : (
    <path className="quest-chevron" d="M-4 -3.5 L3 0 L-4 3.5" transform={tf} />
  );
}

/** Raster stop sprite for a wave with its own set: a generated pixel icon centred on (cx, cy). The
 *  sprite is CONSTANT — state (done/missed/pending) is carried by the ring and the arrows, not by
 *  the icon itself (DESIGN §12.1). `preserveAspectRatio` keeps the sprite's proportions. */
function Sprite({
  wave, name, cx, cy, size,
}: { wave: string; name: string; cx: number; cy: number; size: number }) {
  return (
    <image
      href={`/assets/waves/${wave}/quest/${name}.png`}
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}

/** Russian plural form for a day count: one, few (2-4) or many (5+), with 11-14 taking many. */
function pluralDays(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return "дней";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дней";
}

/**
 * The streak badge above a stop: a flame counting consecutive days the item is DONE, or for the
 * monster, days it is NOT drunk. The tooltip is drawn by US as a mini tile in the wave's style,
 * not a system `<title>`; its width is computed from the string, as SVG cannot auto-size. §5.6
 */
function StreakBadge({
  cx, cy, value, testId, title, tone = "fire",
}: {
  cx: number; cy: number; value: number; testId: string; title: string;
  /** Flame colour: `fire` is the wave's accent (route items), `clean` the green "clean" (monster).
   *  The monster's flame counts the INVERSE — days without it — and burns in the same colour as the
   *  verdict under its stop, since the accent would read as "did this N days running". */
  tone?: "fire" | "clean";
}) {
  if (value < STREAK_MIN) return null;
  const tipW = title.length * 4.2 + 12;
  const tipH = 14;
  // Horizontal shift keeping the tooltip's ground entirely inside the viewBox [0,400].
  const half = tipW / 2;
  let tipDX = 0;
  if (cx + half > 396) tipDX = 396 - (cx + half);
  if (cx - half + tipDX < 4) tipDX = 4 - (cx - half);
  return (
    <g
      className={`quest-streak quest-streak--${tone}`}
      transform={`translate(${cx} ${cy})`}
      data-testid={testId}
      role="img"
      aria-label={title}
    >
      {/* an invisible pad widens the hover area (the icons are small) */}
      <rect className="quest-streak__hit" x={-6} y={-8} width={20} height={16} fill="transparent" />
      <path className="quest-streak__glyph" d={FLAME_D} aria-hidden />
      <text className="quest-streak__num" x={6} y={0} aria-hidden>
        {value}
      </text>
      {/* the wave's mini-tile tooltip (appears on hover, see common.css) */}
      <g className="quest-tip" transform={`translate(${tipDX} -9)`} aria-hidden>
        <rect className="quest-tip__box" x={-half} y={-tipH} width={tipW} height={tipH} rx={1.5} />
        <text className="quest-tip__text" x={0} y={-tipH / 2 - 0.5}>
          {title}
        </text>
      </g>
    </g>
  );
}

/** Key of the item whose stops raise cards of what was listened to (PRD §5.6). */
const PODCAST_KEY = "podcasts";

// Card geometry in viewBox units (400×210), like the rest of the map.
const CARD_W = 214;
const CARD_H = 54;
/**
 * Height of a card carrying two time lines, exactly one `--fs-music-meta` line taller. The height
 * MUST be fixed because the card lives in a `foreignObject`: SVG reserves the window in advance,
 * never grows to content, and clips the excess.
 */
const CARD_H_SPLIT = 68;
const CARD_COVER = 40;
/** How far the card's edge runs under the hit pad (r=22), so hover does not break off. */
const CARD_LIFT = 20;
/** Margin to the viewBox edge: closer than this counts as the card not fitting. */
const VIEWBOX_MARGIN = 2;
/** Gap between the card and the preview it stands above. */
const CARD_GAP = 3;

/** Side of the episode cover preview, in viewBox units: ~26 CSS pixels at mobile width. */
const PREVIEW_SIZE = 30;
/** How close the preview's bottom-right corner comes to the disc's CENTRE (r=17): the smaller, the
 *  deeper the picture runs under the stop icon. At 6 the corner is hidden by more than half the
 *  radius, so the picture clearly lies UNDER the stop rather than beside it. */
const PREVIEW_TUCK = 6;

/**
 * Delay before the card closes. A pointer moving from the preview to the card leaves one
 * (pointerleave) before entering the other (mouseenter), sometimes crossing bare map between them.
 * Without the pause the card would go out halfway to its own links.
 */
const CLOSE_DELAY_MS = 140;

/** Top-left corner of the preview at the stop in (cx, cy). */
function previewXY(cx: number, cy: number): [number, number] {
  return [cx - PREVIEW_TUCK - PREVIEW_SIZE, cy - PREVIEW_TUCK - PREVIEW_SIZE];
}

/** Key of the reading item: its stops carry book covers (PRD §5.16). */
const READING_KEY = "reading";

/**
 * A book preview is portrait: a book cover is not a podcast square, and forcing it into one would
 * either crush the spine or cut half the title away.
 */
const BOOK_PREVIEW_W = 22;
const BOOK_PREVIEW_H = 33;

/** The cover inside a book card — the same proportion, larger. */
const BOOK_CARD_COVER_W = 30;
const BOOK_CARD_COVER_H = 45;
/**
 * Height of the book card, held by the cover rather than the text. The number MUST cover the
 * content whole — a `foreignObject` reserves its window in advance and silently clips the bottom
 * line. The border counts too: 57 of content needs 59 of window (measured at 58 it overflowed).
 */
const BOOK_CARD_H = 60;

/**
 * Top-left corner of the book cover preview. The two reading stops use OPPOSITE sides: they sit in
 * different rows of the route, and two pictures on the same side would read as one column
 * detached from its circles.
 */
function bookPreviewXY(cx: number, cy: number, side: "left" | "right"): [number, number] {
  const x = side === "left" ? cx - PREVIEW_TUCK - BOOK_PREVIEW_W : cx + PREVIEW_TUCK;
  return [x, cy - PREVIEW_TUCK - BOOK_PREVIEW_H];
}

/** Preview side by stop number: the first goes left, the second and later go right. */
const bookSide = (occurrence: number): "left" | "right" => (occurrence === 1 ? "left" : "right");

/** Padding and gap of a book card, the same as in its CSS; the width is estimated from them. */
const BOOK_CARD_PAD = 6;
const BOOK_CARD_GAP = 6;
/** Slack added to the width estimate: a couple of spare units is cheaper than a truncated line. */
const BOOK_CARD_SLACK = 4;
/** The card shrinks no further: below this a short title stops reading as a card at all. */
const BOOK_CARD_MIN_W = 104;
/**
 * Label of the retell button, and also a multiplier for the progress line's width (PRD §5.16). The
 * brackets are load-bearing: beside the percentages a bare word reads as a continuation of the
 * data, while brackets say at once that this is a caption to an action.
 */
const RETELL_LABEL = "(пересказ)";

/**
 * Offset of the streak badge from the stop's centre. To the right it equals the gap at the disc; to
 * the left it is larger, because the badge draws FROM its point rightwards (flame at zero, number
 * after it), so a mirrored position must back off by its own width or the number lands on the disc.
 */
const STREAK_DX = 18;
const STREAK_DX_LEFT = 32;

/**
 * Width of the book card, BY CONTENT rather than fixed: a podcast title is nearly always long, but
 * "Dune" would leave two thirds empty, and a band of blank reads as a half-loaded widget. Width is
 * ESTIMATED, not measured — a `foreignObject` reserves its window before anything can be measured.
 */
function bookCardWidth(book: ReadingBookView): number {
  // Fraction of the font size per character, MEASURED on the board rather than guessed: the mono
  // face gave 0.60-0.71 em. We take the top of that range, since underestimating costs an ellipsis
  // while overestimating costs only the blank space we are trying to avoid. One face, one figure.
  const mono = 0.7;
  const titleW = book.title.length * 11 * mono;
  const authorW = (book.author?.length ?? 0) * 8.5 * mono;
  // The progress line is the caption, the percentages and, when there is something to tell, the
  // retell button: all of it is counted, or the line drifts into an ellipsis.
  const progressChars = progressLabel(book) === null
    ? 0
    : PROGRESS_CAPTION.length + 1 + progressLabel(book)!.length +
      (book.hasSummary && book.sessionId != null ? RETELL_LABEL.length + 2 : 0);
  const progressW = progressChars * 8.5 * mono;

  const text = Math.max(titleW, authorW, progressW) + BOOK_CARD_SLACK;
  const total = BOOK_CARD_PAD * 2 + BOOK_CARD_COVER_W + BOOK_CARD_GAP + text;
  return Math.round(Math.min(CARD_W, Math.max(BOOK_CARD_MIN_W, total)));
}

/**
 * Whether this is a mouse pointer; touch and pen name themselves honestly, and a missing type
 * counts as mouse. The split MUST be on pointer events: a tap then sends EMULATED mouse events,
 * and the hover branch would fire on those and close the card the tap had just opened.
 */
const isMouse = (e: { pointerType?: string }) => e.pointerType !== "touch" && e.pointerType !== "pen";

/**
 * Card type sizes in viewBox units. The usual `--fs-music-*` are set in `cqw` and tuned for a tile
 * in CSS pixels; inside a `foreignObject` the unit differs and text would arrive double-scaled.
 * They are picked so three lines plus padding fill the card's height rather than leaving a band.
 */
const CARD_TYPE_SCALE = {
  "--fs-music-title": "11px",
  "--fs-music-artists": "9px",
  "--fs-music-meta": "8.5px",
} as CSSProperties;

/**
 * The episode cover peeking out at a podcast stop, top-left of the disc with its corner tucked
 * UNDER it: the overlap ties picture to stop and gives the flat route depth — hence it is drawn
 * BEFORE the stop, as SVG has no z-index. It is also the card's only handle. DESIGN §4.1
 */
function EpisodePreview({
  cx,
  cy,
  episode,
  occurrence,
  onHover,
  onTap,
}: {
  cx: number;
  cy: number;
  episode: PodcastEpisodeView;
  occurrence: number;
  onHover: () => void;
  onTap: () => void;
}) {
  const [x, y] = previewXY(cx, cy);
  return (
    <g
      className="quest-preview"
      data-testid={`quest-preview-${PODCAST_KEY}-${occurrence}`}
      onPointerEnter={(e) => isMouse(e) && onHover()}
      onPointerDown={(e) => !isMouse(e) && onTap()}
      aria-hidden
    >
      <foreignObject x={x} y={y} width={PREVIEW_SIZE} height={PREVIEW_SIZE}>
        <div className="quest-preview__box">
          <Cover
            url={episode.imageUrl}
            alt=""
            size={PREVIEW_SIZE}
            fallback={<CoverPlate seed={episode.episodeUrl ?? episode.episodeName} size={PREVIEW_SIZE} />}
          />
        </div>
      </foreignObject>
    </g>
  );
}

/**
 * The listened-episode card at a podcast stop. It CATCHES events, since it holds live links the
 * pointer must reach, and renders as a SIBLING of the stop button, because a link inside a
 * `role="button"` is nested interactivity. Inside is the very same [NowPlayingCard]. §5.6
 */
function PodcastCard({
  cx,
  cy,
  episode,
  occurrence,
  open,
  onOpen,
  onClose,
  onRetell,
}: {
  cx: number;
  cy: number;
  episode: PodcastEpisodeView;
  occurrence: number;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onRetell: () => void;
}) {
  const half = CARD_W / 2;
  // Shift keeping the card entirely inside the viewBox [0,400] — as with the streak tooltip.
  let dx = 0;
  if (cx + half > 396) dx = 396 - (cx + half);
  if (cx - half < 4) dx = 4 - (cx - half);

  // Footer: the covered slice of the episode always, the minute total above it only when that
  // slice is known. Unknown, and the footer collapses to one line. The `foreignObject` window and
  // the point the card rises from both depend on this.
  const stretch = stretchLabel(episode);
  const listened = listenedLabel(episode);
  // The button exists only once the retelling is ALREADY built (PRD §5.16.1). It needs no line of
  // its own: it stands in the chunk line, as it does in a book's percentage line.
  const canRetell = episode.hasSummary === true && episode.sessionId != null;
  const height = stretch === null ? CARD_H : CARD_H_SPLIT;

  // Above the PREVIEW, not merely above the stop, or the card would cover its own handle. If it
  // does not fit above it drops below: the route's top row has no room, and the card spilled past
  // the viewBox to be clipped by the map's edge. Same move as the day tooltip, same reason.
  const above = cy - PREVIEW_TUCK - PREVIEW_SIZE - CARD_GAP - height;
  const top = above >= VIEWBOX_MARGIN ? above : cy + CARD_LIFT;

  return (
    <g
      className={`quest-card${open ? " quest-card--open" : ""}`}
      data-testid="quest-card"
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
    >
      <foreignObject x={cx + dx - half} y={top} width={CARD_W} height={height}>
        <div className="quest-card__box" style={CARD_TYPE_SCALE}>
          <NowPlayingCard
            track={trackOf(episode)}
            coverSize={CARD_COVER}
            /* No cover, or it has not arrived: the Spotify plate stands in its place, the same one
               as in the music tile — the episode came from there and shares its fallback. The cover
               preview carries the same `fallback`, the picture being one and the same. */
            coverFallback={<CoverPlate seed={episode.episodeUrl ?? episode.episodeName} size={CARD_COVER} />}
          >
            {/* The sitting's total minutes, quieter than the chunk: it answers "how much in all"
                so nothing has to be subtracted in the head. It stands here rather than a line
                below because the podcast card has a fixed width and the pair would not fit. */}
            {stretch !== null && (
              <div className="quest-card__sum">
                <span className="quest-card__progress-caption">{LISTENED_CAPTION} </span>
                {listened}
              </div>
            )}
            {/* The covered chunk of an episode uses THE SAME classes as a book's percentages: one
                question must be set in one way. The button sits here too, on the right. */}
            <div className="quest-card__progress">
              {stretch === null && <span className="quest-card__progress-caption">{LISTENED_CAPTION} </span>}
              <span className="quest-card__progress-value">{stretch ?? listened}</span>
              {canRetell && (
                <button
                  type="button"
                  className="quest-card__retell"
                  data-testid={`quest-episode-retell-${occurrence}`}
                  onClick={(e) => {
                    // The card lives inside the stop that switches the lens, so without stopping
                    // propagation a click on the button would also move the calendar to another item.
                    e.stopPropagation();
                    onRetell();
                  }}
                >
                  {RETELL_LABEL}
                </button>
              )}
            </div>
          </NowPlayingCard>
        </div>
      </foreignObject>
    </g>
  );
}

/**
 * The book cover peeking out from under a reading stop — the same device as the podcasts', and for
 * the same reason: the stop answers "what were you reading" without waiting for hover. Two
 * differences come from the object: a portrait ratio, and a side that depends on the stop. §5.16
 */
function BookPreview({
  cx,
  cy,
  book,
  occurrence,
  onHover,
  onTap,
}: {
  cx: number;
  cy: number;
  book: ReadingBookView;
  occurrence: number;
  onHover: () => void;
  onTap: () => void;
}) {
  const [x, y] = bookPreviewXY(cx, cy, bookSide(occurrence));
  return (
    <g
      className="quest-preview"
      data-testid={`quest-preview-${READING_KEY}-${occurrence}`}
      onPointerEnter={(e) => isMouse(e) && onHover()}
      onPointerDown={(e) => !isMouse(e) && onTap()}
      aria-hidden
    >
      <foreignObject x={x} y={y} width={BOOK_PREVIEW_W} height={BOOK_PREVIEW_H}>
        <div className="quest-preview__box">
          <Cover url={book.coverUrl} alt="" size={BOOK_PREVIEW_W} height={BOOK_PREVIEW_H} />
        </div>
      </foreignObject>
    </g>
  );
}

/**
 * The reading card at a reading stop: cover, book and author, the passage covered and when. It
 * holds no links — the book sits on the owner's shelf — yet it still listens for events, or it
 * would die the moment the pointer moved off the preview onto the card itself. PRD §5.16
 */
function BookCard({
  cx,
  cy,
  book,
  occurrence,
  open,
  onOpen,
  onClose,
  onRetell,
}: {
  cx: number;
  cy: number;
  book: ReadingBookView;
  occurrence: number;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** Open the window with the chunk's retelling (PRD §5.16). */
  onRetell: () => void;
}) {
  const width = bookCardWidth(book);
  const half = width / 2;
  let dx = 0;
  if (cx + half > 396) dx = 396 - (cx + half);
  if (cx - half < 4) dx = 4 - (cx - half);

  // Above its own preview rather than above the stop: otherwise the card would cover its own handle.
  const above = cy - PREVIEW_TUCK - BOOK_PREVIEW_H - CARD_GAP - BOOK_CARD_H;
  const top = above >= VIEWBOX_MARGIN ? above : cy + CARD_LIFT;
  const progress = progressLabel(book);

  return (
    <g
      className={`quest-card${open ? " quest-card--open" : ""}`}
      data-testid="quest-card"
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
    >
      <foreignObject x={cx + dx - half} y={top} width={width} height={BOOK_CARD_H}>
        <div className="quest-card__box quest-card__box--book" style={CARD_TYPE_SCALE}>
          <Cover
            url={book.coverUrl}
            alt=""
            size={BOOK_CARD_COVER_W}
            height={BOOK_CARD_COVER_H}
          />
          <div className="quest-book__text">
            {/* The title is the only line the width estimate may fall short on (long headings with
                a subtitle). If it does not fit it scrolls, by the same mechanism as the podcast's,
                rather than being cut with an ellipsis. */}
            <Marquee>
              <div className="quest-book__title" data-testid={`quest-book-title-${occurrence}`}>
                {book.title}
              </div>
            </Marquee>
            {book.author && <div className="quest-book__author">{book.author}</div>}
            {progress && (
              <div className="quest-card__progress">
                <span className="quest-card__progress-caption">{PROGRESS_CAPTION} </span>
                <span className="quest-card__progress-value">{progress}</span>
                {/* The button exists only once the retelling is ALREADY built: it is computed in
                    the background from the book's text, and promising a window with nothing to
                    show is pointless (§5.16). */}
                {book.hasSummary && book.sessionId != null && (
                  <button
                    type="button"
                    className="quest-card__retell"
                    data-testid={`quest-book-retell-${occurrence}`}
                    onClick={(e) => {
                      // The card lives inside the stop that switches the lens, so without stopping
                      // propagation a click would also move the calendar to another item.
                      e.stopPropagation();
                      onRetell();
                    }}
                  >
                    {RETELL_LABEL}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

/**
 * An episode shaped into the player card's form: the "artist" is the show with its own link, the
 * episode cover takes the album cover's place, and there is no album, so the widget omits that
 * line. The backend does the same coercion for the now-playing tile, on live data.
 */
function trackOf(episode: PodcastEpisodeView): TrackView {
  return {
    title: episode.episodeName,
    url: episode.episodeUrl,
    artists: [{ name: episode.showName, url: episode.showUrl }],
    album: null,
    albumImageUrl: episode.imageUrl,
    durationMs: null,
  };
}

export function QuestMap({
  items,
  monsterDrunk,
  monsterCleanStreak = 0,
  wave,
  lens = null,
  onLensChange,
}: QuestMapProps) {
  // A wave with its own sprite set gets raster icons; otherwise hand-drawn pixel cells.
  const spriteWave = wave && QUEST_SPRITE_WAVES.has(wave) ? wave : null;
  const interactive = onLensChange != null;
  // The monster's verdict is one for the whole map: caption, verb colour, state class and wording.
  const monster = monsterVerdict(monsterDrunk);

  /**
   * Props of a stop button. Clicking the selected one clears the lens, which is the only way to
   * switch it off on the map itself. [ariaName] replaces the spoken label for the monster: a
   * button's `aria-label` OVERRIDES the text inside, so the verdict would never be read out.
   */
  const stopProps = (candidate: DisciplineLens, ariaName: string = candidate.label) => {
    if (!interactive) return {};
    const focused = sameLens(lens, candidate);
    const toggle = () => onLensChange(focused ? null : candidate);
    return {
      role: "button",
      tabIndex: 0,
      "aria-pressed": focused,
      "aria-label": `${ariaName}: показать в календаре`,
      onClick: toggle,
      onKeyDown: (e: KeyboardEvent<SVGGElement>) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault(); // space would otherwise scroll the page
        toggle();
      },
    };
  };
  /**
   * Which podcast card is open. Held in state rather than through an ancestor's CSS `:hover`: the
   * cards are drawn in a SEPARATE layer at the very end of the SVG (see below), so they live outside
   * their stop's subtree and a descendant selector cannot reach them.
   */
  const [openCard, setOpenCard] = useState<string | null>(null);
  /**
   * The sitting whose summary is open in the window — a book or an episode, as they share one
   * window. The card itself is held rather than its key: the window shows title, author and
   * percentages before any text arrives, and the card already has all of it. PRD §5.16.1
   */
  const [retold, setRetold] = useState<SummarySubject | null>(null);
  const closeTimer = useRef<number | null>(null);
  /** Mirror of [openCard] for the handlers: the tap toggle and the document listener read state
   *  from closures created once. */
  const openRef = useRef<string | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current === null) return;
    clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const open = useCallback((key: string) => {
    cancelClose();
    openRef.current = key;
    setOpenCard(key);
  }, [cancelClose]);

  const closeNow = useCallback(() => {
    cancelClose();
    openRef.current = null;
    setOpenCard(null);
  }, [cancelClose]);

  /** Closing delayed by [CLOSE_DELAY_MS] — see the note at the constant. */
  const close = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(closeNow, CLOSE_DELAY_MS);
  }, [cancelClose, closeNow]);

  /** Touch: a tap on the preview shows the card, a second tap hides it (a finger has no hover). */
  const toggle = useCallback((key: string) => {
    if (openRef.current === key) closeNow();
    else open(key);
  }, [closeNow, open]);

  /**
   * Tap outside to close. On a touch device there is no pointer to lead away, and without this an
   * open card would hang over the map for good. The listener runs on the capture phase and skips
   * taps on the card itself (it holds live links) and on the preview (it has its own toggle).
   */
  useEffect(() => {
    if (openCard === null) return;
    const onDown = (e: Event) => {
      const target = e.target as Element | null;
      if (typeof target?.closest !== "function") return;
      if (target.closest(".quest-card--open") || target.closest(".quest-preview")) return;
      closeNow();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [openCard, closeNow]);

  useEffect(() => () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
  }, []);

  const byKey = new Map(items.map((i) => [i.key, i]));
  const done = ROUTE.map((s) => (byKey.get(s.key)?.count ?? 0) >= s.occurrence);
  // Cards are gathered in advance: they are drawn as the last layer, apart from their stops.
  const podcastCards = ROUTE.flatMap((s, i) => {
    if (s.key !== PODCAST_KEY) return [];
    const episode = episodeForStop(byKey.get(s.key)?.episodes, s.occurrence);
    if (!episode) return [];
    const [cx, cy] = STOPS_XY[i];
    return [{ key: `${s.key}-${s.occurrence}`, cx, cy, episode, occurrence: s.occurrence }];
  });
  const readingCards = ROUTE.flatMap((s, i) => {
    if (s.key !== READING_KEY) return [];
    const book = bookForStop(byKey.get(s.key)?.books, s.occurrence);
    if (!book) return [];
    const [cx, cy] = STOPS_XY[i];
    return [{ key: `${s.key}-${s.occurrence}`, cx, cy, book, occurrence: s.occurrence }];
  });

  const doneCount = done.filter(Boolean).length;
  const perfect = doneCount === ROUTE.length;
  // "Missed" = not done while the day has already moved past it (a later stop is closed). Two states
  // remain, done (solid coral ring) and not done (grey dash); red "missed" was dropped, because with
  // one entry a day it is indistinguishable from "not reached yet".
  const stopClass = (i: number) =>
    done[i] ? "quest-stop--done" : "quest-stop--pending";
  const segClass = (i: number) =>
    done[i] ? "quest-seg--done" : "quest-seg--pending";

  // Progress fraction of an item, for skins that show counters under the captions: `target` from the
  // data, falling back to how many stops the item occupies on the route.
  const fracOf = (key: string) => {
    const it = byKey.get(key);
    const target = it?.target ?? ROUTE.filter((r) => r.key === key).length;
    return `${it?.count ?? 0}/${target}`;
  };

  /**
   * An item's measured minutes take THE SAME line as the fraction and displace it; there is
   * deliberately no third line. They show on EVERY wave, being data rather than skin decoration,
   * and only at an item's first stop, because the measurement belongs to the day. PRD §5.6
   */
  const minutesOf = (key: string, occurrence: number) => {
    // With a card present, the measurement belongs to the EPISODE and its minutes stand under the
    // stop. Otherwise the caption would argue with the tooltip right above it — "30 of 128 min" in
    // the card against a daily total of "62 min" below the circle.
    const episode = episodeForStop(byKey.get(key)?.episodes, occurrence);
    if (episode) return `${episode.listenedMinutes} мин`;
    // Reading works the same way: under the circle stand the minutes of ITS session, not a daily sum.
    const book = bookForStop(byKey.get(key)?.books, occurrence);
    if (book) return `${book.readMinutes} мин`;
    // The journal (and podcasts that gathered no card) is a measurement of the day, shown only at the
    // first stop: "6 min" under an unclosed circle answers "why did it not count".
    if (occurrence !== 1) return null;
    const measured = byKey.get(key)?.measuredMinutes;
    return typeof measured === "number" ? `${measured} мин` : null;
  };

  return (
    <>
    <svg
      viewBox="0 0 400 210"
      className={`quest-map${perfect ? " quest-map--perfect" : ""}${spriteWave ? " quest-map--sprites" : ""}`}
      role="img"
      // The monster is ALWAYS named, clean days included: silence about a clean day was
      // indistinguishable from "no data", the same fault as the mute "monster" caption in the picture.
      aria-label={`Дисциплина: ${doneCount} из ${ROUTE.length}, ${monster.phrase}`}
      data-testid="quest-map"
    >
      {/* route start and finish: raster sprites (a wave with its own set) or the skin's pixel flags */}
      {spriteWave ? (
        <>
          <Sprite wave={spriteWave} name="start" cx={20} cy={26} size={34} />
          <Sprite wave={spriteWave} name="finish" cx={30} cy={140} size={34} />
        </>
      ) : (
        <g className="quest-flag">
          <PixelIcon cells={ICONS.flag} cell={2.2} cx={18} cy={26} />
          <PixelIcon cells={ICONS.flag} cell={2.2} cx={32} cy={142} />
        </g>
      )}

      {/* the route's "morning → night" sky: a sun at the start, a moon and stars at the finish
          (a wave skin's decor; hidden in the base skin) */}
      <g className="quest-sky" aria-hidden>
        <g className="quest-sun">
          <PixelIcon cells={ICONS.sun} cell={2.4} cx={18} cy={22} />
        </g>
        <g className="quest-moon">
          <PixelIcon cells={ICONS.moon} cell={2.4} cx={30} cy={136} />
        </g>
        <g className="quest-star">
          <PixelIcon cells={ICONS.star} cell={2} cx={15} cy={122} gridW={3} gridH={3} />
        </g>
        <g className="quest-star">
          <PixelIcon cells={ICONS.star} cell={1.6} cx={46} cy={152} gridW={3} gridH={3} />
        </g>
      </g>

      {/* decorative stones along the trail (a wave with a sprite set) */}
      {spriteWave && (
        <g className="quest-rocks" aria-hidden>
          {ROCKS.map((r) => (
            <image
              key={`${r.x}-${r.y}`}
              href={`/assets/waves/${spriteWave}/decor/rock.png`}
              x={r.x - r.s / 2}
              y={r.y - r.s / 2}
              width={r.s}
              height={r.s}
              preserveAspectRatio="xMidYMid meet"
            />
          ))}
        </g>
      )}

      {/* the trail */}
      {SEGMENTS.map((s, i) => (
        <g key={s.d} className={`quest-seg ${segClass(i)}`}>
          <path d={s.d} />
          <Chevron ax={s.ax} ay={s.ay} deg={s.deg} sprite={!!spriteWave} />
        </g>
      ))}
      {/* There is NO trail to the monster (considered and rejected, DESIGN §4.1): a branch would
          describe it as a stage of the day, and there is no way to colour it. The monster is a
          fact beside the route, so it stands as a separate figure in the empty band. */}

      {/* stops */}
      {ROUTE.map((s, i) => {
        const [cx, cy] = STOPS_XY[i];
        // The streak of this exact stop (occurrence): at a second occurrence (count≥2) it is ≤ the first.
        const streak = byKey.get(s.key)?.occurrenceStreaks?.[s.occurrence - 1] ?? 0;
        const candidate: DisciplineLens = { key: s.key, occurrence: s.occurrence, label: s.label };
        const focused = sameLens(lens, candidate);
        // A card exists only for podcasts, and only while there are enough episodes for this stop.
        const episode = s.key === PODCAST_KEY
          ? episodeForStop(byKey.get(s.key)?.episodes, s.occurrence)
          : null;
        // The same for reading: a card exists while there are enough sessions for this stop (PRD §5.16).
        const book = s.key === READING_KEY
          ? bookForStop(byKey.get(s.key)?.books, s.occurrence)
          : null;
        // Shared hover mechanics: the slot hides the card, the preview opens it.
        const hasCard = !!episode || !!book;
        const cardKey = `${s.key}-${s.occurrence}`;
        return (
          <g
            key={cardKey}
            className="quest-slot"
            // Closing hangs on the WHOLE slot while opening hangs only on the preview: the card
            // survives the pointer crossing the disc on its way to the links. The preview is
            // aria-hidden, so focusing the stop opens the card — otherwise a keyboard could not.
            onPointerLeave={hasCard ? (e) => isMouse(e) && close() : undefined}
            onFocus={hasCard ? () => open(cardKey) : undefined}
            onBlur={hasCard ? close : undefined}
          >
          {episode && (
            <EpisodePreview
              cx={cx}
              cy={cy}
              episode={episode}
              occurrence={s.occurrence}
              onHover={() => open(cardKey)}
              onTap={() => toggle(cardKey)}
            />
          )}
          {book && (
            <BookPreview
              cx={cx}
              cy={cy}
              book={book}
              occurrence={s.occurrence}
              onHover={() => open(cardKey)}
              onTap={() => toggle(cardKey)}
            />
          )}
          <g
            className={`quest-stop ${stopClass(i)}${interactive ? " quest-stop--interactive" : ""}${focused ? " quest-stop--focused" : ""}`}
            data-testid={`quest-stop-${s.key}-${s.occurrence}`}
            data-done={done[i]}
            data-focused={focused || undefined}
            {...stopProps(candidate)}
          >
            <Cloud cx={cx} cy={cy + 11} cell={2.6} />
            {/* The hit pad is wider than the drawing (a tap target) and doubles as the focus ring. */}
            {interactive && <circle className="quest-stop__hit" cx={cx} cy={cy} r={22} />}
            <circle cx={cx} cy={cy} r={17} />
            {spriteWave ? (
              <Sprite wave={spriteWave} name={s.key} cx={cx} cy={cy} size={26} />
            ) : (
              <PixelIcon cells={ICONS[s.key]} cell={2.4} cx={cx} cy={cy} />
            )}
            <text className="quest-label" x={cx} y={cy + 29}>
              {s.label}
            </text>
            {minutesOf(s.key, s.occurrence) ? (
              <text
                className="quest-minutes"
                x={cx}
                y={cy + 41}
                data-testid={`quest-minutes-${s.key}-${s.occurrence}`}
              >
                {minutesOf(s.key, s.occurrence)}
              </text>
            ) : (
              <text
                className="quest-frac"
                x={cx}
                y={cy + 41}
                data-testid={`quest-frac-${s.key}-${s.occurrence}`}
              >
                {fracOf(s.key)}
              </text>
            )}
            <StreakBadge
              // The flame sits top-right of the stop, exactly where the SECOND reading session's
              // cover appears, and the cover hid it. At such a stop the badge mirrors to the left:
              // the preview cannot move instead, as the two stops use opposite sides. §5.16
              cx={cx + (book && bookSide(s.occurrence) === "right" ? -STREAK_DX_LEFT : STREAK_DX)}
              cy={cy - 17}
              value={streak}
              testId={`quest-streak-${s.key}-${s.occurrence}`}
              title={`${s.label}: ${streak} ${pluralDays(streak)} подряд`}
            />
          </g>
          </g>
        );
      })}

      {/* The monster is a separate figure beside the route with its OWN pair of states
          (clean/drunk) rather than the route's done/pending: "done" fits neither way. While it
          shared states, a drunk monster closed the stop with an achievement ring. */}
      <g
        className={`quest-stop quest-stop--monster ${MONSTER_STOP_CLASS[monster.tone]}${interactive ? " quest-stop--interactive" : ""}${sameLens(lens, MONSTER_LENS) ? " quest-stop--focused" : ""}`}
        data-testid="quest-stop-monster"
        data-tone={monster.tone}
        data-done={monsterDrunk ?? false}
        data-focused={sameLens(lens, MONSTER_LENS) || undefined}
        {...stopProps(MONSTER_LENS, monster.phrase)}
      >
        <Cloud cx={MONSTER_XY[0]} cy={MONSTER_XY[1] + 10} cell={2.1} />
        {interactive && (
          <circle className="quest-stop__hit" cx={MONSTER_XY[0]} cy={MONSTER_XY[1]} r={20} />
        )}
        <circle cx={MONSTER_XY[0]} cy={MONSTER_XY[1]} r={15} />
        {spriteWave ? (
          <Sprite wave={spriteWave} name="monster" cx={MONSTER_XY[0]} cy={MONSTER_XY[1]} size={22} />
        ) : (
          <PixelIcon cells={ICONS.monster} cell={2.1} cx={MONSTER_XY[0]} cy={MONSTER_XY[1]} />
        )}
        {/* A verdict caption instead of the bare noun: the verb comes BEFORE the name and in its
            own colour — the same wording and pair of colours as the weekend scene (§4.2). The
            non-breaking space is needed because SVG collapses whitespace nodes between tspans. */}
        <text
          className="quest-label"
          x={MONSTER_XY[0]}
          y={MONSTER_XY[1] + 26}
          data-testid="quest-monster-verdict"
        >
          {monster.verb && (
            <tspan
              className="quest-monster-verb"
              data-testid="quest-monster-verb"
              style={{ fill: monster.color }}
            >
              {monster.verb}
            </tspan>
          )}
          {/* With no verdict the caption is just the noun, and the leading space would shift the
              line left of centre by its width. */}
          <tspan>{monster.verb ? " монстр" : "монстр"}</tspan>
        </text>
        <StreakBadge
          cx={MONSTER_XY[0] + 16}
          cy={MONSTER_XY[1] - 15}
          value={monsterCleanStreak}
          testId="quest-streak-monster"
          tone="clean"
          // The flame always counts CLEAN days, so its caption does not depend on today's verdict —
          // hence the "clean" wording rather than `monster.phrase`.
          title={`${CLEAN_PHRASE}: ${monsterCleanStreak} ${pluralDays(monsterCleanStreak)} подряд`}
        />
      </g>

      {/* There is no "N/7" total in the corner: the trail shows the count, and a number over the
          picture reads as a mark for the day. It stays in the map's `aria-label`, the only way a
          screen reader learns the progress. */}

      {/* Podcast cards are the map's LAST layer. SVG has no z-index, so whatever is drawn later
          is on top, and the monster used to cover a card inside its own stop. The cost is that
          opening moved into state: a CSS hover cannot reach across subtrees. */}
      {podcastCards.length > 0 && (
        <g className="quest-cards">
          {podcastCards.map((c) => (
            <PodcastCard
              key={c.key}
              cx={c.cx}
              cy={c.cy}
              episode={c.episode}
              occurrence={c.occurrence}
              open={openCard === c.key}
              onOpen={() => open(c.key)}
              onClose={close}
              onRetell={() => setRetold(episodeSubject(c.episode))}
            />
          ))}
        </g>
      )}
      {/* Book cards are the same last layer, for the same reason (§5.16). */}
      {readingCards.length > 0 && (
        <g className="quest-cards">
          {readingCards.map((c) => (
            <BookCard
              key={c.key}
              cx={c.cx}
              cy={c.cy}
              book={c.book}
              occurrence={c.occurrence}
              open={openCard === c.key}
              onOpen={() => open(c.key)}
              onClose={close}
              onRetell={() => setRetold(bookSubject(c.book))}
            />
          ))}
        </g>
      )}
      </svg>
      {/* The retelling window lives OUTSIDE the map: inside `svg` it would be cramped both by
          layout (a fullscreen modal) and by layers (SVG has no z-index). A portal into body is
          the same trick as the artifact lightbox's. */}
      {retold && typeof document !== "undefined" &&
        createPortal(
          <SummaryModal subject={retold} onClose={() => setRetold(null)} />,
          document.body,
        )}
    </>
  );
}
