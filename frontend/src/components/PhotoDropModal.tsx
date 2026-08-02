"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { getDrop } from "@/lib/api/client";
import { padHighlight } from "@/lib/artifactHighlight";
import { mediaUrl } from "@/lib/api/media";
import type { FilmPhotoView } from "@/lib/api/types";
import { Icon } from "./Icon";
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
 *
 * Загрузка кадров — **blur-up**: сразу виден крошечный `thumbUrl` (размытый, он лёгкий и обычно
 * уже в кэше борда), полноразмерный `imageUrl` грузится `loading="lazy"` (только видимое) и по
 * `onLoad` резко «наводится на резкость» поверх размытого. Размытый thumb остаётся непрозрачной
 * подложкой (не гаснет) — так во время проявления полного кадра сквозь него не мелькает фон
 * тайла. Никакой «доливки по чуть-чуть»: кадр не появляется из пустоты (см. [BlurUpPhoto]).
 */
export function PhotoDropModal({ dropId, title, monthLabel, onClose }: PhotoDropModalProps) {
  const { phase, data } = useTileData<FilmPhotoView[]>(
    useCallback((signal) => getDrop(dropId, { signal }), [dropId]),
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
      className="modal-scale fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6"
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
        {/* Подложка «коробочки» + белая внутренняя рамка (§2.4) — как у TileShell:
            панель-модалка несёт .pixel-tile сама, элементы слоёв добавляем сами. */}
        <span className="pixel-slab" aria-hidden />
        <span className="pixel-lid" aria-hidden />
        <div className="mb-3 flex items-center justify-between">
          <div className="flex flex-col">
            <span style={{ fontSize: "var(--fs-modal-title)", color: "var(--text-primary)" }}>{title}</span>
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
            style={{ ...monoTertiary, cursor: "pointer", background: "none", border: "none", display: "inline-flex" }}
          >
            <Icon name="close" size={18} />
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
            {photos.map((p) => (
              <BlurUpPhoto key={p.imageUrl} photo={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const monoTertiary = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-modal-meta)",
  color: "var(--text-tertiary)",
} satisfies CSSProperties;

/**
 * Один кадр с blur-up-загрузкой: размытый `thumbUrl` виден сразу, полноразмерный `imageUrl`
 * грузится лениво и по готовности проступает поверх (кросс-фейд, thumb гаснет). `aspect-ratio`
 * из реальных `width/height` держит место кадра до загрузки — колонки не «прыгают». Если
 * размеров нет, обёртка просто обнимает контент. Уважает `prefers-reduced-motion` (без анимации
 * переходов — кадр появляется сразу по готовности).
 */
function BlurUpPhoto({ photo }: { photo: FilmPhotoView }) {
  const [loaded, setLoaded] = useState(false);
  const ratio = photo.width && photo.height ? `${photo.width} / ${photo.height}` : undefined;

  return (
    <div
      className="mb-1.5"
      style={{
        position: "relative",
        breakInside: "avoid",
        // Клип обязателен: `filter: blur()` на thumb расплывается ЗА границы элемента, и без
        // него кадры «светятся» ореолом по всему периметру. Подпись артефакта поэтому живёт
        // внутри рамки, а не под ней — обрезаться ей нечем.
        overflow: "hidden",
        background: "var(--bg-surface-muted)",
        borderRadius: "var(--radius-sm)",
        aspectRatio: ratio,
      }}
    >
      {/* Размытое превью — непрозрачная подложка: держит цвет/композицию всё время, пока
          проявляется полный кадр (не гасим, иначе в кросс-фейде мелькнёт фон тайла). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mediaUrl(photo.thumbUrl)}
        alt=""
        aria-hidden
        className="blur-up-thumb w-full"
        style={{ display: "block", borderRadius: "var(--radius-sm)" }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mediaUrl(photo.imageUrl)}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className="blur-up-full"
        data-loaded={loaded}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          borderRadius: "var(--radius-sm)",
        }}
      />
      {/* Найденные артефакты (§5.12). Позиция — в процентах: координаты приходят долями кадра,
          и кадр рендерится в разном размере, так что множитель задаёт вёрстка. */}
      {photo.artifacts?.map((a) => {
        // Рамка намеренно шире находки: показываем область, а не обводим предмет по краю.
        const r = padHighlight(a);
        return (
        <span
          key={a.artifactId}
          className="artifact-box"
          style={{
            left: `${r.x0 * 100}%`,
            top: `${r.y0 * 100}%`,
            width: `${r.width * 100}%`,
            height: `${r.height * 100}%`,
            // Сколько места от левого края рамки до правого края кадра — в долях ширины
            // рамки, потому что max-width подписи считается от неё. Дальше подпись
            // усекается многоточием и потому никогда не упирается в край кадра.
            ["--label-max" as string]: `${((1 - r.x0) / r.width) * 100}%`,
          }}
        >
          <span className="artifact-box__label">{a.name}</span>
        </span>
        );
      })}
    </div>
  );
}
