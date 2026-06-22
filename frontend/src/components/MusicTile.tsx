"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { readCache, writeCache } from "@/lib/api/cache";
import { getNowPlaying, getRecent } from "@/lib/api/client";
import type { AlbumRef, ArtistRef, NowPlayingView, RecentTrackView, SourceRef, TrackView } from "@/lib/api/types";
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

/** Снимок музыки для кэш-копии (stale-while-revalidate, как у тайлов на [useTileData]). */
interface MusicSnapshot {
  now: NowPlayingView | null;
  recent: RecentTrackView[];
}
const MUSIC_CACHE_KEY = "music";

/**
 * Прячет недавние треки, которые не влезают в контейнер по высоте (§7.1): лучше 4 целых,
 * чем 5 внахлёст. Меньше пятёрки = видимый сигнал владельцу, что плитке стало тесно.
 * Подгонка чисто визуальная (без React-state) — меряем раскладку и гасим лишние `<li>`
 * императивно (`visibility:hidden` сохраняет место, замер не осциллирует). [signature]
 * перезапускает подгонку при смене состава списка; ResizeObserver — при ресайзе плитки.
 * В jsdom (тесты) геометрия нулевая ⇒ ничего не прячем. Спан считаем по
 * `getBoundingClientRect` относительно контейнера — независимо от offsetParent.
 */
function useFitOverflow(signature: string): RefObject<HTMLUListElement | null> {
  const ref = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      const kids = Array.from(el.children) as HTMLElement[];
      if (kids.length === 0) return;
      const limit = el.getBoundingClientRect().top + el.clientHeight + 1;
      let overflow = false;
      for (const kid of kids) {
        // limit==1 (jsdom: всё по нулям) ⇒ всё «влезает», ничего не гасим.
        if (!overflow && kid.getBoundingClientRect().bottom <= limit) {
          kid.style.visibility = "";
        } else {
          overflow = true;
          kid.style.visibility = "hidden";
        }
      }
    };
    apply();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [signature]);

  return ref;
}

/** Mono-стиль — статичен, держим вне компонента. */
const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

/** Статичные стили — вне рендера, чтобы не пересобирать на каждый кадр. */
// Альбом прижат к исполнителям (меньше воздуха), источник отодвинут от альбома (больше).
const albumStyle = { color: "var(--text-tertiary)", fontSize: 11, marginTop: -2 } satisfies CSSProperties;
const sourceStyle = { color: "var(--text-tertiary)", fontSize: 11, marginTop: 7 } satisfies CSSProperties;
/**
 * Тело блока now-playing. Высоту НЕ фиксируем (Spotify ушёл в угол шапки, снизу его
 * больше нет) — блок растёт по контенту в освободившуюся вертикаль. Обложка прижата к
 * верху (`items-start` на строке), поэтому при смене трека не «ездит».
 */
const nowPlayingBody = { ...mono, lineHeight: 1.3 } satisfies CSSProperties;

/** Исполнители — чуть отодвинуты от названия (между альбомом и ними отступ не нужен). */
const artistsStyle = { color: "var(--text-secondary)", fontSize: 12, marginTop: 3 } satisfies CSSProperties;

/** Человекочитаемая метка источника по типу контекста Spotify. */
const SOURCE_LABEL: Record<string, string> = {
  playlist: "плейлист",
  artist: "артист",
  collection: "любимое",
  show: "подкаст",
};

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

/**
 * Источник воспроизведения строкой-ссылкой: «{тип}: {название}» (бегущей строкой, если
 * длинно). Без имени — просто «{тип} ↗».
 */
function Source({ source }: { source: SourceRef }) {
  const label = SOURCE_LABEL[source.type] ?? "источник";
  return (
    <Marquee style={sourceStyle}>
      <a href={source.url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
        {source.name ? `${label}: ${source.name}` : `${label} ↗`}
      </a>
    </Marquee>
  );
}

/** Блок «сейчас играет»: обложка + трек/исполнители/альбом + источник (всё со ссылками). */
function NowPlaying({ track, source }: { track: TrackView; source: SourceRef | null }) {
  return (
    <div data-testid="now-playing" className="flex min-w-0 items-start gap-3">
      <Cover url={track.albumImageUrl} alt={`Обложка: ${track.album?.name ?? track.title}`} />
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
          <div className="truncate">
            <Album album={track.album} />
          </div>
        )}
        {source && <Source source={source} />}
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
      .then((data) => {
        setNow(data);
        // Держим now-playing в кэш-копии свежим (recent опрос не трогает — берём из копии).
        const prev = readCache<MusicSnapshot>(MUSIC_CACHE_KEY);
        writeCache<MusicSnapshot>(MUSIC_CACHE_KEY, { now: data, recent: prev?.recent ?? [] });
      })
      .catch(() => {
        /* опрос тих: разовый сбой не роняет уже показанную плитку */
      });
  }, []);

  const loadAll = useCallback((signal?: AbortSignal) => {
    // Сидируем из последней удачной копии (переживает F5/рейтлимит) — без вспышки лоадера;
    // живой опрос now-playing сверху быстро её актуализирует.
    if (!loaded.current) {
      const cached = readCache<MusicSnapshot>(MUSIC_CACHE_KEY);
      if (cached) {
        setNow(cached.now);
        setRecent(cached.recent);
        loaded.current = true;
        setState("loaded");
      } else {
        setState("loading");
      }
    }
    return Promise.all([getNowPlaying({ signal }), getRecent(recentLimit, { signal })])
      .then(([np, rec]) => {
        setNow(np);
        setRecent(rec);
        loaded.current = true;
        setState("loaded");
        writeCache<MusicSnapshot>(MUSIC_CACHE_KEY, { now: np, recent: rec });
      })
      .catch((err) => {
        if (signal?.aborted) return;
        // Есть копия на экране — оставляем её, а не обнуляем в ошибку.
        if (!loaded.current) setState("error");
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

  // Прячем недавние, что не влезают по высоте (§7.1). Сигнатура состава — чтобы подгонка
  // перезапускалась при смене треков, а не только их числа.
  const recentRef = useFitOverflow(recent.map((r) => r.track.url ?? r.track.title).join("|"));

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

          {playing && <NowPlaying track={playing} source={now?.source ?? null} />}

          {showRecent && (
            // Обёртка с жёсткой высотой (flex-1 + relative), список — absolute inset-0:
            // так его clientHeight всегда равен доступному месту, а не контенту — замер
            // в useFitOverflow корректен и лишние треки реально прячутся (не наезжают).
            <div className="relative min-h-0 flex-1">
              <ul ref={recentRef} className="absolute inset-0 flex flex-col gap-0.5 overflow-hidden">
                {recent.map((r, i) => (
                <li
                  key={`${r.track.url ?? r.track.title}-${r.playedAt ?? i}`}
                  data-testid="recent-track"
                  style={{ lineHeight: 1.4 }}
                >
                  {/* Как и в now-playing: едет бегущей строкой, только если не влезло по
                      ширине (Marquee меряет overflow сам). Влезло — обычная строка. */}
                  <Marquee style={{ ...mono, color: "var(--text-secondary)", fontSize: 12 }}>
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
                  </Marquee>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </TileShell>
  );
}
