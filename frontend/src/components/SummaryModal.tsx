"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { getSummary } from "@/lib/api/client";
import type { SummarySubject } from "@/lib/summarySubject";
import { Icon } from "./Icon";
import { Cover } from "./NowPlayingCard";
import { CoverPlate } from "./SpotifyMark";
import { useBackToClose } from "./useBackToClose";
import { useScrollLock } from "./useScrollLock";

interface SummaryModalProps {
  subject: SummarySubject;
  onClose: () => void;
}

/**
 * The "what was in this passage" window, opened from a reading or listening card. ONE WINDOW FOR
 * BOTH: the question and the answer do not depend on which it was, only the header differs and it
 * arrives ready-made. The text loads lazily, since the day card carries only a flag. PRD §5.16.1
 */
export function SummaryModal({ subject, onClose }: SummaryModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [bullets, setBullets] = useState<string[] | null>(null);
  const [takeaway, setTakeaway] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const { kind, sessionId } = subject;

  useEffect(() => {
    const ctrl = new AbortController();
    getSummary(kind, sessionId, { signal: ctrl.signal })
      .then((data) => {
        // The answer is NOT taken on trust. An incoming `{}` — what a native image returns without
        // `@RegisterForReflection` — used to throw on `bullets.map`, and that took down the whole
        // board, not just the summary. An empty summary and a broken answer are one thing here.
        const lines = Array.isArray(data?.bullets)
          ? data.bullets.filter((line): line is string => typeof line === "string" && line.trim() !== "")
          : [];
        if (lines.length === 0) {
          setFailed(true);
          return;
        }
        setBullets(lines);
        setTakeaway(typeof data.takeaway === "string" && data.takeaway.trim() !== "" ? data.takeaway : null);
      })
      .catch(() => {
        // A load aborted by closing the window is not an error; everything else is stated plainly.
        if (!ctrl.signal.aborted) setFailed(true);
      });
    return () => ctrl.abort();
  }, [kind, sessionId]);

  // The system Back closes the window rather than leaving the site (DESIGN §9).
  useBackToClose(true, onClose);
  useScrollLock(true);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="summary-scene modal-scale fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(33, 26, 22, 0.55)" }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={subject.ariaLabel}
        className="summary-modal__panel pixel-tile flex w-full max-w-md flex-col p-4"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
        data-testid="summary-modal"
      >
        <span className="pixel-slab" aria-hidden />
        <span className="pixel-lid" aria-hidden />

        {/* The header is the same subject as on the card: cover, title, caption, in a centred
            column. The modal is about ONE thing, and its cover is the subject of the conversation
            rather than a list row's icon. The close cross goes into the corner absolutely. */}
        <div className="summary-modal__head relative mb-3 flex shrink-0 flex-col items-center text-center">
          <button
            ref={closeRef}
            type="button"
            className="tap-target absolute right-0 top-0"
            onClick={onClose}
            aria-label="Закрыть"
            style={{ ...mono, ...meta, cursor: "pointer", background: "none", border: "none", display: "inline-flex" }}
          >
            <Icon name="close" size={18} />
          </button>
          {/* The same cover by the same component as the card's and the player tile's. A book's is
              portrait (a spine), an episode's square (a sleeve) — hence different heights at one
              width. Larger than the card's: here it carries the header alone. */}
          <Away href={subject.titleUrl} className="summary-modal__shot">
            {/* A cover that never arrived is the Spotify plate, the same fallback the card the
                window was opened from carries (DESIGN §4.3) — and only for an episode, whose
                picture CAME from Spotify; a book from the shelf keeps the quiet blank. */}
            <Cover
              url={subject.coverUrl}
              alt=""
              size={COVER_W}
              height={subject.portrait ? COVER_H_PORTRAIT : COVER_W}
              fallback={
                subject.kind === "podcast" ? (
                  <CoverPlate seed={subject.titleUrl ?? subject.title} size={COVER_W} />
                ) : undefined
              }
            />
          </Away>
          <div className="summary-modal__ident mt-2 max-w-full px-6">
            {/* The cover and the name lead to the episode, the byline to the show. A book has no
                address of its own, and then both are plain text rather than dead links. */}
            <Away href={subject.titleUrl} className="summary-modal__name">
              {subject.title}
            </Away>
            {subject.byline && (
              <Away href={subject.bylineUrl} className="summary-modal__byline" style={{ ...mono, ...meta }}>
                {subject.byline}
              </Away>
            )}
          </div>
        </div>

        {/* The covered chunk, large and centred: it IS the conversation's heading. A wave may
            instead draw it as the lit run below, the sheet's own device — the track is a seam,
            dark until a skin lights it (DESIGN §4.3). */}
        {subject.progressValue && (
          <div className="summary-modal__progress shrink-0 text-center" data-testid="summary-progress">
            <div style={progressCaption}>{subject.progressCaption}</div>
            <div style={progressValue}>{subject.progressValue}</div>
            {subject.span && (
              <span
                className={`summary-modal__track${
                  subject.span.to - subject.span.from < ENDS_INSIDE_FROM ? " is-tight" : ""
                }`}
                aria-hidden
              >
                <span
                  className="summary-modal__run"
                  style={{
                    left: `${(subject.span.from * 100).toFixed(2)}%`,
                    width: `${Math.max((subject.span.to - subject.span.from) * 100, 1.5).toFixed(2)}%`,
                  }}
                />
                {subject.spanEnds && (
                  <>
                    <span className="summary-modal__end" style={{ left: `${(subject.span.from * 100).toFixed(2)}%` }}>
                      {subject.spanEnds.from}
                    </span>
                    <span
                      className="summary-modal__end summary-modal__end--far"
                      style={{ left: `${(subject.span.to * 100).toFixed(2)}%` }}
                    >
                      {subject.spanEnds.to}
                    </span>
                  </>
                )}
              </span>
            )}
          </div>
        )}

        <div className="summary-modal__body min-h-0 flex-1 overflow-y-auto">
          {bullets ? (
            <ul className="flex flex-col gap-2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {bullets.map((line) => (
                <li key={line} className="flex gap-2" style={{ ...mono, ...body }}>
                  <span aria-hidden style={{ color: "var(--accent)" }}>·</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ ...mono, ...meta }}>
              {failed ? "пересказ не собрался" : "собираю пересказ…"}
            </p>
          )}
        </div>

        {/* A peer of the header, the chunk and the records rather than a last bullet: it speaks
            about the WHOLE passage, and a wave may move it out of the column entirely. */}
        {bullets && takeaway && (
          <p className="summary-modal__takeaway shrink-0" data-testid="summary-takeaway">
            {takeaway}
          </p>
        )}
      </div>
    </div>
  );
}

