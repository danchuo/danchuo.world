"use client";

import { useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { DayView } from "@/lib/api/types";
import {
  edgeCodeEms,
  onMonsterFigure,
  sheetCells,
  sheetHeadline,
  sheetMonsterCard,
  sheetSessions,
  type SheetCell,
  type SheetCellState,
  type SheetMonsterCard,
  type SheetSession,
} from "@/lib/daySheet";
import { Artifact3D } from "./Artifact3D";
import { dayActivities, type ActivityCard as Activity } from "@/lib/activities";
import { photoUrl } from "@/lib/api/media";
import type { DayPhotoView } from "@/lib/api/types";
import { photoFrame } from "@/lib/dayPhoto";
import { ActivityGlyph } from "./ActivityGlyph";
import { DayPhotoModal } from "./DayPhotoModal";
import { activityLens, MONSTER_LENS_KEY, PHOTO_LENS, type DisciplineLens } from "@/lib/disciplineLens";
import { Cover } from "./NowPlayingCard";
import { CoverPlate } from "./SpotifyMark";
import type { SummarySubject } from "@/lib/summarySubject";
import { SummaryModal } from "./SummaryModal";
import { useSidewaysWheel } from "./useSidewaysWheel";
import { isWeekend } from "@/lib/weekend";

/* The plate's own geometry only — the frame's real side comes from `--sheet-frame` in CSS, which
   scales the plate and its mark with the sheet. This sets the mark's proportion inside it. */
const SHEET_PLATE = 64;

interface TodaySheetProps {
  day: DayView;
  today: string;
  lens?: DisciplineLens | null;
  onLensChange?: (lens: DisciplineLens | null) => void;
  /** Try a socket's lens on by hovering it; `null` when the pointer leaves the socket. */
  onLensPreview?: (lens: DisciplineLens | null) => void;
}

/**
 * The day as a CONTACT SHEET (DESIGN §4.3): a row of frames over a fixed row of sockets. A sitting
 * is a frame filled by its cover and the monster closes that row as a frame of its own; every
 * discipline item keeps a socket below, in the same place every day.
 */
export function TodaySheet({ day, today, lens, onLensChange, onLensPreview }: TodaySheetProps) {
  const [retold, setRetold] = useState<SummarySubject | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  // The item whose ledge word is under the pointer or focus: its own frames light up above.
  const [lit, setLit] = useState<string | null>(null);
  const framesRef = useSidewaysWheel<HTMLDivElement>();
  const headline = sheetHeadline(day, today);
  const sessions = sheetSessions(day);
  const cells = sheetCells(day);
  const monster = sheetMonsterCard(day);
  const activities = dayActivities(day);
  // Every item is a weekday one: on a weekend the ledge could only print misses. PRD §5.6
  const rest = isWeekend(day.date);
  const photoWidth = day.photo ? photoFrame(day.photo.width, day.photo.height).width : 0;
  const squares = sessions.length + activities.length + 1;
  const row = {
    "--sheet-n": squares,
    "--sheet-photo": Number(photoWidth.toFixed(3)),
    "--sheet-gaps": squares - (day.photo ? 0 : 1),
  } as CSSProperties;

  /* The name is the only line in full voice and it owns the body's width alone, fitted to ONE
     line of that width: mono's (1/0.6)·94 worst case with a hair of slack. Its size is therefore
     data — the longer the day's name, the quieter it is set. DESIGN §4.3 */
  const voice = headline.title ?? headline.relative;
  const voiceSize = `clamp(11px, ${(153 / voice.length).toFixed(2)}cqw, 32px)`;

  // The socket names its lens and nothing more: whether that pins or unpins is the board's call,
  // which is also the only place that knows the PINNED lens rather than the one on screen.
  function pick(next: DisciplineLens) {
    onLensChange?.(next);
  }

  /* A try-on only makes sense under a mouse: a tap has no hover to leave, so on touch the click
     stays the whole mechanic (DESIGN §5.2). */
  function hover(next: DisciplineLens) {
    return {
      onPointerEnter: (e: PointerEvent<HTMLElement>) => {
        if (e.pointerType === "mouse") onLensPreview?.(next);
      },
    };
  }

  /* Leaving is asked of the ROW, not of a socket: sweeping the row the pointer leaves one socket
     and enters the next, and a drop in that gap would blink the whole field for a frame. Off the
     row the try-on dies at once — nobody is given seconds to walk it down to the calendar. */
  const leave = {
    onPointerLeave: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse") onLensPreview?.(null);
    },
  };

  return (
    <div className={rest ? "today-sheet is-rest" : "today-sheet"}>
      <div className="today-sheet__body">
        <p className="today-sheet__voice" style={{ fontSize: voiceSize }}>
          {voice}
        </p>

        {/* Sittings, activities, the photo and the monster closing the row, all on one baseline.
            The row's make-up fits the frame's side to the tile in CSS. DESIGN §4.3 */}
        <div className="today-sheet__frames" style={row} ref={framesRef}>
          {sessions.map((session) => (
            <Frame key={session.key} session={session} lit={lit === session.item} onOpen={setRetold} />
          ))}
          {activities.map((activity) => (
            <ActivityCard
              key={activity.key}
              activity={activity}
              active={lens?.key === activityLens(activity.key, activity.label).key}
              onPick={() => pick(activityLens(activity.key, activity.label))}
              onTry={(on) => onLensPreview?.(on ? activityLens(activity.key, activity.label) : null)}
            />
          ))}
          {day.photo && (
            <PhotoCard
              photo={day.photo}
              onOpen={() => setPhotoOpen(true)}
              onTry={(on) => onLensPreview?.(on ? PHOTO_LENS : null)}
            />
          )}
          <MonsterCard
            card={monster}
            active={lens?.key === MONSTER_LENS_KEY}
            onPick={() => pick(MONSTER_LENS)}
            onFigure={(on) => onLensPreview?.(on ? MONSTER_LENS : null)}
          />
        </div>

        {/* The ledge is the film's EDGE CODE: one line of the foot, ahead of the stamp, in the
            same order every day, so an item is found by place. DESIGN §4.3 */}
        <div
          className="today-sheet__foot"
          style={
            {
              "--code-em": Number(edgeCodeEms(cells).toFixed(3)),
              "--stamp-n": headline.stamp.length,
            } as CSSProperties
          }
        >
          {!rest && (
            <div className="today-sheet__sockets" {...leave}>
              {cells.map((cell) => (
                <Cell
                  key={cell.key}
                  cell={cell}
                  active={lens?.key === cell.key}
                  onPick={() => pick(cellLens(cell))}
                  hover={hover(cellLens(cell))}
                  onLight={(on) => setLit(on ? cell.key : null)}
                />
              ))}
            </div>
          )}
          <span className="today-sheet__stamp">{headline.stamp}</span>
        </div>
      </div>

      {retold && typeof document !== "undefined" &&
        createPortal(<SummaryModal subject={retold} onClose={() => setRetold(null)} />, document.body)}
      {photoOpen && day.photo && <DayPhotoModal photo={day.photo} onClose={() => setPhotoOpen(false)} />}
    </div>
  );
}

