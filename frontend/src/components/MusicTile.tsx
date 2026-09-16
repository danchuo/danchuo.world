"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { readCache, writeCache } from "@/lib/api/cache";
import { getNowPlaying, getRecent } from "@/lib/api/client";
import { elapsedMs, formatClock, headSample, progressRatio } from "@/lib/musicProgress";
import { collapseConsecutiveRecent, formatPlayedAgo } from "@/lib/recentTracks";
import type { AlbumRef, ArtistRef, NowPlayingView, RecentTrackView, SourceRef, TrackView } from "@/lib/api/types";
import { Album, Artists, Cover, Marquee, NowPlayingCard, artistsStyle } from "./NowPlayingCard";
import { CoverPlate, SpotifyMark } from "./SpotifyMark";
import { TileShell, type TileState } from "./TileShell";
import { Icon } from "./Icon";

interface MusicTileProps {
  style?: CSSProperties;
  className?: string;
  /** How many recent tracks to fetch; they are shown only when nothing is playing. */
  recentLimit?: number;
  /** Poll period for now-playing, in ms (default ~25s, matching the backend cache TTL). */
  pollMs?: number;
}

/** How many recents to show while idle, i.e. with no track playing. */
const RECENT_WHEN_IDLE = 5;

/**
 * The owner's Spotify profile, the target of the word "Spotify". A constant rather than an API
 * field, because this is service attribution and not board content: Spotify requires metadata to
 * carry a mention AND a link back. The share `si` parameter is stripped — it marks an invite.
 */
const SPOTIFY_PROFILE_URL = "https://open.spotify.com/user/q7lxpi1rk0dipyt65pj5z2mc0";

/**
 * Slack (px) at the bottom of the recents list: a row must end above it or be hidden entirely —
 * better one song fewer than a clipped last one. 4px sufficed only while row metrics matched the
 * computed list height; on a device the row is slightly taller and half-letters showed. §7.1
 */
const FIT_MARGIN = 6;

/* Geometry of shrink-to-content (see [useIsomorphicLayoutEffect] in the component). */
const COVER = 44; // side of the now-playing cover
const COVER_GAP = 12; // gap-3 between the cover and the text
const CARD_PAD_X = 32; // TileShell horizontal padding (p-4 on both sides)
/* Cover side in a recents row. A wave may override it with its own rule, as it may the now-playing
   cover size, but the markup needs SOME number: without the attributes the picture would jump in
   height while loading. */
const RECENT_COVER = 30;
/* No narrower than this: the header line ("now playing" plus "Spotify") needs air. */
const MIN_CARD_W = 190;
/* Card width until the content is measured (loading or empty). Compact and centred rather than
   full-cell, or a fast reload flashes the SSR tile as a wide peach strip before the widget appears.
   `min(100%, …)` also holds in the pre-hydration SSR frame, where nothing is measured. */
const LOADING_W = 340;

/* useLayoutEffect warns during SSR of client components, so on the server we fall back to useEffect. */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Music snapshot for the cache copy (stale-while-revalidate, as the tiles on [useTileData] do). */
interface MusicSnapshot {
  now: NowPlayingView | null;
  recent: RecentTrackView[];
  /**
   * When the snapshot was written. The cache keeps its own timestamp but does not hand it out (see
   * `api/cache.ts`), and the playhead scale needs it as an ANCHOR: without it a copy read after a
   * reload would start twenty seconds behind and catch up in a jump.
   */
  at: number;
}
const MUSIC_CACHE_KEY = "music";

/**
 * Hides recent tracks that do not fit the container's height — four whole rows beat five
 * overlapping. The fitting is purely visual, with no React state: layout is measured and extra
 * `<li>` hidden imperatively, keeping their space so the measurement cannot oscillate. §7.1
 */
