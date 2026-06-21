"use client";

import { useCallback, useEffect, useRef, type CSSProperties } from "react";
import { getDrop } from "@/lib/api/client";
import type { FilmPhotoView } from "@/lib/api/types";
import { useTileData } from "./useTileData";

interface PhotoDropModalProps {
  dropId: number;
  title: string;
  monthLabel: string | null;
  onClose: () => void;
}

/**
 * Модалка-галерея фото-дропа (PRD §5.12, DESIGN §7.5) — большое всплывающее окно (НЕ новая
 * вкладка). Затемнённый фон, закрытие по `×`/`Esc`/клику по фону, фокус-трап, вертикальный
 * скролл (≈36 кадров длиннее экрана). Композиция — плотная masonry по реальным размерам кадров
 * (CSS-колонки; точный justified-алгоритм — дизайн-TODO). До B1 кадров нет — пустое состояние.
 */
export function PhotoDropModal({ dropId, title, monthLabel, onClose }: PhotoDropModalProps) {
  const { phase, data } = useTileData<FilmPhotoView[]>(
    useCallback((signal) => getDrop(dropId, { signal }), []), // dropId стабилен на время жизни модалки
  );
  const photos = data ?? [];
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Esc закрывает; Tab держим в пределах модалки (минимальный фокус-трап, §9).
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
        aria-label={title}
        className="pixel-tile my-auto w-full max-w-4xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex flex-col">
            <span style={{ fontSize: 16, color: "var(--text-primary)" }}>{title}</span>
            {monthLabel && (
              <span style={{ ...monoTertiary }}>{monthLabel}</span>
            )}
          </div>
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

        {phase === "loading" && <p style={monoTertiary}>загрузка…</p>}
        {phase === "error" && <p style={monoTertiary}>не удалось загрузить дроп</p>}
        {phase === "loaded" && photos.length === 0 && (
          <p style={monoTertiary}>в этом дропе пока нет кадров</p>
        )}
        {phase === "loaded" && photos.length > 0 && (
          // Плотная masonry: CSS-колонки пакуют кадры разной ориентации без фиксированной сетки.
          <div style={{ columnGap: 6, columns: "3 160px" }}>
            {photos.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${p.imageUrl}-${i}`}
                src={p.imageUrl}
                alt=""
                width={p.width ?? undefined}
                height={p.height ?? undefined}
                className="mb-1.5 w-full"
                style={{ breakInside: "avoid", borderRadius: "var(--radius-sm)" }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const monoTertiary = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "var(--text-tertiary)",
} satisfies CSSProperties;