/**
 * One sitting, always a SQUARE whatever was listened to or read: the sheet is a grid of equal
 * frames, and a row that stretched to fill would make one podcast look like a whole day's work.
 * Openable only when the retelling exists; otherwise it is a picture, not a button.
 */
function Frame({
  session,
  lit,
  onOpen,
}: {
  session: SheetSession;
  /** Its item's ledge word is hovered or focused. */
  lit: boolean;
  onOpen: (s: SummarySubject) => void;
}) {
  const inner = (
    <>
      <span className="today-sheet__shot">
        {/* A cover that never arrives is the Spotify plate, by the same mechanism the music tile
            uses (DESIGN §7.1) — but only where the picture CAME from Spotify: on a book from the
            shelf the mark would be a foreign one, and the frame stays quietly blank. */}
        <Cover
          url={session.coverUrl}
          alt=""
          className="today-sheet__cover"
          fallback={
            session.kind === "podcast" ? (
              <CoverPlate seed={session.href ?? session.title} size={SHEET_PLATE} />
            ) : (
              <span className="today-sheet__cover today-sheet__cover--blank" aria-hidden />
            )
          }
        />
      </span>
      {/* Where the sitting fell in the whole work, as a lit run on a track — the covered chunk
          without percentages, which are the previous waves' way of saying it. DESIGN §4.3 */}
      {session.span && (
        <span className="today-sheet__track" aria-hidden>
          <span
            className="today-sheet__run"
            style={{
              left: `${(session.span.from * 100).toFixed(2)}%`,
              width: `${Math.max((session.span.to - session.span.from) * 100, 1.5).toFixed(2)}%`,
            }}
          />
        </span>
      )}
      <span className="today-sheet__name">{session.title}</span>
    </>
  );

  const subject = session.subject;
  // No retelling to open, but the sitting still has a home: the frame leads to the episode at
  // Spotify. Without either it is a picture, not a control.
  if (!subject) {
    const className = `today-sheet__frame today-sheet__frame--${session.kind}${lit ? " is-lit" : ""}`;
    if (!session.href) return <div className={className}>{inner}</div>;
    return (
      <a
        className={`${className} is-openable`}
        href={session.href}
        target="_blank"
        rel="noreferrer"
        aria-label={`Открыть в Spotify: ${session.title}`}
      >
        {inner}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={`today-sheet__frame today-sheet__frame--${session.kind} is-openable${lit ? " is-lit" : ""}`}
      // The track is decoration to a screen reader, so the covered chunk is spoken here instead.
      aria-label={session.chunk ? `${subject.ariaLabel}, ${session.chunk}` : subject.ariaLabel}
      onClick={() => onOpen(subject)}
    >
      {inner}
    </button>
  );
}

/**
 * One word of the edge code: mark, name, and the numeral raised after it. The word never moves and
 * never disappears, so the line's shape is the same every day. DESIGN §4.3
 */
function Cell({
  cell,
  active,
  onPick,
  hover,
  onLight,
}: {
  cell: SheetCell;
  active: boolean;
  onPick: () => void;
  hover: HoverProps;
  /** Light the item's own frames; any pointer or focus, since it only draws. */
  onLight: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`today-sheet__cell is-${cell.state}${active ? " is-active" : ""}`}
      aria-pressed={active}
      aria-label={cellAria(cell)}
      onClick={onPick}
      {...hover}
      onPointerEnter={(e) => {
        hover.onPointerEnter(e);
        onLight(true);
      }}
      onPointerLeave={() => onLight(false)}
      onFocus={() => onLight(true)}
      onBlur={() => onLight(false)}
    >
      <span className="today-sheet__mark" aria-hidden>
        {cell.fraction ?? CELL_MARK[cell.state]}
      </span>
      <span className="today-sheet__cellname">{cell.short}</span>
      {cell.tail && <sup className="today-sheet__tail">{cell.tail}</sup>}
    </button>
  );
}

