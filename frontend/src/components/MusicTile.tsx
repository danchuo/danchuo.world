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
import type { AlbumRef, ArtistRef, NowPlayingView, RecentTrackView, SourceRef, TrackView } from "@/lib/api/types";
import { TileShell, type TileState } from "./TileShell";
import { Icon } from "./Icon";

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

/* Геометрия сжатия-к-контенту (см. [useIsomorphicLayoutEffect] в компоненте). */
const COVER = 44; // сторона обложки now-playing
const COVER_GAP = 12; // gap-3 между обложкой и текстом
const CARD_PAD_X = 32; // горизонтальные поля TileShell (p-4 с обеих сторон)
/* Не сжимаем уже этого: строке-шапке («сейчас играет» + «Spotify») нужен воздух. */
const MIN_CARD_W = 190;
/* Ширина карточки, пока контент не измерен (загрузка/пусто). Компактная и центрированная, а не
   во всю ячейку — иначе на быстром F5 SSR-плитка мигает широкой персиковой полосой до появления
   виджета. `min(100%, …)` держится и в пре-гидрационном SSR-кадре (без замера). */
const LOADING_W = 340;

/* useLayoutEffect ругается при SSR клиентских компонентов — на сервере падаем на useEffect. */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Идентичность недавнего трека для схлопывания: url, а без него — название + имена артистов. */
function recentKey(t: TrackView): string {
  return t.url ?? `${t.title} | ${t.artists.map((a) => a.name).join(", ")}`;
}

/**
 * Схлопывает **подряд** идущие одинаковые треки в один ряд (повтор трека, сыгранный сразу
 * после себя же), сохраняя первый — самый свежий — элемент серии (§5.5). Повторы «через один»
 * не трогаем: это отдельные прослушивания. Чистая функция — под юнит-тест.
 */
export function collapseConsecutiveRecent(recent: RecentTrackView[]): RecentTrackView[] {
  const out: RecentTrackView[] = [];
  let prevKey: string | null = null;
  for (const r of recent) {
    const key = recentKey(r.track);
    if (key === prevKey) continue;
    out.push(r);
    prevKey = key;
  }
  return out;
}

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
          <div className="truncate fit-measure">
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
 * опрашивается на интервале (под TTL кэша бэка); в скрытой вкладке опрос стоит,
 * при возврате на вкладку — немедленное обновление. Если трек играет — показываем его;
 * иначе — список недавних. Пусто («ничего не играет» / интеграция не подключена) —
 * тихое empty, без спец-ветки.
 */
export function MusicTile({ style, className, recentLimit = RECENT_WHEN_IDLE, pollMs = 20_000 }: MusicTileProps) {
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
  // Подряд идущие одинаковые недавние треки схлопываем в один ряд (§5.5).
  const collapsedRecent = useMemo(() => collapseConsecutiveRecent(recent), [recent]);
  // Играет трек ⇒ недавние не показываем (плитка маленькая, чтобы ничего не наезжало).
  const showRecent = !playing && collapsedRecent.length > 0;
  const isEmpty = !playing && !showRecent;

  // Прячем недавние, что не влезают по высоте (§7.1). Сигнатура состава — чтобы подгонка
  // перезапускалась при смене треков, а не только их числа.
  const recentSig = collapsedRecent.map((r) => r.track.url ?? r.track.title).join("|");
  const recentRef = useFitOverflow(recentSig);

  // Сжатие-к-контенту по горизонтали (как «последний дроп»): узкое описание трека ⇒ карточка
  // жмётся к тексту и центрируется в ячейке; широкое — держит полную ширину. Натуральную ширину
  // берём по строкам текста (`.marquee-inner`/`.fit-measure` — шринк-врап, их `scrollWidth`
  // равен ширине текста независимо от текущей ширины карточки) плюс обложка now-playing. Внешнюю
  // ширину ячейки меряем на обёртке (не на самой карточке — иначе замер зациклит наблюдатель).
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [frameW, setFrameW] = useState(0);
  const [naturalW, setNaturalW] = useState(0);

  const measure = useCallback(() => {
    const frame = frameRef.current;
    if (frame) setFrameW(frame.getBoundingClientRect().width);
    const c = contentRef.current;
    if (!c) {
      setNaturalW(0);
      return;
    }
    let max = 0;
    c.querySelectorAll<HTMLElement>(".marquee-inner, .fit-measure").forEach((el) => {
      if (el.scrollWidth > max) max = el.scrollWidth;
    });
    setNaturalW(max > 0 ? max + (playing ? COVER + COVER_GAP : 0) : 0);
  }, [playing]);

  // Синхронный замер до отрисовки: сжатая ширина считается в том же кадре, когда коммитится
  // загруженный контент, поэтому кэш-загрузка красится уже сжатой (без скачка ширины). Сигнатура
  // состава перезапускает замер при смене трека/списка. В jsdom геометрия нулевая ⇒ cardW=null.
  const contentSig = playing ? `np:${playing.url ?? playing.title}` : `re:${recentSig}`;
  useIsomorphicLayoutEffect(() => {
    measure();
  }, [measure, state, isEmpty, contentSig]);

  // ResizeObserver держит замер живым: внешняя ширина ячейки (ресайз окна, смена волны) И размер
  // контента — так карточка **пере**сжимается сама, когда трек обновился в фоне (поллинг) и стал
  // шире/уже. Петли нет: натуральная ширина берётся с `max-content`-строк и не зависит от ширины
  // карточки, поэтому вызванный сжатием ресайз контента даёт то же значение (React гасит no-op).
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return; // jsdom-тесты без ResizeObserver
    const ro = new ResizeObserver(() => measure());
    if (frameRef.current) ro.observe(frameRef.current);
    if (contentRef.current) ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [measure, state, isEmpty]);

  // Жмёмся к контенту, но не уже MIN_CARD_W и не шире ячейки; центрируемся в остатке. Пока контент
  // не измерен — компактная дефолт-ширина (не во всю ячейку), чтобы не мигала персиковая полоса.
  const shrinkW =
    naturalW > 0 && frameW > 0
      ? Math.min(frameW, Math.max(Math.ceil(naturalW) + CARD_PAD_X, MIN_CARD_W))
      : null;
  const cardWidth: CSSProperties["width"] =
    shrinkW ?? (frameW > 0 ? Math.min(frameW, LOADING_W) : `min(100%, ${LOADING_W}px)`);

  return (
    // Обёртка держит полный след ячейки; карточка внутри может быть у́же и центрируется.
    <div ref={frameRef} style={style} className={className}>
      <TileShell
        state={state === "loaded" && isEmpty ? "empty" : state}
        emptyText="ничего не играет"
        onRetry={retry}
        ariaLabel="Музыка"
        // Плавный перегон ширины на всех переходах (загрузка → трек → смена трека); reduced-motion
        // гасит его глобально в common.css. Ширина задана всегда — нет скачка auto→px.
        style={{ height: "100%", width: cardWidth, marginInline: "auto", transition: "width 180ms ease" }}
      >
      {state === "loaded" && !isEmpty && (
        <div ref={contentRef} className="flex h-full flex-col gap-1 overflow-hidden">
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
                {collapsedRecent.map((r, i) => (
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
    </div>
  );
}