/** Text that is a door when the subject has an address, and plain text when it has none. */
function Away({
  href,
  className,
  style,
  children,
}: {
  href: string | null;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  if (!href) return <div className={className} style={style}>{children}</div>;
  return (
    <a className={`${className} is-away`} href={href} target="_blank" rel="noreferrer" style={style}>
      {children}
    </a>
  );
}

/**
 * Below this the numbers move OUTSIDE the run instead of under its ends, where they would sit on
 * top of each other. Measured — at ~660px of track a label runs ~30px, so a pair needs ~10%.
 */
const ENDS_INSIDE_FROM = 0.12;

/** The header cover: one width for both subjects, the height by each one's proportion. */
const COVER_W = 60;
const COVER_H_PORTRAIT = 90;

const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

const meta = {
  fontSize: "var(--fs-modal-meta)",
  color: "var(--text-tertiary)",
} satisfies CSSProperties;

const body = {
  fontSize: "var(--fs-modal-row)",
  color: "var(--text-primary)",
  lineHeight: 1.45,
} satisfies CSSProperties;

const progressCaption = {
  ...mono,
  fontSize: "var(--fs-modal-small)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-tertiary)",
  marginBottom: 2,
} satisfies CSSProperties;

const progressValue = {
  ...mono,
  fontSize: "var(--fs-modal-title)",
  fontWeight: 600,
  color: "var(--accent)",
} satisfies CSSProperties;

