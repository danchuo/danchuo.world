"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { getNowPlaying, getRecent } from "@/lib/api/client";
import type { AlbumRef, ArtistRef, NowPlayingView, RecentTrackView, TrackView } from "@/lib/api/types";
import { TileShell, type TileState } from "./TileShell";

interface MusicTileProps {
  style?: CSSProperties;
  className?: string;
  /** Сколько недавних треков подтянуть (показываем их только когда ничего не играет). */
  recentLimit?: number;
  /** Период опроса now-playing, мс (по умолчанию ~25с — под TTL кэша бэка). */
  pollMs?: number;
}

/** Сколько недавних показывать в простое (когда нет играющего трека). */
const RECENT_WHEN_IDLE = 5;

/** Mono-стиль — статичен, держим вне компонента. */
const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

/** Статичные стили — вне рендера, чтобы не пересобирать на каждый кадр. */
const albumStyle = { color: "var(--text-tertiary)", fontSize: 11 } satisfies CSSProperties;
/**
 * Высота блока now-playing фиксирована: при смене трека (опрос) появление/исчезновение
 * строки альбома НЕ должно дёргать раскладку — иначе обложка «ездит», а лого Spotify
 * съезжает. Вмещает заголовок + исполнителей + альбом; лишнее обрезается.
 */
const nowPlayingBody = { ...mono, height: 54, lineHeight: 1.25 } satisfies CSSProperties;

/** Исполнители — чуть отодвинуты от названия (между альбомом и ними отступ не нужен). */
const artistsStyle = { color: "var(--text-secondary)", fontSize: 12, marginTop: 3 } satisfies CSSProperties;

/**
 * Бегущая строка: содержимое едет, только если не влезло по ширине (замеряем overflow
 * через ResizeObserver). Влезло — обычная строка. Reduced-motion гасит анимацию глобально
 * (globals.css). В jsdom (тесты) ResizeObserver нет — тихо рендерим статично.
 */
function Marquee({ children, style }: { children: ReactNode; style?: CSSProperties }) {
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

/** Исполнители через запятую, каждый — ссылка-атрибуция на свою страницу в Spotify. */
function Artists({ artists, color }: { artists: ArtistRef[]; color: string }) {
  return (
    <>
      {artists.map((a, i) => (
        <Fragment key={`${a.url ?? a.name}-${i}`}>
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

/** Маленькая обложка-квадрат (пиксельный рендер в духе волны 01). */
function Cover({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    return (
      <div
        aria-hidden
        style={{ width: 44, height: 44, flexShrink: 0, background: "var(--bg-surface-muted)", borderRadius: "var(--radius-sm)" }}
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} width={44} height={44} style={{ flexShrink: 0, borderRadius: "var(--radius-sm)" }} />;
}

/** Альбом строкой-ссылкой (если есть и не сингл/одноимённый — бэкенд уже отфильтровал). */
function Album({ album }: { album: AlbumRef }) {
  return album.url ? (
    <a href={album.url} target="_blank" rel="noreferrer" style={albumStyle}>
      {album.name}
    </a>
  ) : (
    <span style={albumStyle}>{album.name}</span>
  );
}

/** Блок «сейчас играет»: обложка + трек-ссылка + исполнители-ссылки + (опц.) альбом-ссылка. */
function NowPlaying({ track }: { track: TrackView }) {
  return (
    <div data-testid="now-playing" className="flex min-w-0 items-center gap-3">
      <Cover url={track.albumImageUrl} alt={`Обложка: ${track.album?.name ?? track.title}`} />
      {/* Фиксированная высота + центрирование: смена трека не дёргает раскладку. */}
      <div className="flex min-w-0 flex-1 flex-col justify-center overflow-hidden" style={nowPlayingBody}>
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
          <div className="truncate">
            <Album album={track.album} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Плитка музыки (M) — живой слой Spotify (PRD §M3, DESIGN §7). Тянет данные сама
 * (независимо от выбранного дня) с собственными per-tile состояниями: now-playing
 * опрашивается на интервале (под TTL кэша бэка). Если трек играет — показываем его;
 * иначе — список недавних. Пусто («ничего не играет» / интеграция не подключена) —
 * тихое empty, без спец-ветки.
 */
export function MusicTile({ style, className, recentLimit = RECENT_WHEN_IDLE, pollMs = 25_000 }: MusicTileProps) {
  const [state, setState] = useState<TileState>("loading");
  const [now, setNow] = useState<NowPlayingView | null>(null);
  const [recent, setRecent] = useState<RecentTrackView[]>([]);
  // Первичная загрузка отмечена в ref: опрос now-playing не должен дёргать общий state.
  const loaded = useRef(false);

  const pollNow = useCallback((signal?: AbortSignal) => {
    return getNowPlaying({ signal })
      .then((data) => setNow(data))
      .catch(() => {
        /* опрос тих: разовый сбой не роняет уже показанную плитку */
      });
  }, []);

  const loadAll = useCallback((signal?: AbortSignal) => {
    if (!loaded.current) setState("loading");
    return Promise.all([getNowPlaying({ signal }), getRecent(recentLimit, { signal })])
      .then(([np, rec]) => {
        setNow(np);
        setRecent(rec);
        loaded.current = true;
        setState("loaded");
      })
      .catch((err) => {
        if (signal?.aborted) return;
        setState("error");
        throw err;
      });
  }, [recentLimit]);

  useEffect(() => {
    const ctrl = new AbortController();
    loadAll(ctrl.signal).catch(() => {});
    const id = window.setInterval(() => pollNow(ctrl.signal), pollMs);
    return () => {
      ctrl.abort();
      window.clearInterval(id);
    };
  }, [loadAll, pollNow, pollMs]);

  const retry = useCallback(() => {
    loaded.current = false;
    loadAll().catch(() => {});
  }, [loadAll]);

  const playing = now?.track ?? null;
  // Играет трек ⇒ недавние не показываем (плитка маленькая, чтобы ничего не наезжало).
  const showRecent = !playing && recent.length > 0;
  const isEmpty = !playing && !showRecent;

  return (
    <TileShell
      state={state === "loaded" && isEmpty ? "empty" : state}
      emptyText="ничего не играет"
      onRetry={retry}
      ariaLabel="Музыка"
      style={style}
      className={className}
    >
      {state === "loaded" && !isEmpty && (
        <div className="flex h-full flex-col gap-1 overflow-hidden">
          {/* Статус слева, атрибуция Spotify справа в той же строке — освобождает
              вертикаль под список недавних (плитка низкая). */}
          <div
            className="flex items-center justify-between"
            style={{ ...mono, color: "var(--text-tertiary)", fontSize: 12 }}
          >
            <span>{playing ? (now?.isPlaying ? "сейчас играет" : "на паузе") : "недавно"}</span>
            <span style={{ fontSize: 10 }}>Spotify</span>
          </div>

          {playing && <NowPlaying track={playing} />}

          {showRecent && (
            <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
              {recent.map((r, i) => (
                <li
                  key={`${r.track.url ?? r.track.title}-${r.playedAt ?? i}`}
                  data-testid="recent-track"
                  className="truncate"
                  style={{ ...mono, color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.4 }}
                >
                  {r.track.url ? (
                    <a href={r.track.url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                      {r.track.title}
                    </a>
                  ) : (
                    r.track.title
                  )}
                  {r.track.artists.length > 0 && (
                    <span style={{ color: "var(--text-tertiary)" }}>
                      {" · "}
                      <Artists artists={r.track.artists} color="var(--text-tertiary)" />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </TileShell>
  );
}
