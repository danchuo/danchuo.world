"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { photoUrl } from "@/lib/api/media";
import type { DayPhotoView } from "@/lib/api/types";
import { Icon } from "./Icon";
import { useBackToClose } from "./useBackToClose";

/** The day's photo alone, at full size, on the artifact modal's scene. DESIGN §4.3 */
export function DayPhotoModal({ photo, onClose }: { photo: DayPhotoView; onClose: () => void }) {
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
        aria-label="Фото дня"
        className="day-photo-modal relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl(photo.webUrl)} alt="Фото дня" width={photo.width} height={photo.height} />
        <button type="button" onClick={onClose} aria-label="Закрыть" className="day-photo-modal__close tap-target">
          <Icon name="close" size={18} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