/**
 * The monster as a FRAME of the row: the same square a cover fills, the figure standing in the
 * cover's place, and the verdict where a sitting prints its name. No outline is drawn — the body
 * is the card — but the geometry is a frame's, so the row keeps one baseline. DESIGN §4.3
 */
function MonsterCard({
  card,
  active,
  onPick,
  onFigure,
}: {
  card: SheetMonsterCard;
  active: boolean;
  onPick: () => void;
  /** The try-on, switched by the FIGURE: the square around it belongs to nobody. */
  onFigure: (on: boolean) => void;
}) {
  /* The lens answers to the monster, and the can fills barely half of its square — a try-on off
     the figure offered a lens the cursor was nowhere near. The test is geometric and rides
     `pointermove` on the square, so the canvas below keeps the enter/leave that spin it. */
  const figure = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse") return;
    onFigure(onMonsterFigure(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY));
  };

  return (
    <button
      type="button"
      className={`today-sheet__monster is-${card.verdict}${active ? " is-active" : ""}`}
      aria-pressed={active}
      aria-label={card.ariaLabel}
      onClick={onPick}
    >
      <span
        className="today-sheet__shot today-sheet__shot--bare"
        onPointerMove={figure}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") onFigure(false);
        }}
      >
        <Artifact3D
          src={MONSTER_MODEL_SRC}
          className="today-sheet__monsterbody"
          rpm={MONSTER_RPM}
          pose={MONSTER_POSE}
        />
      </span>
      {/* Stands in for a sitting's track so the verdict sits on the frame names' own line. */}
      <span className="today-sheet__track today-sheet__track--void" aria-hidden />
      <span className="today-sheet__monstersay">{card.caption}</span>
    </button>
  );
}

/**
 * An activity of the day in the monster's frame geometry, and its lens: the calendar lights the
 * days it happened, with no streak. Bouldering is the 3D shoe, the rest line pictograms. DESIGN §4.3
 */
