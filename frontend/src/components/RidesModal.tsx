"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { RideView } from "@/lib/api/types";
import { relativeDayRu } from "@/lib/relativeDay";
import { formatDuration, formatKm } from "@/lib/rideFormat";

interface RidesModalProps {
  rides: RideView[];
  today: string;
  onClose: () => void;
}

/**
 * Модалка «предыдущие поездки» Велобайк (PRD §9 B4, DESIGN §7.6) — тот же контур, что у
 * модалки фото-дропов (§5.12): большое всплывающее окно, затемнённый фон, закрытие по
 * `×`/`Esc`/клику по фону, фокус-трап, вертикальный скролл. Список поездок уже загружен тайлом
 * (передаётся пропом) — модалка не делает повторный запрос.
 */
export function RidesModal({ rides, today, onClose }: RidesModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6"
      style={{ background: "rgba(33, 26, 22, 0.55)" }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Прошлые поездки"
        className="pixel-tile my-auto w-full max-w-2xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span style={{ fontSize: 16, color: "var(--text-primary)" }}>поездки</span>
          <button
            ref={closeRef}
            type="button"
            className="tap-target"
            onClick={onClose}
            aria-label="Закрыть"
            style={{ ...monoTertiary, fontSize: 20, cursor: "pointer", background: "none", border: "none" }}
          >
            ×
          </button>
        </div>

        {rides.length === 0 ? (
          <p style={monoTertiary}>поездок пока нет</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rides.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-1 pb-2"
                style={{ borderBottom: "1px solid var(--border-muted, rgba(0,0,0,0.08))" }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span style={{ color: "var(--text-primary)", fontSize: 13 }}>
                    {relativeDayRu(r.rideDate, today)}
                  </span>
                  <span style={{ ...mono, color: "var(--text-secondary)", fontSize: 12 }}>{r.rideDate}</span>
                </div>
                <div style={{ ...mono, color: "var(--text-secondary)", fontSize: 12 }}>
                  {formatKm(r.distanceMeters)} · {formatDuration(r.durationSeconds)}
                  {r.calories != null && r.calories > 0 ? ` · ${r.calories} ккал` : ""}
                </div>
                {(r.startAddress || r.finishAddress) && (
                  <div style={{ ...mono, color: "var(--text-tertiary)", fontSize: 11 }}>
                    {(r.startAddress ?? "?") + " → " + (r.finishAddress ?? "?")}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;
const monoTertiary = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "var(--text-tertiary)",
} satisfies CSSProperties;
