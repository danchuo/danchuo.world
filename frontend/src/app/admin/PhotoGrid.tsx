"use client";

import { Icon } from "@/components/Icon";
import { mediaUrl } from "@/lib/api/media";
import type { AdminDropView, AdminPhotoView, OrientationStatusView } from "@/lib/api/types";
import {
  ambiguousBadgeStyle,
  coverBtnStyle,
  deletePhotoBtnStyle,
  mono,
  orientationLabel,
  rotateBtnStyle,
  secondaryBtnStyle,
  sectionTitleStyle,
} from "./adminUi";

interface PhotoGridProps {
  selected: AdminDropView | null;
  photos: AdminPhotoView[];
  orientation: OrientationStatusView | null;
  onCheckOrientation: () => void;
  onSetCover: (photoId: number) => void;
  onRotate: (photoId: number) => void;
  onDeletePhoto: (photoId: number) => void;
}

/**
 * Сетка кадров выбранного дропа: клик по кадру помечает его обложкой, ↻ поворачивает на 90°,
 * ✕ удаляет без возврата, «?» — LLM не определилась с верхом (B9). Своего состояния нет —
 * кадры и статус проверки поворота живут в родителе (их обновляют и другие действия).
 */
export function PhotoGrid({
  selected,
  photos,
  orientation,
  onCheckOrientation,
  onSetCover,
  onRotate,
  onDeletePhoto,
}: PhotoGridProps) {
  const checking = orientation?.state === "running";

  return (
    <section className="md:flex-1">
      <h2 className="mb-3" style={sectionTitleStyle}>
        {selected ? `обложка дропа «${selected.title}»` : "выбери дроп"}
      </h2>
      {selected && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          {/* Запуск/статус LLM-проверки поворота кадров (B9). */}
          <button type="button" onClick={onCheckOrientation} disabled={checking} style={secondaryBtnStyle}>
            {checking ? "проверяю поворот…" : "проверить поворот"}
          </button>
          {orientation && <span aria-live="polite" style={mono}>{orientationLabel(orientation)}</span>}
        </div>
      )}
      {selected && photos.length === 0 && <p style={mono}>в дропе нет кадров</p>}
      {selected && photos.length > 0 && (
        <>
          <p className="mb-3" style={mono}>кликни кадр, чтобы сделать его обложкой (она показывается в архиве); ↻ поворачивает кадр на 90°, ✕ удаляет кадр без возврата</p>
          <ul className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}>
            {photos.map((p) => (
              <li key={p.id} style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => onSetCover(p.id)}
                  aria-label={p.isCover ? "Текущая обложка" : "Сделать обложкой"}
                  aria-pressed={p.isCover}
                  style={{
                    ...coverBtnStyle,
                    outline: p.isCover ? "3px solid var(--accent)" : "1px solid var(--border)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaUrl(p.thumbUrl)} alt="" className="h-full w-full object-cover" />
                </button>
                {/* Ручная стрелка поворота — поверх угла кадра, отдельная от клика-обложки
                    (stopPropagation не нужен: это соседний элемент, а не вложенный). */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRotate(p.id);
                  }}
                  disabled={checking}
                  aria-label="Повернуть кадр на 90° по часовой"
                  title="повернуть на 90°"
                  style={rotateBtnStyle}
                >
                  <Icon name="rotate" size={15} />
                </button>
                {/* Удаление одного кадра — верхний-правый угол (напротив ↻), отдельно от клика-обложки. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeletePhoto(p.id);
                  }}
                  disabled={checking}
                  aria-label="Удалить кадр"
                  title="удалить кадр"
                  style={deletePhotoBtnStyle}
                >
                  <Icon name="close" size={15} />
                </button>
                {/* LLM не определилась с верхом — кадр ждёт ручной стрелки. */}
                {p.orientation === "ambiguous" && (
                  <span
                    title="LLM не определилась с верхом — проверь кадр"
                    style={{ ...ambiguousBadgeStyle, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <Icon name="help" size={12} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