function ActivityCard({
  activity,
  active,
  onPick,
  onTry,
}: {
  activity: Activity;
  active: boolean;
  onPick: () => void;
  onTry: (on: boolean) => void;
}) {
  const boulder = activity.key === "bouldering";
  const mouse = (on: boolean) => (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse") onTry(on);
  };
  return (
    <button
      type="button"
      className={`today-sheet__activity${boulder ? " is-boulder" : ""}${active ? " is-active" : ""}`}
      aria-label={activity.label}
      aria-pressed={active}
      onClick={onPick}
      onPointerEnter={mouse(true)}
      onPointerLeave={mouse(false)}
    >
      <span className="today-sheet__shot today-sheet__shot--bare">
        {boulder ? (
          <Artifact3D
            src={BOULDER_MODEL_SRC}
            className="today-sheet__monsterbody"
            rpm={MONSTER_RPM}
            pose={BOULDER_POSE}
            padding={BOULDER_PADDING}
            brightness={BOULDER_BRIGHTNESS}
          />
        ) : (
          <ActivityGlyph activity={activity.key} className="today-sheet__glyph" />
        )}
      </span>
      <span className="today-sheet__track today-sheet__track--void" aria-hidden />
      <span className="today-sheet__monstersay">{activity.label}</span>
    </button>
  );
}

/**
 * The day's photo in its own proportions ([photoFrame]), with no caption: it takes the neighbours'
 * caption line too. Hover tries its calendar lens on; focus is dropped on open. DESIGN §4.3
 */
function PhotoCard({
  photo,
  onOpen,
  onTry,
}: {
  photo: DayPhotoView;
  onOpen: () => void;
  onTry: (on: boolean) => void;
}) {
  const mouse = (on: boolean) => (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse") onTry(on);
  };
  const frame = photoFrame(photo.width, photo.height);
  const size = {
    "--photo-w": frame.width.toFixed(3),
    "--photo-h": frame.height.toFixed(3),
  } as CSSProperties;
  return (
    <button
      type="button"
      className="today-sheet__photo"
      aria-label="Фото дня"
      onClick={(e) => {
        e.currentTarget.blur();
        onOpen();
      }}
      onPointerEnter={mouse(true)}
      onPointerLeave={mouse(false)}
      style={size}
    >
      <span className="today-sheet__shot">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl(photo.webUrl)} alt="" className="today-sheet__cover" loading="lazy" />
      </span>
    </button>
  );
}

/** The sockets and the monster's card are the lens's only source, so its shape is built here. */
function cellLens(cell: SheetCell): DisciplineLens {
  return { key: cell.key, occurrence: 1, label: cell.short };
}

const MONSTER_LENS: DisciplineLens = { key: MONSTER_LENS_KEY, occurrence: 1, label: "монстр" };

/** What [hover] hands a socket: the try-on's pointer handler, spread onto the button. */
interface HoverProps {
  onPointerEnter: (e: PointerEvent<HTMLElement>) => void;
}

const MONSTER_MODEL_SRC = "/assets/3d/white-monster.glb";

/** Slow enough to read as standing rather than spinning: the can is a figure, not a loader. */
const MONSTER_RPM = 4;

/** Off-axis at rest: face-on the can is a flat rectangle, and a turned one reads as a body. */
const MONSTER_POSE = { yaw: 10, pitch: -12 };

const BOULDER_MODEL_SRC = "/assets/3d/climbing-shoe.glb";

/** Nose down at an angle, so the long shoe stands upright like the can beside it. */
const BOULDER_POSE = { yaw: 30, pitch: -12, roll: 70 };

/** The sphere fit makes a long shoe look larger than the can; this evens their heights. */
const BOULDER_PADDING = 0.62;

/** The shoe's texture is lighter than the can's: dimmed to sit in the same light. */
const BOULDER_BRIGHTNESS = 0.57;

/** The photographer's vocabulary: its own frames above, kept, still open, a select owed to nobody. */
const CELL_MARK: Readonly<Record<SheetCellState, string>> = {
  framed: "◉",
  done: "✓",
  pending: "·",
  extra: "○",
  unreported: "—",
};

const CELL_SAID: Readonly<Record<SheetCellState, string>> = {
  framed: "есть свои кадры",
  done: "сделано",
  pending: "не сделано",
  extra: "было",
  unreported: "не отмечен",
};

/** The mark is terse and the numeral terser, so both are spelled out for a screen reader. */
function cellAria(cell: SheetCell): string {
  const run = cell.streak > 0 ? `, ${cell.streak} дн. подряд` : "";
  return `${cell.label}: ${CELL_SAID[cell.state]}${run}`;
}
