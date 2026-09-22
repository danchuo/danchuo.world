"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { ArtifactView } from "@/lib/api/types";
import { Icon } from "./Icon";
import { useBackToClose } from "./useBackToClose";

const RU_MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** "2026-02-14" to a long Russian date, parsed by parts so `new Date` cannot shift the timezone. */
function formatFirstMentioned(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${RU_MONTHS[m - 1]} ${y}`;
}

interface ArtifactModalProps {
  artifact: ArtifactView;
  /** The artifact's picture. */
  src: string;
  onClose: () => void;
}

/**
 * One artifact, alone, at full size. There is no panel as an object — the item steps out of the
 * board straight into the dark, and a card around it would be the extra window the transition
 * leads away from. The wave owns the material; this file owns only the layout. DESIGN §7.2, §10.2
 */
export function ArtifactModal({ artifact, src, onClose }: ArtifactModalProps) {
  useBackToClose(true, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="artifact-scene modal-scale fixed inset-0 z-50 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={artifact.name}
        className="artifact-modal__panel relative flex flex-col items-center gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="tap-target absolute right-0 top-0"
          style={{ color: "var(--text-tertiary)", cursor: "pointer", background: "none", border: "none", display: "inline-flex" }}
        >
          <Icon name="close" size={18} />
        </button>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={artifact.name}
          style={{ width: "min(56vh, 520px)", height: "min(56vh, 520px)", maxWidth: "82vw", objectFit: "contain" }}
        />

        <div className="flex flex-col items-center gap-2">
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)", fontSize: "clamp(20px, calc(12px + 0.7vw), 32px)", textAlign: "center" }}>
            {artifact.name}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", fontSize: "var(--fs-modal-meta)" }}>
            {formatFirstMentioned(artifact.firstMentionedOn)}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
