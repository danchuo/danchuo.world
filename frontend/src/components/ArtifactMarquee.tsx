"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { getArtifacts } from "@/lib/api/client";
import type { ArtifactView } from "@/lib/api/types";
import type { TileOrientation } from "@/lib/layout";
import { Icon } from "./Icon";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

interface ArtifactMarqueeProps {
  style?: CSSProperties;
  className?: string;
  /**
   * Направление ленты — задаётся волной через layout (`tiles.marquee.orientation`,
   * DESIGN §10.1). `vertical` — колонка, едет вверх; дефолт — горизонтальная строка.
   */
  orientation?: TileOrientation;
}

const RU_MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** «2026-01-15» → «15 января 2026» (парсим по частям — без tz-сдвига от `new Date`). */
function formatFirstMentioned(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${RU_MONTHS[m - 1]} ${y}`;
}

/** Поперечный габарит предмета в ленте (px). Меньше прежних 48 — по просьбе владельца. */
const ARTIFACT_SIZE = 40;
/** Габарит предмета ВДОЛЬ ленты (px) — страховка от предмета-полосы на всю плитку. */
const ARTIFACT_LONG = 120;
/**
 * Оптический вес предмета — сторона квадрата той же площади. Предметы равняются ИМ,
 * а не высотой: при равной высоте широкие очки занимают вдвое больше места, чем почти
 * квадратная мыльница, и читаются крупнее её. Взято так, чтобы ни один из предметов
 * набора не упирался в поперечный потолок ленты.
 */
const ARTIFACT_PRESENCE = 48;
/** Со скольких раз «длинная сторона / короткая» предмет считается вытянутым. */
const ELONGATED = 2;

export interface ArtifactBox {
  width: number;
  height: number;
  /** Повернуть на 90°: длинная сторона предмета смотрит поперёк ленты. */
  rotate: boolean;
}

/**
 * Габарит предмета в ленте (DESIGN §7.2). Два правила.
 *
 * **Набок — только с разрешения.** Вытянутый предмет, лежащий поперёк ленты, вырождается
 * в нитку (ракетка ~1:3.8 при поперечном габарите 40px даёт 11px), но класть набок можно
 * не всякий: у очков и мыльницы есть «правильная сторона», у ракетки её нет. Пропорцией
 * это не выводится, поэтому [rotatable] — свойство самого предмета (поле артефакта), по
 * умолчанию `false`: новый предмет показывается ровно так, как нарисован. Куда и насколько
 * поворачивать, по-прежнему решает геометрия картинки, а не запись в БД.
 *
 * **Предметы весят одинаково** — равная площадь, потом обрезка потолками ленты.
 */
export function artifactBox(
  ratio: number,
  vertical: boolean,
  rotatable: boolean = false,
  cross: number = ARTIFACT_SIZE,
  long: number = ARTIFACT_LONG,
): ArtifactBox {
  // Картинка ещё не измерилась / битая — считаем предмет квадратным (упрётся в потолок).
  const r = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const elongated = r >= ELONGATED || r <= 1 / ELONGATED;
  const longIsWidth = r >= 1;
  const rotate = rotatable && elongated && (vertical ? longIsWidth : !longIsWidth);
  // Экранная пропорция (после поворота стороны меняются местами).
  const eff = rotate ? 1 / r : r;

  // Равный оптический вес: w·h = presence², w/h = eff.
  let width = ARTIFACT_PRESENCE * Math.sqrt(eff);
  let height = ARTIFACT_PRESENCE / Math.sqrt(eff);
  // Обрезка потолками ленты — пропорционально, поэтому предмет не плющится.
  const k = Math.min(
    1,
    (vertical ? cross : long) / width,
    (vertical ? long : cross) / height,
  );
  width *= k;
  height *= k;
  return { width, height, rotate };
}

/**
 * Предмет в самой ленте. Пропорцию берём с картинки (`naturalWidth/Height`) на её загрузке —
 * до замера предмет считается квадратным по потолку ленты. Поворот не двигает место в потоке,
 * поэтому габарит держит обёртка, а у самой картинки стороны меняются местами.
 */
function ArtifactThumb({
  src,
  alt,
  vertical,
  rotatable,
}: {
  src: string;
  alt: string;
  vertical: boolean;
  rotatable: boolean;
}) {
  const [ratio, setRatio] = useState(0);
  const box = artifactBox(ratio, vertical, rotatable);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: box.width,
        height: box.height,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalHeight > 0) setRatio(img.naturalWidth / img.naturalHeight);
        }}
        style={{
          width: box.rotate ? box.height : box.width,
          height: box.rotate ? box.width : box.height,
          objectFit: "contain",
          transform: box.rotate ? "rotate(90deg)" : undefined,
        }}
      />
    </span>
  );
}

/**
 * Лента артефактов (M) — PRD §5.8, DESIGN §7.2. Предметы PNG/GIF + подпись; в самой строке
 * даты нет. **Клик по предмету → небольшое меню-карточка**: увеличенная картинка + название +
 * (мельче) дата первого упоминания. `Esc`/клик вне закрывают.
 *
 * Лента едет ТОЛЬКО когда предметы не влезают в тайл (тогда контент дублируется для бесшовной
 * петли -50%). Один-два предмета помещаются ⇒ строка не дублируется и не анимируется — иначе
 * единственный предмет двоился бы, а на отзуме из-под края выглядывала бы «третья» копия.
 */
export function ArtifactMarquee({ style, className, orientation = "horizontal" }: ArtifactMarqueeProps) {
  const vertical = orientation === "vertical";
  const { phase, data, retry } = useTileData<ArtifactView[]>(
    useCallback((signal) => getArtifacts({ signal }), []),
    "artifacts",
  );
  const artifacts = data ?? [];
  const isEmpty = phase === "loaded" && artifacts.length === 0;
  const [active, setActive] = useState<number | null>(null);

  // Едет ли лента: одна копия контента шире/выше тайла ⇒ дублируем и анимируем (§7.2).
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [scrolling, setScrolling] = useState(false);

  useEffect(() => {
    const box = containerRef.current;
    const track = trackRef.current;
    if (!box || !track) return;
    const measure = () => {
      // Когда дублировано (scrolling), натуральный размер одной копии = половина трека.
      const factor = scrolling ? 2 : 1;
      const content = (vertical ? track.scrollHeight : track.scrollWidth) / factor;
      const avail = vertical ? box.clientHeight : box.clientWidth;
      setScrolling(content > avail + 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return; // jsdom-тесты без ResizeObserver
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(track);
    return () => ro.disconnect();
  }, [vertical, scrolling, artifacts.length]);

  // Меню — модалка по центру экрана; закрытие по Esc (клик по фону/повторный клик — ниже).
  useEffect(() => {
    if (active === null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setActive(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  // Темп ~ по числу артефактов, не быстрее 20с — чтобы читалось, а не мельтешило.
  const duration = `${Math.max(20, artifacts.length * 6)}s`;
  const activeArtifact = active !== null ? artifacts[active] : null;
  // Дублируем контент только когда лента едет; иначе одна копия (без двоения).
  const items = scrolling ? [...artifacts, ...artifacts] : artifacts;

  return (
    <TileShell
      state={isEmpty ? "empty" : phase}
      emptyText="нет артефактов"
      onRetry={retry}
      label="артефакты"
      ariaLabel="Артефакты"
      style={style}
      className={className}
    >
      {phase === "loaded" && !isEmpty && (
        <div
          ref={containerRef}
          className={`tile-frame relative flex h-full overflow-hidden ${
            vertical ? "justify-center" : scrolling ? "items-center" : "items-center justify-center"
          }`}
        >
          <div
            ref={trackRef}
            className={`artifact-track${vertical ? " artifact-track--vertical" : ""}${scrolling ? " is-scrolling" : ""}`}
            style={{ "--artifact-duration": duration } as CSSProperties}
          >
            {items.map((a, i) => {
              const idx = i % artifacts.length;
              const dup = i >= artifacts.length;
              return (
                <button
                  key={`${a.name}-${dup ? "dup" : "main"}`}
                  type="button"
                  data-artifact-btn={dup ? undefined : ""}
                  /* Копия — только для бесшовной петли: её не озвучивают и в неё не таб-ходят.
                     А вот КЛИК у неё такой же, как у оригинала: мимо зрителя едут обе копии,
                     и без этого предметы «нажимались через раз» — каждый второй проход ленты
                     был мёртвым. */
                  aria-hidden={dup || undefined}
                  tabIndex={dup ? -1 : 0}
                  onFocus={dup ? undefined : () => setActive(idx)}
                  onClick={() => setActive((cur) => (cur === idx ? null : idx))}
                  className={`${vertical ? "my-3" : "mx-4"} inline-flex flex-col items-center gap-1 align-middle`}
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                >
                  {a.imageUrl ? (
                    <ArtifactThumb
                      src={a.imageUrl}
                      alt={a.name}
                      vertical={vertical}
                      rotatable={a.rotatable === true}
                    />
                  ) : (
                    <span
                      aria-hidden
                      style={{
                        width: ARTIFACT_SIZE,
                        height: ARTIFACT_SIZE,
                        background: "var(--bg-surface-muted)",
                        borderRadius: "var(--radius-sm)",
                      }}
                    />
                  )}
                  <span className="t-artifact-pop" style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                    {a.name}
                  </span>
                </button>
              );
            })}
          </div>

        </div>
      )}

      {/* Меню артефакта — небольшая модалка ПО ЦЕНТРУ ЭКРАНА (как §5.12/§7.6): затемнённый
          фон, панель `.pixel-tile`, закрытие по Esc / клику по фону. Картинка + название +
          (мельче) дата первого упоминания. Портал в body: `.pixel-tile` тайла несёт `filter`
          (containing block для fixed) и `overflow-hidden` — без портала fixed прибился бы к
          плитке и клипался, а не центрировался по экрану. */}
      {activeArtifact && typeof document !== "undefined" && createPortal(
        <div
          className="modal-scale fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(33, 26, 22, 0.55)" }}
          onClick={() => setActive(null)}
        >
          <div
            data-artifact-menu=""
            role="dialog"
            aria-modal="true"
            aria-label={activeArtifact.name}
            className="pixel-tile relative flex flex-col items-center p-8"
            style={{ minWidth: 340, maxWidth: "min(94vw, 580px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Подложка «коробочки» + белая рамка (§2.4) — меню несёт .pixel-tile сам. */}
            <span className="pixel-slab" aria-hidden />
            <span className="pixel-lid" aria-hidden />
            {/* Крестик закрытия — правый верхний угол. */}
            <button
              type="button"
              onClick={() => setActive(null)}
              aria-label="Закрыть"
              className="tap-target absolute right-2 top-2"
              style={{ color: "var(--text-tertiary)", cursor: "pointer", background: "none", border: "none", display: "inline-flex" }}
            >
              <Icon name="close" size={18} />
            </button>
            {activeArtifact.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeArtifact.imageUrl}
                alt={activeArtifact.name}
                /* Обе стороны — ТОЛЬКО потолки, размер считает браузер по пропорции предмета.
                   Жёсткая ширина + `maxHeight` плющила вытянутые предметы (ракетка ~1:3.8:
                   высота упиралась в потолок, а ширина оставалась заданной). Ширина капается
                   в px (широкие очки задают размер ею) ⇒ расширение панели добавляет ПУСТОТУ
                   по бокам; высокий потолок высоты — доля экрана, чтобы вытянутый предмет был
                   виден целиком и не вылезал за меню на низком окне. */
                style={{ maxWidth: "min(100%, 400px)", maxHeight: "min(44vh, 420px)", objectFit: "contain", marginTop: 32 }}
              />
            ) : (
              <span
                aria-hidden
                style={{
                  width: 160,
                  height: 160,
                  background: "var(--bg-surface-muted)",
                  borderRadius: "var(--radius-sm)",
                }}
              />
            )}
            {/* Подпись отделена от картинки бо́льшим зазором; кегль — от `.modal-scale` (vw),
                а не контейнерные `t-artifact-*` (в портале контейнера нет ⇒ схлопнулись бы). */}
            <div className="flex flex-col items-center gap-2" style={{ marginTop: 96 }}>
              {/* Короткие вертикальные штрихи-акценты глиной над и под названием (декор §2.4). */}
              <span aria-hidden style={{ width: 2, height: 18, background: "var(--border-tile)" }} />
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)", fontSize: "clamp(20px, calc(12px + 0.7vw), 32px)" }}>
                {activeArtifact.name}
              </span>
              <span aria-hidden style={{ width: 2, height: 18, background: "var(--border-tile)" }} />
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", fontSize: "var(--fs-modal-meta)" }}>
                {formatFirstMentioned(activeArtifact.firstMentionedOn)}
              </span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </TileShell>
  );
}