function useFitOverflow(signature: string): (el: HTMLUListElement | null) => void {
  // The element lives in state, not a ref: the list exists only while nothing plays and remounts
  // once a track ends. An effect keyed on the list's contents did not re-run then, so a fresh
  // `<ul>` came out unfitted. A callback ref makes the node itself the effect's dependency.
  const [el, setEl] = useState<HTMLUListElement | null>(null);

  useEffect(() => {
    if (!el) return;
    const apply = () => {
      const kids = Array.from(el.children) as HTMLElement[];
      if (kids.length === 0) return;
      // A row must fit WHOLLY, with slack: one whose bottom crosses the edge by a couple of pixels
      // reads as clipped text. The edge comes from `getBoundingClientRect`, not `clientHeight` —
      // that is an integer, and at fractional heights rounding voted "it fits".
      const box = el.getBoundingClientRect();
      const limit = el.clientHeight > 0 ? visibleBottom(el) - FIT_MARGIN : box.top + 1;
      let overflow = false;
      for (const kid of kids) {
        if (!overflow && kid.getBoundingClientRect().bottom <= limit) {
          kid.style.visibility = "";
        } else {
          overflow = true;
          kid.style.visibility = "hidden";
        }
      }
    };
    apply();
    // Recomputed not only when the list resizes but when the ROWS THEMSELVES change: the list is
    // absolute (inset-0) and its size does not follow its content, so an observer on the container
    // never sees a row that has grown — which is exactly the row that overflows.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    Array.from(el.children).forEach((kid) => ro?.observe(kid));
    // The first measurement uses the metrics of whatever font is painted now: until the web font
    // arrives the rows are measured in the fallback and "fit". Once it arrives the rows grow, and
    // without this recount the bottom one stays half past the edge (visible on a phone, not in tests).
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive) apply();
    });
    // Returning to the tab triggers a check measurement: in the background the browser may defer both
    // ResizeObserver and layout, and half a row must not be the first thing seen.
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") requestAnimationFrame(apply);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      ro?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [el, signature]);

  return setEl;
}

/**
 * The line down to which [el]'s content is actually VISIBLE: its own bottom, or that of the
 * nearest ancestor clipping it, whichever is higher. Its own bottom is not enough — a `min-height`
 * meant for the mobile stack outlived `min-h-0` in the bento and the tile clipped the last row.
 */
function visibleBottom(el: HTMLElement): number {
  let bottom = el.getBoundingClientRect().bottom;
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflowY = getComputedStyle(p).overflowY;
    if (overflowY === "hidden" || overflowY === "clip") {
      bottom = Math.min(bottom, p.getBoundingClientRect().bottom);
    }
  }
  return bottom;
}

/**
 * The live playhead: the server snapshot is the anchor and the client clock provides motion. It
 * ticks once a second and ONLY while playing. The ticker restarts on every poll answer, so client
 * clock drift never accumulates — a fresh snapshot zeroes it roughly every 20 seconds.
 */
function useHeadPosition(
  now: NowPlayingView | null,
  /** The moment [now] is dated by: `Date.now()` of a live reply, or the timestamp of a cached copy. */
  nowAt: number,
): { elapsed: number | null; ratio: number | null } {
  const [clockMs, setClockMs] = useState(() => Date.now());

  const sample = useMemo(
    () => (now ? headSample(now.progressMs, nowAt, now.isPlaying, Date.now()) : null),
    [now, nowAt],
  );

  const running = sample?.isPlaying === true && sample.progressMs != null;
  useEffect(() => {
    setClockMs(Date.now());
    if (!running) return;
    const id = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running, sample]);

  const duration = now?.track?.durationMs ?? null;
  const elapsed = sample ? elapsedMs(sample, clockMs, duration) : null;
  return { elapsed, ratio: progressRatio(elapsed, duration) };
}

/**
 * A slow clock for the relative stamps in the recents list. The list itself loads once — a track
 * that finished an hour ago finished an hour ago — but "14 min" is a RELATIVE value and would sit
 * at fourteen forever on an open tab. The step is half the unit shown. PRD §5.5
 */
function useRecentClock(active: boolean): number {
  const [ms, setMs] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setMs(Date.now());
    const id = window.setInterval(() => setMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [active]);
  return ms;
}

/**
 * The card's natural height from its content, the vertical twin of shrink-to-content. Two places
 * where naively summing heights lies: the recents list is stretched by `flex: 1`, so it is
 * measured by ROWS down to the last VISIBLE one, and [FIT_MARGIN] must be added back. §7.1
 */

