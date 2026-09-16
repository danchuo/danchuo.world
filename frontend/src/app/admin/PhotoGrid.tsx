"use client";

import { Icon } from "@/components/Icon";
import { mediaUrl } from "@/lib/api/media";
import type {
  AdminDropView,
  AdminPhotoView,
  ArtifactScanStatusView,
  OrientationStatusView,
} from "@/lib/api/types";
import {
  ambiguousBadgeStyle,
  artifactChipListStyle,
  artifactChipStyle,
  coverBtnStyle,
  deletePhotoBtnStyle,
  markBtnStyle,
  mono,
  artifactScanLabel,
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
  /** Artifact scanning is explicit because each photo incurs a model call. PRD §5.12. */
  artifactScan: ArtifactScanStatusView | null;
  onScanArtifacts: () => void;
  onSetCover: (photoId: number) => void;
  onRotate: (photoId: number) => void;
  onDeletePhoto: (photoId: number) => void;
  /** Remove one item's box while preserving other detections on the photo. */
  onDeleteArtifact: (photoId: number, artifactId: number) => void;
  /** Open manual annotation for a selected catalog item. PRD §5.12. */
  onMarkPhoto: (photoId: number) => void;
}

/** Parent-owned photos and orientation state are shared with other admin actions. PRD §5.12. */
export function PhotoGrid({
  selected,
  photos,
  orientation,
  onCheckOrientation,
  artifactScan,
  onScanArtifacts,
  onSetCover,
  onRotate,
  onDeletePhoto,
  onDeleteArtifact,
  onMarkPhoto,
}: PhotoGridProps) {
  const checking = orientation?.state === "running";
  const scanning = artifactScan?.state === "running";

  return (
    <section className="md:flex-1">
      <h2 className="mb-3" style={sectionTitleStyle}>
        {selected ? `обложка дропа «${selected.title}»` : "выбери дроп"}
      </h2>
      {selected && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={onCheckOrientation} disabled={checking} style={secondaryBtnStyle}>
            {checking ? "проверяю поворот…" : "проверить поворот"}
          </button>
          {orientation && <span aria-live="polite" style={mono}>{orientationLabel(orientation)}</span>}
          {/* The button's name states its SCOPE: the scan takes the whole item catalogue at once
              but only this drop's frames. The old wording said nothing about scope and read as
              half of the neighbouring "all items in all drops". */}
          <button
            type="button"
            onClick={onScanArtifacts}
            disabled={scanning}
            style={secondaryBtnStyle}
            title="весь каталог предметов разом: вызов к платной модели на каждый кадр"
          >
            {scanning ? "ищу артефакты…" : "искать все предметы в этом дропе"}
          </button>
          {artifactScan && (
            <span aria-live="polite" style={mono}>{artifactScanLabel(artifactScan)}</span>
          )}
        </div>
      )}
      {selected && photos.length === 0 && <p style={mono}>в дропе нет кадров</p>}
      {selected && photos.length > 0 && (
        <>
          <p className="mb-3" style={mono}>кликни кадр, чтобы сделать его обложкой (она показывается в архиве); ↻ поворачивает кадр на 90°, ✕ удаляет кадр без возврата</p>
          <ul className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}>
            {photos.map((p) => (
              <li key={p.id}>
                {/* Corners are measured from the FRAME itself, not the list row: finding captions
                    sit below, and with a shared positioning context the buttons drifted onto
                    them (a grid row stretches to its tallest neighbour). */}
                <div style={{ position: "relative" }}>
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
                  {/* The manual rotate arrow sits over the frame's corner, separate from the
                      cover click (it is a sibling, not nested, so stopPropagation is not needed). */}
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
                  {/* Deleting one frame — the top right corner, opposite ↻, apart from the cover click. */}
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
                  {/* Manual marking — the bottom left corner, the only free one. It is disabled
                      during a scan: boxes placed while searching would be overwritten by it. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkPhoto(p.id);
                    }}
                    disabled={scanning}
                    aria-label="Разметить артефакты на кадре"
                    title="обвести предмет руками"
                    style={markBtnStyle}
                  >
                    {/* A racket rather than an abstract frame: a selection glyph at 15px read as
                        an empty plate, while the racket is the catalogue's first item and makes
                        the button's subject obvious. */}
                    <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>🏸</span>
                  </button>
                  {/* The model could not decide which way is up — the frame awaits a manual arrow. */}
                  {p.orientation === "ambiguous" && (
                    <span
                      title="LLM не определилась с верхом — проверь кадр"
                      style={{ ...ambiguousBadgeStyle, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <Icon name="help" size={12} />
                    </span>
                  )}
                </div>
                {/* What was found on the frame (§5.12), as chips rather than one button: there can
                    be several findings, and picking one by name beats picking by position. */}
                {p.artifacts && p.artifacts.length > 0 && (
                  <ul style={artifactChipListStyle}>
                    {p.artifacts.map((a) => (
                      <li key={a.artifactId}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteArtifact(p.id, a.artifactId);
                          }}
                          disabled={scanning}
                          title={`убрать «${a.name}» с этого кадра`}
                          aria-label={`Убрать ${a.name} с кадра`}
                          style={artifactChipStyle}
                        >
                          <span>{a.name}</span>
                          <Icon name="close" size={11} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
