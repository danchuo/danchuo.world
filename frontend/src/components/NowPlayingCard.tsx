"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { AlbumRef, ArtistRef, TrackView } from "@/lib/api/types";

/**
 * Карточка «что играет» (PRD §M3) — обложка слева, справа название / исполнитель / альбом
 * и слот под низ. Общая для музыкальной плитки и для тултипа подкаста на карте-тропе: там и
 * там ответ на один и тот же вопрос, и выглядеть он должен одинаково (DESIGN §4.1).
 *
 * Компонент чисто презентационный и **размер берёт снаружи**. Тултип живёт внутри SVG-карты
 * (`foreignObject`), где единица — не CSS-пиксель, а единица viewBox: там кегли переопределяются
 * теми же токенами `--fs-music-*`, а обложка — через [coverSize]. Ничего не форкается.
 */
const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

/** Альбом прижат к исполнителям (меньше воздуха), чем низ карточки — к альбому. */
export const albumStyle = {
  color: "var(--text-tertiary)",
  fontSize: "var(--fs-music-meta)",
  marginTop: -2,
} satisfies CSSProperties;

/** Исполнители — чуть отодвинуты от названия. */
export const artistsStyle = {
  color: "var(--text-secondary)",
  fontSize: "var(--fs-music-artists)",
  marginTop: 3,
} satisfies CSSProperties;

/**
 * Тело блока. Высоту НЕ фиксируем — блок растёт по контенту; обложка прижата к верху
 * (`items-start` на строке), поэтому при смене трека не «ездит».
 */
export const nowPlayingBody = {
  ...mono,
  lineHeight: 1.3,
  fontSize: "var(--fs-music-title)",
} satisfies CSSProperties;

/**
 * Бегущая строка: содержимое едет, только если не влезло по ширине (замеряем overflow через
 * ResizeObserver). Влезло — обычная строка. Reduced-motion гасит анимацию глобально
 * (globals.css). В jsdom (тесты) и там, где ResizeObserver нет, — тихо рендерим статично.
 */
export function Marquee({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    const measure = () => {
      const o = outer.current;
      const i = inner.current;
      if (!o || !i) return;
      const overflow = i.scrollWidth - o.clientWidth;
      setShift(overflow > 2 ? overflow : 0);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [children]);

  const scrolling = shift > 0;
  return (
    <div ref={outer} className="overflow-hidden" style={style}>
      <div
        ref={inner}
        className={`marquee-inner${scrolling ? " is-scrolling" : ""}`}
        style={
          scrolling
            ? ({
                "--marquee-shift": `-${shift}px`,
                // Темп ~25px/с, не короче 4с — чтобы читалось, а не мельтешило.
                "--marquee-duration": `${Math.max(4, shift / 25)}s`,
              } as CSSProperties)
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Обложка; [size] задаётся снаружи — в плитке это CSS-пиксели, в карте единицы viewBox.
 *
 * [height] отдельно от [size] нужно книгам: обложка книги портретная (~2:3), и в квадрате
 * подкаста она либо сминается, либо срезается по корешку. По умолчанию квадрат — как было.
 */
export function Cover({
  url,
  alt,
  size = 44,
  height = size,
}: {
  url: string | null;
  alt: string;
  size?: number;
  height?: number;
}) {
  if (!url) {
    return (
      <div
        aria-hidden
        style={{
          width: size,
          height,
          flexShrink: 0,
          background: "var(--bg-surface-muted)",
          borderRadius: "var(--radius-sm)",
        }}
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={url}
      alt={alt}
      width={size}
      height={height}
      // Кадрируем, а не мнём: пропорции обложки на экране должны остаться её собственными,
      // даже если книга оказалась не ровно 2:3.
      style={{ flexShrink: 0, borderRadius: "var(--radius-sm)", objectFit: "cover" }}
    />
  );
}

/** Исполнители через запятую, каждый — ссылка-атрибуция на свою страницу в Spotify. */
export function Artists({ artists, color }: { artists: ArtistRef[]; color: string }) {
  return (
    <>
      {artists.map((a, i) => (
        <Fragment key={a.url ?? a.name}>
          {i > 0 && ", "}
          {a.url ? (
            <a href={a.url} target="_blank" rel="noreferrer" style={{ color }}>
              {a.name}
            </a>
          ) : (
            a.name
          )}
        </Fragment>
      ))}
    </>
  );
}

/** Альбом строкой-ссылкой. */
export function Album({ album }: { album: AlbumRef }) {
  return album.url ? (
    <a href={album.url} target="_blank" rel="noreferrer" style={albumStyle}>
      {album.name}
    </a>
  ) : (
    <span style={albumStyle}>{album.name}</span>
  );
}

export function NowPlayingCard({
  track,
  coverSize,
  testId,
  children,
}: {
  track: TrackView;
  /** Сторона обложки в единицах контекста (по умолчанию 44 CSS-пикселя плитки). */
  coverSize?: number;
  testId?: string;
  /** Подвал карточки: плашка источника у плитки, строка минут у карточки подкаста. */
  children?: ReactNode;
}) {
  return (
    <div data-testid={testId} className="flex min-w-0 items-start gap-3">
      <Cover url={track.albumImageUrl} alt={`Обложка: ${track.album?.name ?? track.title}`} size={coverSize} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden" style={nowPlayingBody}>
        <Marquee>
          {track.url ? (
            <a href={track.url} target="_blank" rel="noreferrer" style={{ color: "var(--text-primary)" }}>
              {track.title}
            </a>
          ) : (
            <span style={{ color: "var(--text-primary)" }}>{track.title}</span>
          )}
        </Marquee>
        {track.artists.length > 0 && (
          <Marquee style={artistsStyle}>
            <Artists artists={track.artists} color="var(--text-secondary)" />
          </Marquee>
        )}
        {track.album && (
          <div className="truncate fit-measure">
            <Album album={track.album} />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
