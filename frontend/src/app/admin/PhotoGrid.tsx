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
  /** Поиск артефактов по кадрам дропа (§5.12) — только вручную: платная модель на каждый кадр. */
  artifactScan: ArtifactScanStatusView | null;
  onScanArtifacts: () => void;
  onSetCover: (photoId: number) => void;
  onRotate: (photoId: number) => void;
  onDeletePhoto: (photoId: number) => void;
  /** Снять с кадра рамку конкретного предмета — на кадре их может быть несколько. */
  onDeleteArtifact: (photoId: number, artifactId: number) => void;
  /** Открыть кадр в разметчике артефактов: там предмет выбирают и обводят мышью (§5.12). */
  onMarkPhoto: (photoId: number) => void;
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
          {/* Запуск/статус LLM-проверки поворота кадров (B9). */}
          <button type="button" onClick={onCheckOrientation} disabled={checking} style={secondaryBtnStyle}>
            {checking ? "проверяю поворот…" : "проверить поворот"}
          </button>
          {orientation && <span aria-live="polite" style={mono}>{orientationLabel(orientation)}</span>}
          {/* Название кнопки называет ОХВАТ: прогон берёт весь каталог предметов разом, но
              только по кадрам этого дропа. Прежнее «искать артефакты» об охвате молчало, и
              рядом с кнопкой «искать все во всех дропах» читалось как её половина. */}
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
                {/* Углы отсчитываются от САМОГО кадра, а не от строки списка: подписи находок
                    лежат ниже, и с общим контекстом позиционирования кнопки уезжали на них —
                    а у кадра без находок скатывались вниз за компанию (ряд грида тянется по
                    самому высокому соседу). */}
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
                  {/* Разметка руками — нижний-левый угол, единственный свободный (остальные три
                      заняты «?», ✕ и ↻). Занята прогоном: рамки, поставленные во время поиска,
                      тот же прогон и перезаписал бы. */}
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
                    {/* Ракетка, а не абстрактная рамка: глиф выделения на 15px читался пустой
                        плашкой, а ракетка — первый предмет каталога, и по ней сразу понятно,
                        что кнопка про артефакты. */}
                    <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>🏸</span>
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
                </div>
                {/* Что нашлось на кадре (§5.12). Чипами, а не одной кнопкой: находок может быть
                    несколько, и выбирать нужную удобнее по имени, чем по порядку. */}
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
