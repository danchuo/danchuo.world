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
  /** Размечаемый кадр — приходит сверху, поэтому после сохранения рамки видны сразу. */
  photo: AdminPhotoView;
  /** Каталог предметов: размечать можно только то, что в нём заведено. */
  artifacts: AdminArtifactView[];
  /** Свежие кадры дропа после сохранения/снятия рамки. */
  onSaved: (photos: AdminPhotoView[]) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

/** Точка в долях кадра. */
interface Point {
  x: number;
  y: number;
}

/**
 * Ручная разметка артефактов на кадре (PRD §5.12): **выбрал предмет → обвёл его мышью**.
 *
 * Зачем это рядом с прогоном модели: описание артефакта задаёт КЛАСС вещи, и на типовых
 * предметах модель ошибается в обе стороны — и лишнее находит, и своё пропускает. Снять лишнее
 * админка умела с самого начала (чипы под кадром), а поставить своё — нет: рамка бралась только
 * из прогона. Ручная рамка главнее находки модели (`source = manual`), поэтому перепрогон её не
 * трогает, а на отклонённой паре она снимает отклонение — то есть это ещё и способ вернуть
 * предмет, снятый по ошибке.
 *
 * Три решения, которые тут неочевидны.
 * **(1) Кадр открывается в web-варианте, а не в превью сетки**: доли считаются от нарисованного
 * размера, и на превью в 96px промах в один пиксель это процент кадра.
 * **(2) Протяжка ведётся по окну, а не по кадру**: курсор при обводке предмета у самого края
 * регулярно выезжает за картинку, и слушатель на кадре терял бы `pointerup` — рамка «залипала»
 * бы до следующего клика. Рамка кадра снимается один раз в начале жеста: во время протяжки она
 * не меняется, а лишние замеры на каждом движении заметны.
 * **(3) Мелкая протяжка дотягивается до минимума** (`boxFromDrag`) — вокруг очков на общем
 * плане рамку мышью не обвести, да и незачем: подсветка отвечает «куда смотреть».
 */
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
  // Рамка кадра на время жеста: замеряется на нажатии и дальше не пересчитывается.
  const rectRef = useRef<DOMRect | null>(null);

  const marked = photo.artifacts ?? [];

  // Системное «Назад» закрывает разметчик, а не уводит со страницы админки (DESIGN §9).
  useBackToClose(true, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Экранная точка → доли кадра (за края кадра не обрезаем — это делает `boxFromDrag`). */
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

  // Протяжка живёт на окне: у края кадра курсор выезжает за картинку, и `pointerup` мимо
  // слушателя кадра оставил бы жест незакрытым.
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
    e.preventDefault(); // иначе браузер тащит саму картинку
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
        {/* Кадр: рамки стоят долями, поэтому переживают любой размер картинки. */}
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
                // Рамка выбранного предмета выделена: её перерисовывает следующая протяжка.
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

          {/* Рамка, которую тянут прямо сейчас: показывает сырой жест, без дотяжки до
              минимума — иначе она прыгала бы под курсором на первых же пикселях. */}
          {preview && <div className="marker-preview" style={{ ...markerBoxStyle, ...preview, borderColor: "var(--accent)" }} />}
        </div>

        {/* Каталог: размечать можно только заведённый предмет — имя рамки берётся из него. */}
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
                {/* Картинка предмета из каталога: имена вроде «YONEX ASTROX» на кадре не
                    опознаются, а вырезанный предмет опознаётся сразу. */}
                {a.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl(a.imageUrl)} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />
                )}
                <span>{a.name}</span>
                {/* Уже размеченные помечены: следующая протяжка их перерисует, а не добавит вторую. */}
                {isMarked && <span aria-hidden style={{ marginLeft: "auto", color: "var(--accent)" }}>●</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Две точки в долях → CSS-проценты: рамка кадра масштабируется вместе с картинкой. */
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
