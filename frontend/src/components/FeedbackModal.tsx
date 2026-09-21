"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FeedbackError, postFeedback } from "@/lib/api/client";
import {
  ANSWER_MAX,
  canSubmit,
  EMPTY_ANSWERS,
  FEEDBACK_QUESTIONS,
  feedbackErrorText,
  SIGNATURE_MAX,
  type AnswerKey,
  type Answers,
} from "@/lib/feedbackForm";
import { Icon } from "./Icon";
import { useBackToClose } from "./useBackToClose";

interface FeedbackModalProps {
  /** The active wave's key, so a note about colour is readable a wave later. */
  waveKey?: string | null;
  /** The day the board had selected when the envelope was opened. */
  selectedDay?: string | null;
  onClose: () => void;
}

type Phase = "form" | "sending" | "sent";

/**
 * The note to the author: three optional questions, one of them is enough. Not a survey — the
 * questions stay collapsed as cards until one is picked, so the window opens as a short list of
 * invitations rather than a wall of empty fields. PRD §5.19, DESIGN §7.11
 */
export function FeedbackModal({ waveKey, selectedDay, onClose }: FeedbackModalProps) {
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [signature, setSignature] = useState("");
  const [opened, setOpened] = useState<AnswerKey | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  // The honeypot lives in state like any field: a bot that fills every input fills this one too.
  const [website, setWebsite] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useBackToClose(true, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    if (!canSubmit(answers) || phase === "sending") return;
    setPhase("sending");
    setError(null);
    try {
      await postFeedback({
        ...answers,
        signature: signature.trim() || undefined,
        path: window.location.pathname,
        waveKey: waveKey ?? undefined,
        selectedDay: selectedDay ?? undefined,
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
        screenW: window.screen?.width,
        screenH: window.screen?.height,
        language: navigator.language,
        website,
      });
      setPhase("sent");
    } catch (e) {
      // The answers are NOT cleared: a refusal must never cost somebody their words.
      setPhase("form");
      setError(
        e instanceof FeedbackError
          ? feedbackErrorText(e.code, e.field)
          : feedbackErrorText("network"),
      );
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="feedback-scene modal-scale fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="написать автору"
        className={`feedback-modal__panel pixel-tile relative my-auto flex flex-col ${
          phase === "sent" ? "feedback-modal__panel--done" : ""
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* The box backing plus the white inner frame (§2.4), as in TileShell: the modal panel
            carries .pixel-tile itself, so the layer elements are added here. */}
        <span className="pixel-slab" aria-hidden />
        <span className="pixel-lid" aria-hidden />
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="feedback-modal__close tap-target"
        >
          <Icon name="close" size={18} />
        </button>

        {phase === "sent" ? (
          <p className="feedback-modal__done" role="status">
            долетело. спасибо!
          </p>
        ) : (
          <>
            <h2 className="feedback-modal__title">
              жажду советов пожеланий{" "}
              <span className="feedback-modal__word">интеллектуальных</span> вкладов
            </h2>
            <p className="feedback-modal__lead">можно ответить на один вопрос или на все</p>

            {/* Questions and the signature share ONE container so a wave may re-lay them as a
                grid: wave 03 makes the four of them a 2x2 table. DESIGN §7.11 */}
            <div className="feedback-modal__fields">
              {FEEDBACK_QUESTIONS.map(({ key, question }) => {
                // A card stays open once it has words in it: collapsing a written answer out of
                // sight would read as having lost it.
                const expanded = opened === key || answers[key].length > 0;
                return (
                  <div key={key} className="feedback-card" data-expanded={expanded || undefined}>
                    {expanded ? (
                      <label className="feedback-card__label">
                        <span className="feedback-card__question">{question}</span>
                        <textarea
                          autoFocus={opened === key}
                          rows={3}
                          maxLength={ANSWER_MAX}
                          value={answers[key]}
                          onChange={(e) =>
                            setAnswers((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          className="feedback-card__input"
                        />
                      </label>
                    ) : (
                      <button
                        type="button"
                        className="feedback-card__button"
                        onClick={() => setOpened(key)}
                      >
                        {question}
                      </button>
                    )}
                  </div>
                );
              })}

              <label className="feedback-modal__sign">
                <span className="feedback-card__question">как тебя подписать?</span>
                <input
                  type="text"
                  maxLength={SIGNATURE_MAX}
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  className="feedback-card__input"
                />
              </label>
            </div>

            {/* The honeypot. Hidden from people and from screen readers, visible to a bot that
                walks the DOM. Off-screen rather than `display:none` — some bots skip the latter. */}
            <div className="feedback-modal__trap" aria-hidden>
              <label>
                сайт
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </label>
            </div>

            {error && (
              <p className="feedback-modal__error" role="alert">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit(answers) || phase === "sending"}
              className="feedback-modal__send"
            >
              {phase === "sending" ? "отправляю…" : "отправить"}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