/**
 * The list's content height: from its top to the bottom of the last VISIBLE row. Rows hidden by
 * the fitting keep their space, which is what stops the measurement oscillating, but the card must
 * not grow to cover them — they cannot be seen anyway.
 */
function listContentHeight(list: Element): number {
  const top = list.getBoundingClientRect().top;
  let bottom = top;
  for (const row of Array.from(list.children) as HTMLElement[]) {
    if (row.style.visibility === "hidden") continue;
    bottom = Math.max(bottom, row.getBoundingClientRect().bottom);
  }
  return bottom - top;
}

function naturalCardHeight(body: HTMLElement): number {
  const card = body.closest(".pixel-tile, .muted-tile");
  if (!card) return 0;
  const gap = parseFloat(getComputedStyle(body).rowGap) || 0;
  let sum = 0;
  let shown = 0;
  for (const el of Array.from(body.children) as HTMLElement[]) {
    const cs = getComputedStyle(el);
    if (cs.display === "none") continue;
    const list = el.querySelector("ul");
    const h = list ? listContentHeight(list) + FIT_MARGIN : el.getBoundingClientRect().height;
    sum += h + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
    shown += 1;
  }
  if (shown === 0) return 0;
  const chrome = card.getBoundingClientRect().height - body.getBoundingClientRect().height;
  return sum + gap * (shown - 1) + chrome;
}

/** The mono style is static, so it is kept outside the component. */
const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

/** Static styles live outside the render, so they are not rebuilt on every frame. */
// The album sits close to the artists (less air), the source further from the album (more).
const sourceStyle = { color: "var(--text-tertiary)", fontSize: "var(--fs-music-meta)", marginTop: 7 } satisfies CSSProperties;
/**
 * Body of the now-playing block. The height is NOT fixed — Spotify moved into the header corner and
 * is no longer below — so the block grows into the freed vertical. The cover is pinned to the top
 * (`items-start` on the row), so it does not shift when the track changes.
 */

/** Artists sit slightly away from the title; between the album and them no gap is needed. */

/** Human-readable source label by Spotify context type. */
const SOURCE_LABEL: Record<string, string> = {
  playlist: "плейлист",
  artist: "артист",
  collection: "любимое",
  show: "подкаст",
};



/** A small square cover, rendered pixelated in the spirit of wave 01. */

/** The album as a link line, when present and neither a single nor same-named — the backend filters. */

/**
 * The playback source as a link line: "{type}: {name}", in a marquee when long. With no name it is
 * simply "{type} ↗".
 */
