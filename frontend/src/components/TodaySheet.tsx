"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { DayView } from "@/lib/api/types";
import {
  sheetHeadline,
  sheetLedger,
  sheetMonster,
  sheetSessions,
  sheetShortLabel,
  type SheetMark,
  type SheetSession,
} from "@/lib/daySheet";
import { MONSTER_LENS_KEY, sameLens, type DisciplineLens } from "@/lib/disciplineLens";
import type { SummarySubject } from "@/lib/summarySubject";
import { SummaryModal } from "./SummaryModal";

interface TodaySheetProps {
  day: DayView;
  today: string;
  lens?: DisciplineLens | null;
  onLensChange?: (lens: DisciplineLens | null) => void;
}

/**
 * The day as a CONTACT SHEET (DESIGN §4.3): every sitting of the day is a square frame with its
 * cover filling it, and the discipline ledger runs as named plates along the foot. The wave strips
 * the tile's plate, so the frames themselves are the material and the canvas shows between them.
 */
export function TodaySheet({ day, today, lens, onLensChange }: TodaySheetProps) {
  const [retold, setRetold] = useState<SummarySubject | null>(null);
  const headline = sheetHeadline(day, today);
  const sessions = sheetSessions(day);
  const marks = sheetLedger(day);
  const monster = sheetMonster(day);

  /* The name is the only line in full voice and it owns the body's width alone, fitted to ONE
     line of that width: mono's (1/0.6)·94 worst case with a hair of slack. Its size is therefore
     data — the longer the day's name, the quieter it is set. DESIGN §4.3 */
  const voice = headline.title ?? headline.relative;
  const voiceSize = `clamp(11px, ${(153 / voice.length).toFixed(2)}cqw, 32px)`;

  // With nothing listened to or read the frame row would be a hole; the ledger takes the height
  // instead and its plates grow. An empty sheet is a smaller sheet, not an empty rectangle.
  const bare = sessions.length === 0;

  function toggle(next: DisciplineLens) {
    if (!onLensChange) return;
    onLensChange(sameLens(lens ?? null, next) ? null : next);
  }

  return (
    <div className={`today-sheet${bare ? " today-sheet--bare" : ""}`}>
      {/* The stamp runs down the sheet's own edge, the way a frame number is printed on film:
          service text off the body entirely, leaving the top line to the day's name. The
          relative word is dropped when it IS the name, so the day is not said twice. */}
      <div className="today-sheet__edge">
        <span className="today-sheet__stamp">{headline.stamp}</span>
        {headline.title && <span className="today-sheet__relative">{headline.relative}</span>}
      </div>

      <div className="today-sheet__body">
        <p className="today-sheet__voice" style={{ fontSize: voiceSize }}>
          {voice}
        </p>

        {!bare && (
          <div className="today-sheet__frames">
            {sessions.map((session) => (
              <Frame key={session.key} session={session} onOpen={setRetold} />
            ))}
          </div>
        )}

        <div className="today-sheet__ledger">
          {marks.map((mark) => (
            <Mark
              key={mark.key}
              short={mark.short}
              aria={markAria(mark)}
              done={mark.done}
              streak={mark.streak}
              active={lens?.key === mark.key}
              onPick={() => toggle({ key: mark.key, occurrence: 1, label: mark.short })}
            />
          ))}
          <Mark
            short={sheetShortLabel(MONSTER_LENS_KEY, "монстр")}
            aria={monsterAria(monster.verdict, monster.streak)}
            done={monster.verdict === "clean"}
            tone={monster.verdict}
            streak={monster.streak}
            active={lens?.key === MONSTER_LENS_KEY}
            onPick={() => toggle({ key: MONSTER_LENS_KEY, occurrence: 1, label: "монстр" })}
          />
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
        {session.coverUrl ? (
          <img className="today-sheet__cover" src={session.coverUrl} alt="" loading="lazy" />
        ) : (
          <span className="today-sheet__cover today-sheet__cover--blank" aria-hidden />
        )}
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
  if (!subject) {
    return <div className={`today-sheet__frame today-sheet__frame--${session.kind}`}>{inner}</div>;
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
 * A ledger plate: a rectangle that says what it is. The streak rides at its right as a plain
 * NUMERAL — the lit edge that carried it before was read as duration, which is what the track
 * under a cover now means, and two lights saying different things is one too many. DESIGN §4.3
 */
function Mark({
  short,
  aria,
  streak,
  done,
  active,
  tone,
  onPick,
}: {
  short: string;
  aria: string;
  streak: number;
  done: boolean;
  active: boolean;
  tone?: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className={`sheet-mark${done ? " is-done" : ""}${active ? " is-active" : ""}`}
      data-tone={tone}
      aria-pressed={active}
      aria-label={aria}
      onClick={onPick}
    >
      <span className="sheet-mark__label">{short}</span>
      {streak >= STREAK_SHOWN_FROM && <span className="sheet-mark__run">{streak}д</span>}
    </button>
  );
}

/** A run of one day is not a run: the numeral appears only once it means something. */
const STREAK_SHOWN_FROM = 2;

/** The numeral is terse, so the streak is spelled out in words for a screen reader. */
function markAria(mark: SheetMark): string {
  const state = mark.done ? "сделано" : "не сделано";
  const run = mark.streak > 0 ? `, ${mark.streak} дн. подряд` : "";
  return `${mark.label}: ${state}${run}`;
}

function monsterAria(verdict: string, streak: number): string {
  if (verdict === "drunk") return "Монстр: выпит сегодня";
  if (verdict === "unreported") return "Монстр: не отмечен";
  return `Монстр: не выпит${streak > 0 ? `, ${streak} дн. подряд` : ""}`;
}
