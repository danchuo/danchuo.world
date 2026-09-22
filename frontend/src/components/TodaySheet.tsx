"use client";

import { useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { DayView } from "@/lib/api/types";
import {
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
import { showsBoulder } from "@/lib/bouldering";
import { MONSTER_LENS_KEY, type DisciplineLens } from "@/lib/disciplineLens";
import { Cover } from "./NowPlayingCard";
import { CoverPlate } from "./SpotifyMark";
import type { SummarySubject } from "@/lib/summarySubject";
import { SummaryModal } from "./SummaryModal";

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
  const headline = sheetHeadline(day, today);
  const sessions = sheetSessions(day);
  const cells = sheetCells(day);
  const monster = sheetMonsterCard(day);

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
    <div className="today-sheet">
      <div className="today-sheet__body">
        <p className="today-sheet__voice" style={{ fontSize: voiceSize }}>
          {voice}
        </p>

        {/* The monster stands IN the frame row, last: it is the one discipline item that is a BODY
            rather than a count, so it takes a frame's square instead of a socket. DESIGN §4.3 */}
        <div className="today-sheet__frames">
          {sessions.map((session) => (
            <Frame key={session.key} session={session} onOpen={setRetold} />
          ))}
          {showsBoulder(day) && <BoulderCard />}
          <MonsterCard
            card={monster}
            active={lens?.key === MONSTER_LENS_KEY}
            onPick={() => pick(MONSTER_LENS)}
            onFigure={(on) => onLensPreview?.(on ? MONSTER_LENS : null)}
          />
        </div>

        {/* The row's column count is DATA: a new discipline item widens the row rather than
            wrapping onto a second one, which would break the shape the eye has learnt. */}
        <div
          className="today-sheet__sockets"
          style={{ "--sheet-sockets": cells.length } as CSSProperties}
          {...leave}
        >
          {cells.map((cell) => (
            <Cell
              key={cell.key}
              cell={cell}
              active={lens?.key === cell.key}
              onPick={() => pick(cellLens(cell))}
              hover={hover(cellLens(cell))}
            />
          ))}
        </div>

        {/* The date closes the foot at its far end: the whole top belongs to the day's name,
            which the stamp is not allowed to compete with. DESIGN §4.3 */}
        <div className="today-sheet__foot">
          <span className="today-sheet__stamp">{headline.stamp}</span>
        </div>
      </div>

      {retold && typeof document !== "undefined" &&
        createPortal(<SummaryModal subject={retold} onClose={() => setRetold(null)} />, document.body)}
    </div>
  );
}

/**
 * One sitting, always a SQUARE whatever was listened to or read: the sheet is a grid of equal
 * frames, and a row that stretched to fill would make one podcast look like a whole day's work.
 * Openable only when the retelling exists; otherwise it is a picture, not a button.
 */
function Frame({ session, onOpen }: { session: SheetSession; onOpen: (s: SummarySubject) => void }) {
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
    const className = `today-sheet__frame today-sheet__frame--${session.kind}`;
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
      className={`today-sheet__frame today-sheet__frame--${session.kind} is-openable`}
      // The track is decoration to a screen reader, so the covered chunk is spoken here instead.
      aria-label={session.chunk ? `${subject.ariaLabel}, ${session.chunk}` : subject.ariaLabel}
      onClick={() => onOpen(subject)}
    >
      {inner}
    </button>
  );
}

/**
 * A SOCKET of the fixed row: the mark is the state, the name beneath it the identity. The socket
 * never moves and never disappears, so the row's shape is the same every day and an item is found
 * by place rather than by reading. DESIGN §4.3
 */
function Cell({
  cell,
  active,
  onPick,
  hover,
}: {
  cell: SheetCell;
  active: boolean;
  onPick: () => void;
  hover: HoverProps;
}) {
  return (
    <button
      type="button"
      className={`today-sheet__cell is-${cell.state}${active ? " is-active" : ""}`}
      aria-pressed={active}
      aria-label={cellAria(cell)}
      onClick={onPick}
      {...hover}
    >
      <span className="today-sheet__mark" aria-hidden>
        {CELL_MARK[cell.state]}
      </span>
      <span className="today-sheet__tail">{cell.tail ?? ""}</span>
      <span className="today-sheet__cellname">{cell.short}</span>
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
 * The bouldering shoe: the monster's frame geometry, standing before it on the days it happened.
 * A fact, not a control — no lens answers to it. DESIGN §4.3
 */
function BoulderCard() {
  return (
    <figure className="today-sheet__boulder" aria-label="Болдеринг">
      <span className="today-sheet__shot today-sheet__shot--bare">
        <Artifact3D
          src={BOULDER_MODEL_SRC}
          className="today-sheet__monsterbody"
          rpm={MONSTER_RPM}
          pose={BOULDER_POSE}
          padding={BOULDER_PADDING}
          brightness={BOULDER_BRIGHTNESS}
        />
      </span>
      <span className="today-sheet__track today-sheet__track--void" aria-hidden />
      <figcaption className="today-sheet__monstersay">болдеринг</figcaption>
    </figure>
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