function Source({ source }: { source: SourceRef }) {
  const label = SOURCE_LABEL[source.type] ?? "источник";
  return (
    <Marquee style={sourceStyle}>
      <a href={source.url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
        {source.name ? (
          `${label}: ${source.name}`
        ) : (
          <>
            {label} <Icon name="external" size={11} />
          </>
        )}
      </a>
    </Marquee>
  );
}

/** The "now playing" block: cover plus track, artists, album and source, all of them links. */
function NowPlaying({
  track,
  source,
  sourceRef,
  sourceClipped,
  onCoverError,
}: {
  track: TrackView;
  source: SourceRef | null;
  /** Ref to the source plate (playlist), used to measure whether the tile's bottom edge clips it. */
  sourceRef: RefObject<HTMLDivElement | null>;
  /** The plate is clipped ⇒ hide it visually while the data still loads and the space is held. */
  sourceClipped: boolean;
  /** The cover did not arrive from the CDN, and the tile rearranges itself for that (DESIGN §7.1). */
  onCoverError: () => void;
}) {
  return (
    <NowPlayingCard
      track={track}
      testId="now-playing"
      coverFallback={<CoverPlate seed={track.url ?? track.title} size={COVER} />}
      onCoverError={onCoverError}
    >
      {/* The source plate (a playlist; drawn when a single has no album of its own). It is always
          in the DOM, but if the tile's bottom edge would cut it we hide it with visibility, so the
          space is kept and the measurement does not oscillate. */}
      {source && (
        <div
          ref={sourceRef}
          className="music-source"
          style={sourceClipped ? { visibility: "hidden" } : undefined}
        >
          <Source source={source} />
        </div>
      )}
    </NowPlayingCard>
  );
}

/**
 * The music tile, Spotify's live layer. It fetches on its own, independently of the selected day:
 * now-playing is polled on an interval, the poll stops in a hidden tab and refreshes immediately
 * on return. Playing shows the track, otherwise the recents list, otherwise a quiet empty.
 */
export function MusicTile({ style, className, recentLimit = RECENT_WHEN_IDLE, pollMs = 20_000 }: MusicTileProps) {
  const [state, setState] = useState<TileState>("loading");
  const [now, setNow] = useState<NowPlayingView | null>(null);
  // A snapshot's date travels with it: a live reply is dated by receipt, a copy by its own write.
  const [nowAt, setNowAt] = useState(() => Date.now());
  const [recent, setRecent] = useState<RecentTrackView[]>([]);
  // The initial load is flagged in a ref: polling now-playing must not disturb shared state.
  const loaded = useRef(false);

  const pollNow = useCallback((signal?: AbortSignal) => {
    return getNowPlaying({ signal })
      .then((data) => {
        const at = Date.now();
        setNow(data);
        setNowAt(at);
        // Keep now-playing fresh in the cache copy; the poll leaves recents alone, taken from the copy.
        const prev = readCache<MusicSnapshot>(MUSIC_CACHE_KEY);
        writeCache<MusicSnapshot>(MUSIC_CACHE_KEY, { now: data, recent: prev?.recent ?? [], at });
      })
      .catch(() => {
        /* the poll stays quiet: one failure must not drop an already rendered tile */
      });
  }, []);

  const loadAll = useCallback((signal?: AbortSignal) => {
    // Seeded from the last good copy, which survives a reload or a rate limit, so no loader flashes;
    // the live now-playing poll above refreshes it quickly.
    if (!loaded.current) {
      const cached = readCache<MusicSnapshot>(MUSIC_CACHE_KEY);
      if (cached) {
        setNow(cached.now);
        // A copy is dated by ITS OWN write rather than by the read, or the scale would start twenty
        // seconds behind and catch up in a jump (see [headSample]).
        setNowAt(cached.at ?? Date.now());
        setRecent(cached.recent);
        loaded.current = true;
        setState("loaded");
      } else {
        setState("loading");
      }
    }
    return Promise.all([getNowPlaying({ signal }), getRecent(recentLimit, { signal })])
      .then(([np, rec]) => {
        const at = Date.now();
        setNow(np);
        setNowAt(at);
        setRecent(rec);
        loaded.current = true;
        setState("loaded");
        writeCache<MusicSnapshot>(MUSIC_CACHE_KEY, { now: np, recent: rec, at });
      })
      .catch((err) => {
        if (signal?.aborted) return;
        // With a copy already on screen, keep it rather than blanking the tile into an error.
        if (!loaded.current) setState("error");
        throw err;
      });
  }, [recentLimit]);

  useEffect(() => {
    const ctrl = new AbortController();
    loadAll(ctrl.signal).catch(() => {});
    // Poll only while the tab is visible (PRD §5.5): a background tab burns requests for
    // nobody. On return the tile refreshes immediately, so a forgotten tab never shows a
    // stale track longer than one poll tick.
    let id: number | null = null;
    const start = () => {
      if (id === null) id = window.setInterval(() => pollNow(ctrl.signal), pollMs);
    };
    const stop = () => {
      if (id !== null) {
        window.clearInterval(id);
        id = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else {
        pollNow(ctrl.signal);
        start();
      }
    };
    if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      ctrl.abort();
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadAll, pollNow, pollMs]);

  const retry = useCallback(() => {
    loaded.current = false;
    loadAll().catch(() => {});
  }, [loadAll]);

  const playing = now?.track ?? null;
  // The playhead is live: between polls it is advanced from the clock (PRD §5.5).
  const { elapsed, ratio } = useHeadPosition(now, nowAt);
  // Consecutive identical recents collapse into a single row (PRD §5.5).
  const collapsedRecent = useMemo(() => collapseConsecutiveRecent(recent), [recent]);
  // A track playing ⇒ recents are hidden: the tile is small and nothing may overlap.
  const showRecent = !playing && collapsedRecent.length > 0;
  const isEmpty = !playing && !showRecent;
  // Clock for the "time ago" labels: it ticks only while the list is on screen.
  const recentNow = useRecentClock(showRecent);
  /* Which cover ADDRESS failed to load, rather than a bare "broken" flag: a track change brings a new
     url, the comparison stops matching, and the tile returns to its normal look by itself. */
  const [brokenArt, setBrokenArt] = useState<string | null>(null);

  // Hide recents that do not fit by height (DESIGN §7.1). The signature of the set restarts the
  // fitting when the tracks change, not only when their number does.
  const recentSig = collapsedRecent.map((r) => r.track.url ?? r.track.title).join("|");
  const recentRef = useFitOverflow(recentSig);

  // Horizontal shrink-to-content: a narrow track description hugs the text and centres in the
  // cell, a wide one keeps full width. Natural width comes from the shrink-wrapped text rows, whose
  // `scrollWidth` is independent of the card. The cell is measured on the WRAPPER, or it loops.
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // The source plate (playlist) hides itself if the tile's bottom edge clips it (PRD §5.5).
  const sourceRef = useRef<HTMLDivElement>(null);
  const [frameW, setFrameW] = useState(0);
  const [frameH, setFrameH] = useState(0);
  const [naturalW, setNaturalW] = useState(0);
  const [naturalH, setNaturalH] = useState(0);
  const [sourceClipped, setSourceClipped] = useState(false);

  const measure = useCallback(() => {
    const frame = frameRef.current;
    if (frame) {
      const box = frame.getBoundingClientRect();
      setFrameW(box.width);
      setFrameH(box.height);
    }
    const c = contentRef.current;
    if (!c) {
      setNaturalW(0);
      setNaturalH(0);
      setSourceClipped(false);
      return;
    }
    let max = 0;
    c.querySelectorAll<HTMLElement>(".marquee-inner, .fit-measure").forEach((el) => {
      if (el.scrollWidth > max) max = el.scrollWidth;
    });
    setNaturalW(max > 0 ? max + (playing ? COVER + COVER_GAP : 0) : 0);
    setNaturalH(naturalCardHeight(c));
    // Is the source plate clipped by the bottom of the content (the tile's clip)? Its bottom is
    // measured against the bottom of the overflow-hidden column; in jsdom everything is zero, which
    // reads as not clipped, so the plate stays visible in tests.
    const src = sourceRef.current;
    setSourceClipped(
      src != null && src.getBoundingClientRect().bottom > c.getBoundingClientRect().bottom + 1,
    );
  }, [playing]);

  // A synchronous measurement before paint: the shrunk width is computed in the same frame that
  // commits the loaded content, so a cache load paints already shrunk with no width jump. The content
  // signature restarts the measurement on a track or list change; in jsdom geometry is zero.
  const contentSig = playing ? `np:${playing.url ?? playing.title}` : `re:${recentSig}`;
  useIsomorphicLayoutEffect(() => {
    measure();
  }, [measure, state, isEmpty, contentSig]);

  // The font arrives AFTER the first measurement and breaks shrinking silently: measured in the
  // fallback, the card comes out narrower than the real font needs and a long row is clipped with
  // room to spare. ResizeObserver cannot help — a font swap changes neither cell nor content.
  useEffect(() => {
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts?.ready) return; // jsdom and old engines — live with the first measurement
    let alive = true;
    fonts.ready.then(() => {
      if (alive) measure();
    });
    return () => {
      alive = false;
    };
  }, [measure, state, isEmpty, contentSig]);

  // ResizeObserver keeps the measurement alive for both the cell's outer width and the content's
  // size, so the card re-shrinks when a track changes in the background. No loop: natural width
  // comes from `max-content` rows and does not depend on the card, so the answer repeats.
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return; // jsdom tests have no ResizeObserver
    const ro = new ResizeObserver(() => measure());
    if (frameRef.current) ro.observe(frameRef.current);
    if (contentRef.current) ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [measure, state, isEmpty]);

  // Shrink to the content but never below MIN_CARD_W nor wider than the cell, centring in what is
  // left. Until the content is measured a compact default width is used rather than the full cell,
  // so no peach strip flashes.
  const shrinkW =
    naturalW > 0 && frameW > 0
      ? Math.min(frameW, Math.max(Math.ceil(naturalW) + CARD_PAD_X, MIN_CARD_W))
      : null;
  const cardWidth: CSSProperties["width"] =
    shrinkW ?? (frameW > 0 ? Math.min(frameW, LOADING_W) : `min(100%, ${LOADING_W}px)`);

  /* Vertical twin of the shrink: the value is always computed but by default nobody reads it
     (`.music-card` stays `height: 100%`). A wave that wants a content-height card picks the variable
     up in its own skin, just as PRIME cancels the horizontal shrink. */
  const shrinkH = naturalH > 0 && frameH > 0 ? Math.min(frameH, Math.ceil(naturalH)) : null;

  // The tile's mode is a hook for the skin (§10.2): PRIME's black plate and Obscura's cover
  // backdrop exist only under a playing or paused track, while the recents list stays as it was.
  // The attribute sits on the wrapper so one selector reaches both the tile and its insides.
  const mode = playing ? (now?.isPlaying ? "playing" : "paused") : showRecent ? "recent" : "quiet";
  const coverUrl = playing?.albumImageUrl ?? null;
  /* Whether there is ANYTHING to show as a cover. A separate hook from the mode: "playing" and "has a
     picture" are different questions, and a wave whose cover carries the whole composition (Obscura)
     has to rearrange when the CDN does not serve one. The recents list arrives here the same way. */
  const artMissing = coverUrl == null || brokenArt === coverUrl;

  return (
    // The wrapper keeps the cell's full footprint; the card inside may be narrower and is centred.
    <div
      ref={frameRef}
      data-music-mode={mode}
      data-music-art={artMissing ? "missing" : "ok"}
      style={{
        ...style,
        // The card's width arrives as a VARIABLE rather than an inline style on the tile: a wave's
        // skin may cancel shrink-to-content (`width: 100%`), which it could not do against inline
        // without `!important`. The value is the same, only the delivery changes.
        "--music-card-w": typeof cardWidth === "number" ? `${cardWidth}px` : cardWidth,
        "--music-card-h": shrinkH != null ? `${shrinkH}px` : "100%",
        // The playing track's cover is material for the skin (DESIGN §10.2): Obscura lays it as the
        // widget's ground. A wave that does not want it pays nothing for the variable.
        ...(artMissing ? null : { "--music-cover": `url("${coverUrl}")` }),
      } as CSSProperties}
      className={`tile-frame t-music-vars ${className ?? ""}`}
    >
      <TileShell
        state={state === "loaded" && isEmpty ? "empty" : state}
        emptyText="ничего не играет"
        onRetry={retry}
        ariaLabel="Музыка"
        className="music-card"
        // Full-card ground: off by default (common.css); a wave switches it on in its own skin and
        // decides what is drawn on it.
        backdrop={
          <>
            {/* The frame fill: the same cover, stretched and blurred. A wave showing the cover
                WHOLE (`contain`) leaves margins around a square in a rectangular tile, and the
                blurred copy closes them with the cover's own colour. */}
            <span className="music-art-fill" aria-hidden />
            <span className="music-art" aria-hidden />
            {/* The same link as on the cover mark, but over the frame itself: a wave with the cover
                stretched across the tile has no mark to click. The layer is off by default. */}
            {playing?.url && (
              <a
                className="music-art-link"
                href={playing.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Открыть «${playing.title}» в Spotify`}
              />
            )}
          </>
        }
        // Width is ALWAYS set, so there is no auto-to-px jump, but WITHOUT a transition: the card
        // carries `filter: drop-shadow`, and WebKit does not clean up after a shrinking composited
        // layer — every frame left a band of its shadow (docs/pitfalls.md). No height here either:
      >
      {state === "loaded" && !isEmpty && (
        <div ref={contentRef} className="music-body flex h-full flex-col gap-1 overflow-hidden">
          {/* The status left, Spotify's attribution right, in one row: it frees vertical space for
              the recent list. */}

          {/* The row's type and colour live IN THE CLASS, not inline: a skin cannot override an
              inline style without `!important`, and a wave changes both here. */}
          <div className="music-status-row">
            <span>{playing ? (now?.isPlaying ? "сейчас играет" : "на паузе") : "недавно"}</span>
            {/* The service attribution: a word plus a mark. The mark is hidden by default and a
                wave turns it on (see [SpotifyMark]); the word stays under any wave, because
                Spotify metadata must travel with a link and a mention of the service. */}
            <a
              className="spotify-credit"
              href={SPOTIFY_PROFILE_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Профиль danchuo в Spotify"
            >
              <SpotifyMark />
              Spotify
            </a>
          </div>

          {playing && (
            <NowPlaying
              track={playing}
              source={now?.source ?? null}
              sourceRef={sourceRef}
              sourceClipped={sourceClipped}
              onCoverError={() => setBrokenArt(playing.albumImageUrl)}
            />
          )}

          {/* The playhead scale. Like the service mark, it is off by default. The fraction travels
              in a variable, so a skin need only colour the bar. */}
          {playing && (
            <div
              className="music-progress"
              style={{ "--music-progress": `${(ratio ?? 0) * 100}%` } as CSSProperties}
            >
              <span className="music-progress__t">{formatClock(elapsed)}</span>
              <span className="music-progress__track">
                <i className="music-progress__fill" />
              </span>
              <span className="music-progress__t">{formatClock(playing.durationMs)}</span>
            </div>
          )}

          {showRecent && (
            // A wrapper with a firm height and the list absolutely filling it, so the list's
            // clientHeight is always the available space rather than its content and the fitting
            // measures correctly. In the stack the wrapper's own height comes from its class.
            <div className="music-recent relative min-h-0 flex-1">
              <ul ref={recentRef} className="absolute inset-0 flex flex-col gap-0.5 overflow-hidden">
                {collapsedRecent.map((r, i) => {
                const ago = formatPlayedAgo(r.playedAt, recentNow);
                return (
                <li
                  key={`${r.track.url ?? r.track.title}-${r.playedAt ?? i}`}
                  data-testid="recent-track"
                  className="recent-row"
                >
                  {/* A row's cover is a wave layer, off by default. It is aria-hidden: the track's
                      name is in the same row, and the picture has nothing to add to it. */}
                  <span className="recent-cover" aria-hidden>
                    <Cover
                      url={r.track.albumImageUrl}
                      alt=""
                      size={RECENT_COVER}
                      fallback={<CoverPlate seed={r.track.url ?? r.track.title} size={RECENT_COVER} />}
                    />
                  </span>
                  {/* As in now-playing: it scrolls only if it did not fit by width (Marquee
                      measures the overflow itself). If it fits, it is an ordinary line. */}
                  <Marquee style={{ ...mono, color: "var(--text-secondary)", fontSize: "var(--fs-music-artists)" }}>
                    <span className="recent-title">
                      {r.track.url ? (
                        <a href={r.track.url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                          {r.track.title}
                        </a>
                      ) : (
                        r.track.title
                      )}
                    </span>
                    {r.track.artists.length > 0 && (
                      <>
                        {/* The separator is its own element rather than text inside the artists
                            line: a wave that puts the artist on a SEPARATE line hides just this
                            and does not rewrite the row's markup. */}
                        <span className="recent-sep" style={{ color: "var(--text-tertiary)" }}>
                          {" · "}
                        </span>
                        <span className="recent-artists" style={{ color: "var(--text-tertiary)" }}>
                          <Artists artists={r.track.artists} color="var(--text-tertiary)" />
                        </span>
                      </>
                    )}
                  </Marquee>
                  {/* The album and the age are wave layers too. Singles and self-titled releases
                      have no album: the backend already filters those out, so there is never an
                      empty column here — only a row without one. */}
                  {r.track.album && <span className="recent-album">{r.track.album.name}</span>}
                  {ago && <span className="recent-ago">{ago}</span>}
                  </li>
                );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
      </TileShell>
    </div>
  );
}
