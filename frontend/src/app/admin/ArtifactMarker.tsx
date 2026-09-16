"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useBackToClose } from "@/components/useBackToClose";
import { deleteArtifactBox, saveArtifactBox } from "@/lib/api/admin";
import { boxFromDrag, type BoxRect } from "@/lib/artifactHighlight";
import { mediaUrl } from "@/lib/api/media";
import type { AdminArtifactView, AdminPhotoView } from "@/lib/api/types";
import {
  markerArtifactBtnStyle,
  markerBoxStyle,
  markerBoxLabelStyle,
  markerSelectedArtifactBtnStyle,
  describe as describeError,
  mono,
  secondaryBtnStyle,
} from "./adminUi";

interface ArtifactMarkerProps {
  token: string;
  dropId: number;
  /** Parent-owned photo makes saved boxes visible immediately. */
  photo: AdminPhotoView;
  /** Only catalog items can be annotated. */
  artifacts: AdminArtifactView[];
  /** Updated photos after saving or removing a box. */
  onSaved: (photos: AdminPhotoView[]) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

/** Point in image fractions. */
interface Point {
  x: number;
  y: number;
}

/** Manual boxes override model detections and restore rejected items. PRD §5.12. */
export function ArtifactMarker({
  token,
  dropId,
  photo,
  artifacts,
  onSaved,
  onError,
  onClose,
}: ArtifactMarkerProps) {
  const [artifactId, setArtifactId] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ from: Point; to: Point } | null>(null);
  const [saving, setSaving] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  // Measure once at pointer-down; keep the photo bounds stable throughout the gesture.
  const rectRef = useRef<DOMRect | null>(null);

  const marked = photo.artifacts ?? [];

  // Browser Back closes the marker while keeping the admin page. DESIGN §9.
  useBackToClose(true, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Screen coordinates to image fractions; boxFromDrag handles clamping. */
  const toFraction = useCallback((clientX: number, clientY: number): Point | null => {
    const rect = rectRef.current;
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
  }, []);

  const save = useCallback(
    async (box: BoxRect, id: number) => {
      setSaving(true);
      try {
        onSaved(await saveArtifactBox(token, dropId, photo.id, id, box));
      } catch (err) {
        onError(describeError(err));
      } finally {
        setSaving(false);
      }
    },
    [dropId, onError, onSaved, photo.id, token],
  );

  // Listen on window so leaving the photo cannot lose pointerup and leave a stuck drag.
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const p = toFraction(e.clientX, e.clientY);
      if (p) setDrag((prev) => (prev ? { ...prev, to: p } : prev));
    };
    const onUp = (e: PointerEvent) => {
      const to = toFraction(e.clientX, e.clientY) ?? drag.to;
      setDrag(null);
      const box = boxFromDrag(drag.from, to);
      if (box && artifactId !== null) void save(box, artifactId);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [artifactId, drag, save, toFraction]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (artifactId === null || saving) return;
    rectRef.current = frameRef.current?.getBoundingClientRect() ?? null;
    const p = toFraction(e.clientX, e.clientY);
    if (!p) return;
    e.preventDefault(); // otherwise the browser drags the picture itself
    setDrag({ from: p, to: p });
  }

  async function removeBox(id: number) {
    try {
      onSaved(await deleteArtifactBox(token, dropId, photo.id, id));
    } catch (err) {
      onError(describeError(err));
    }
  }

  const preview = drag ? rectOf(drag.from, drag.to) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="разметка артефактов на кадре"
      className="fixed inset-0 z-50 flex flex-col gap-3 overflow-auto p-4"
      style={{ background: "var(--bg-page)" }}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p style={mono}>
          {artifactId === null
            ? "выбери предмет справа, потом обведи его на кадре"
            : saving
              ? "сохраняю рамку…"
              : "обведи предмет мышью; слишком мелкая рамка дорастёт до минимума"}
        </p>
        <button type="button" onClick={onClose} style={secondaryBtnStyle}>
          готово
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-4 md:flex-row">
        {/* The frame: boxes are placed in fractions, so they survive any picture size. */}
        <div
          ref={frameRef}
          className="marker-frame"
          onPointerDown={onPointerDown}
          style={{
            position: "relative",
            flex: "1 1 auto",
            alignSelf: "flex-start",
            maxWidth: "100%",
            touchAction: "none",
            cursor: artifactId === null ? "default" : "crosshair",
            userSelect: "none",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl(photo.imageUrl)}
            alt=""
            draggable={false}
            style={{ display: "block", width: "100%", height: "auto" }}
          />

          {marked.map((b) => (
            <div
              key={b.artifactId}
              className="marker-box"
              style={{
                ...markerBoxStyle,
                ...rectOf({ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y1 }),
                // The next drag replaces the selected item's box.
                borderColor: b.artifactId === artifactId ? "var(--accent)" : "var(--border)",
              }}
            >
              <span style={markerBoxLabelStyle}>
                {b.name}
                <button
                  type="button"
                  onClick={() => removeBox(b.artifactId)}
                  aria-label={`Убрать ${b.name} с кадра`}
                  title="убрать рамку"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, lineHeight: 0 }}
                >
                  <Icon name="close" size={11} />
                </button>
              </span>
            </div>
          ))}

          {/* The box being dragged right now shows the raw gesture, with no stretching to the
              minimum — otherwise it would jump under the cursor on the first few pixels. */}
          {preview && <div className="marker-preview" style={{ ...markerBoxStyle, ...preview, borderColor: "var(--accent)" }} />}
        </div>

        {/* The catalogue: only a registered item can be marked — the box takes its name from it. */}
        <div role="radiogroup" aria-label="предмет" className="flex flex-col gap-1" style={{ minWidth: 180 }}>
          {artifacts.length === 0 && <p style={mono}>каталог пуст — заведи предмет в разделе «артефакты»</p>}
          {artifacts.map((a) => {
            const isMarked = marked.some((b) => b.artifactId === a.id);
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={a.id === artifactId}
                onClick={() => setArtifactId(a.id)}
                style={a.id === artifactId ? markerSelectedArtifactBtnStyle : markerArtifactBtnStyle}
              >
                {/* The item's picture from the catalogue: names are not recognisable on a frame,
                    while the cut-out item is recognised at once. */}
                {a.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl(a.imageUrl)} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />
                )}
                <span>{a.name}</span>
                {/* Already marked ones are flagged: the next drag redraws them, not adds a second. */}
                {isMarked && <span aria-hidden style={{ marginLeft: "auto", color: "var(--accent)" }}>●</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Image fractions to CSS percentages so boxes scale with the photo. */
function rectOf(a: Point, b: Point) {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const pct = (v: number) => `${Math.round(v * 1e5) / 1e3}%`;
  return {
    left: pct(x0),
    top: pct(y0),
    width: pct(Math.abs(b.x - a.x)),
    height: pct(Math.abs(b.y - a.y)),
  };
}
