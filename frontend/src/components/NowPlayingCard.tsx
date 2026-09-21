"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { AlbumRef, ArtistRef, TrackView } from "@/lib/api/types";

/**
 * The "now playing" card, shared by the music tile and the quest map's podcast tooltip: both
 * answer the same question and must look the same. Purely presentational and SIZED FROM OUTSIDE,
 * because inside the SVG map the unit is a viewBox unit, not a CSS pixel. DESIGN §4.1
 */
const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

/**
 * How long to wait for a cover before treating it as missing. Three seconds is not "how long an
 * image takes" but "after which an empty space reads worse than a placeholder": a Spotify cover is
 * tens of kilobytes and arrives in a fraction of a second even on mobile.
 */
const COVER_WAIT_MS = 3000;

/** The album sits closer to the artists than the card's foot sits to the album. */
export const albumStyle = {
  color: "var(--text-tertiary)",
  fontSize: "var(--fs-music-meta)",
  marginTop: -2,
} satisfies CSSProperties;

/** Artists sit slightly away from the title. */
export const artistsStyle = {
  color: "var(--text-secondary)",
  fontSize: "var(--fs-music-artists)",
  marginTop: 3,
} satisfies CSSProperties;

/**
 * Body of the block. The height is NOT fixed — the block grows with its content — and the cover is
 * pinned to the top (`items-start` on the row), so it does not shift when the track changes.
 */
export const nowPlayingBody = {
  ...mono,
  lineHeight: 1.3,
  fontSize: "var(--fs-music-title)",
} satisfies CSSProperties;

/**
 * Marquee: the content travels only when it does not fit by width (overflow is measured through
 * ResizeObserver); when it fits, it is an ordinary line. Reduced motion stops the animation globally.
 * In jsdom, and anywhere without ResizeObserver, it renders statically and silently.
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
    <div ref={outer} className="marquee-clip" style={style}>
      <div
        ref={inner}
        className={`marquee-inner${scrolling ? " is-scrolling" : ""}`}
        style={
          scrolling
            ? ({
                "--marquee-shift": `-${shift}px`,
                // A tempo of ~25px/s and no shorter than 4s, so it reads rather than flickers.
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
 * A cover; [size] is given from outside — CSS pixels in a tile, viewBox units on the map.
 *
 * [height], separate from [size], is what books need: a book cover is portrait (~2:3) and in a
 * podcast's square it is either crushed or cut off at the spine. The default stays square.
 */
export function Cover({
  url,
  alt,
  size = 44,
  height = size,
  fallback,
  onError,
  className,
}: {
  url: string | null;
  alt: string;
  size?: number;
  height?: number;
  /** For a caller that sizes the picture in CSS; [size] then only feeds the fallback's geometry. */
  className?: string;
  /**
   * What replaces the picture when there is none or it failed to load. Unset gives an opaque
   * rectangle: the Spotify plate is supplied by whoever's picture came from there (a track, a podcast
   * episode), whereas on a book cover it would be a foreign mark.
   */
  fallback?: ReactNode;
  /** The picture failed to load. The tile needs to know: a wave may rearrange itself (DESIGN §7.1). */
  onError?: () => void;
}) {
  /* Not the fact that something broke but WHICH address broke: a track change brings a new url, the
     comparison stops matching, and the picture is tried again — with no effect to reset the flag and
     no risk that one bad frame buries every following one. */
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  /* …and separately, the address we simply did NOT WAIT for (see the note at COVER_WAIT_MS). */
  const [timedOutUrl, setTimedOutUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const broken = url != null && (failedUrl === url || timedOutUrl === url);

  /* A picture is not waited for forever. The browser reports an error only when a request has FAILED,
     while an unreachable CDN holds the connection open, `onerror` NEVER arrives, and an empty space is
     left where the agreed placeholder should be. */

  /* So "did not arrive in time" counts as the same refusal as an error, and the same fallback plate is
     shown. The wait is tracked BY ADDRESS, so a new track tries loading afresh and a picture that does
     arrive clears the wait. */
  const notifyError = useRef(onError);
  notifyError.current = onError;
  useEffect(() => {
    if (!url || loadedUrl === url || failedUrl === url || timedOutUrl === url) return;
    const id = window.setTimeout(() => {
      setTimedOutUrl(url);
      notifyError.current?.();
    }, COVER_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [url, loadedUrl, failedUrl, timedOutUrl]);

  if (!url || broken) {
    return (
      fallback ?? (
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
      )
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={url}
      alt={alt}
      className={className}
      width={size}
      height={height}
      // A cached picture can load before React attaches `onLoad`, so readiness is also checked on the
      // node itself (`complete` plus a non-zero width); otherwise the wait would count down over an
      // already painted cover.
      ref={(el) => {
        if (el?.complete && el.naturalWidth > 0) setLoadedUrl(url);
      }}
      onLoad={() => setLoadedUrl(url)}
      onError={() => {
        setFailedUrl(url);
        onError?.();
      }}
      // Cropped rather than squashed: a cover's proportions on screen must stay its own, even if a
      // book turns out not to be exactly 2:3.
      style={{ flexShrink: 0, borderRadius: "var(--radius-sm)", objectFit: "cover" }}
    />
  );
}

/** Artists separated by commas, each an attribution link to its own Spotify page. */
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

/** The album as a link line. */
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
  coverFallback,
  onCoverError,
  children,
}: {
  track: TrackView;
  /** Cover side in the context's units (by default the tile's 44 CSS pixels). */
  coverSize?: number;
  testId?: string;
  /** Fallback cover (see [Cover]); unset gives the former opaque rectangle. */
  coverFallback?: ReactNode;
  /** The cover failed to load — reported upwards (see [Cover]). */
  onCoverError?: () => void;
  /** Card footer: the source plate in a tile, the minutes line on a podcast card. */
  children?: ReactNode;
}) {
  const cover = (
    <Cover
      url={track.albumImageUrl}
      alt={`Обложка: ${track.album?.name ?? track.title}`}
      size={coverSize}
      fallback={coverFallback}
      onError={onCoverError}
    />
  );
  return (
    <div data-testid={testId} className="flex min-w-0 items-start gap-3">
      {/* The cover leads to the track, as in Spotify itself where the picture IS the open button.
          The link wraps the cover rather than replacing it: with no `url` the picture stays
          without a link instead of becoming a broken anchor. */}
      {track.url ? (
        <a
          className="np-cover-link"
          href={track.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Открыть «${track.title}» в Spotify`}
        >
          {cover}
        </a>
      ) : (
        cover
      )}
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
        {/* The album colour goes on the wrapper, not only the link: the ellipsis is drawn by the
            element that truncates the line and takes ITS colour. With the colour on the link alone
            a long album ended in white dots against grey text. */}
        {track.album && (
          <div className="np-album truncate fit-measure" style={{ color: albumStyle.color }}>
            <Album album={track.album} />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
