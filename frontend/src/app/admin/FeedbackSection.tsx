"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { AdminApiError, deleteFeedback, listFeedback } from "@/lib/api/admin";
import type { FeedbackNoteView } from "@/lib/api/types";
import { FEEDBACK_QUESTIONS } from "@/lib/feedbackForm";
import { mono, secondaryBtnStyle } from "./adminUi";

const cell: CSSProperties = { padding: "10px 10px", verticalAlign: "top" };

const DEVICE_RU: Record<FeedbackNoteView["deviceType"], string> = {
  MOBILE: "телефон",
  TABLET: "планшет",
  DESKTOP: "десктоп",
};

/** "2026-09-21T18:40:12Z" to a short MSK stamp; the axis of the whole project is MSK. PRD §3. */
function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Screen and viewport as one line; either half may be missing. */
function formatSizes(note: FeedbackNoteView): string | null {
  const viewport = note.viewportW && note.viewportH ? `окно ${note.viewportW}×${note.viewportH}` : null;
  const screen = note.screenW && note.screenH ? `экран ${note.screenW}×${note.screenH}` : null;
  return [viewport, screen].filter(Boolean).join(" · ") || null;
}

/**
 * The visitor notes inbox. Every answer is rendered as TEXT — React escapes it, and nothing here
 * may ever become markup: this is the one table in the project filled by strangers. PRD §5.19, §11
 */
export function FeedbackSection({ token }: { token: string }) {
  const [notes, setNotes] = useState<FeedbackNoteView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (t: string) => {
    setBusy(true);
    setError(null);
    try {
      setNotes(await listFeedback(t));
    } catch (e) {
      setError(
        e instanceof AdminApiError
          ? e.status === 401
            ? "неверный/просроченный токен — войди заново"
            : `ошибка ${e.status}`
          : "сеть недоступна",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load(token);
  }, [token, load]);

  async function onDelete(note: FeedbackNoteView) {
    const preview = note.likedMost ?? note.wouldChange ?? note.missingBlock ?? "";
    if (!window.confirm(`Удалить записку?\n\n${preview.slice(0, 160)}`)) return;
    try {
      await deleteFeedback(token, note.id);
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
    } catch (e) {
      setError(e instanceof AdminApiError ? `не удалось удалить (${e.status})` : "сеть недоступна");
    }
  }

  return (
    <section>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 style={{ fontSize: 16, color: "var(--text-primary)" }}>обратная связь</h2>
        <span style={mono}>
          {notes.length > 0 ? `записок: ${notes.length}` : "пока пусто"}
          {busy && " · загрузка…"}
        </span>
      </header>

      {error && <p className="mb-4" style={{ ...mono, color: "var(--accent)" }}>{error}</p>}

      {!busy && notes.length === 0 && !error && (
        <p style={mono}>никто ещё не написал — конверт живёт на борде, справа от календаря.</p>
      )}

      {notes.length > 0 && (
        <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-tertiary)" }}>
              <th style={cell}>когда</th>
              <th style={cell}>ответы</th>
              <th style={cell}>контекст</th>
              <th style={cell} />
            </tr>
          </thead>
          <tbody>
            {notes.map((note) => (
              <tr
                key={note.id}
                style={{
                  borderTop: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  // A bot-marked row is kept but dimmed: evidence, not content.
                  opacity: note.isBot ? 0.5 : 1,
                }}
              >
                <td style={{ ...cell, whiteSpace: "nowrap" }}>
                  <div>{formatStamp(note.submittedAt)}</div>
                  {note.signature && (
                    <div style={{ ...mono, color: "var(--text-secondary)" }}>{note.signature}</div>
                  )}
                  {note.isBot && <div style={{ ...mono, color: "var(--accent)" }}>бот?</div>}
                </td>

                <td style={{ ...cell, maxWidth: 520 }}>
                  {FEEDBACK_QUESTIONS.map(({ key, question }) => {
                    const answer = note[key];
                    if (!answer) return null;
                    return (
                      <div key={key} className="mb-2">
                        <div style={{ ...mono, fontSize: 11 }}>{question}</div>
                        <div style={{ whiteSpace: "pre-wrap" }}>{answer}</div>
                      </div>
                    );
                  })}
                </td>

                <td style={{ ...cell, ...mono, maxWidth: 260 }}>
                  <div>{[note.waveKey, DEVICE_RU[note.deviceType]].filter(Boolean).join(" · ")}</div>
                  {note.selectedDay && <div>день на борде: {note.selectedDay}</div>}
                  {formatSizes(note) && <div>{formatSizes(note)}</div>}
                  {note.language && <div>{note.language}</div>}
                  {note.path !== "/" && <div>{note.path}</div>}
                  {note.userAgent && (
                    <div style={{ wordBreak: "break-word", opacity: 0.7 }}>{note.userAgent}</div>
                  )}
                </td>

                <td style={{ ...cell, whiteSpace: "nowrap" }}>
                  <button type="button" style={secondaryBtnStyle} onClick={() => onDelete(note)}>
                    удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
