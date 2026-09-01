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
import { collapseConsecutiveRecent } from "@/lib/recentTracks";
import type { AlbumRef, ArtistRef, NowPlayingView, RecentTrackView, SourceRef, TrackView } from "@/lib/api/types";
import { Album, Artists, Cover, Marquee, NowPlayingCard, artistsStyle } from "./NowPlayingCard";
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

/**
 * Запас (px) у нижнего края списка недавних: строка обязана кончиться выше него, иначе гасим
 * её целиком — лучше на одну песню меньше, чем нижняя обрезанная (§7.1).
 *
 * 4px хватало ровно до тех пор, пока метрики строки совпадали с расчётом высоты списка. На
 * устройстве строка оказывается чуть выше расчётной, и нижняя вылезала на пару пикселей —
 * из-под края виджета торчала половина букв (замечание владельца с прода).
 */
const FIT_MARGIN = 6;

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
      // Требуем, чтобы строка влезала ЦЕЛИКОМ с небольшим запасом: строка, чей низ лишь на
      // пару пикселей заходит за край, визуально «подрезается» по тексту — лучше показать на
      // одну меньше, чем нижнюю обрезанную (§7.1). Край берём из `getBoundingClientRect`, а не
      // из `clientHeight`: тот целый, и на дробной высоте (кегль считается в `cqw`) округление
      // играло в пользу «влезает». В jsdom всё по нулям ⇒ запас не применяем (clientHeight==0),
      // иначе бы прятали всё; там ничего не гасим.
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
    // Пересчитываем не только на ресайзе списка, но и когда меняются САМИ строки: список
    // абсолютный (inset-0), его размер от содержимого не зависит, поэтому подросшая строка
    // наблюдателю на контейнере не видна вовсе — а именно она и вылезает за край.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    Array.from(el.children).forEach((kid) => ro?.observe(kid));
    // Первый замер идёт по метрикам того шрифта, что нарисован сейчас: пока веб-шрифт не
    // приехал, строки меряются фолбэком и «влезают». Приехал — строки подросли, и без этого
    // пересчёта нижняя остаётся наполовину за краем (видно на телефоне, не видно в тестах).
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive) apply();
    });
    return () => {
      alive = false;
      ro?.disconnect();
    };
  }, [signature]);

  return ref;
}

/**
 * До какой линии содержимое [el] вообще **видно**: его собственный низ либо низ ближайшего
 * предка, который его срезает, — что выше.
 *
 * Своего низа мало. Замер на живом борде: колонка плитки кончалась на 119.6px, а список висел
 * до 150.3 — его `min-height` (заведённый ради мобильного стека, где высоты не даёт никто) в
 * бенто перебивал `min-h-0` и не давал flex-элементу сжаться. Подгонка мерила свой низ, решала
 * «всё влезло», и нижнюю строку срезала сама плитка. Считаем по клипу — и тогда неважно, кто
 * именно и почему оказался короче: строку либо видно целиком, либо её нет.
 *
 * Скроллящиеся предки (`auto`/`scroll`) не считаются: их содержимое не потеряно, до него
 * доскроллят.
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

/** Mono-стиль — статичен, держим вне компонента. */
const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

/** Статичные стили — вне рендера, чтобы не пересобирать на каждый кадр. */
// Альбом прижат к исполнителям (меньше воздуха), источник отодвинут от альбома (больше).
const sourceStyle = { color: "var(--text-tertiary)", fontSize: "var(--fs-music-meta)", marginTop: 7 } satisfies CSSProperties;
/**
 * Тело блока now-playing. Высоту НЕ фиксируем (Spotify ушёл в угол шапки, снизу его
 * больше нет) — блок растёт по контенту в освободившуюся вертикаль. Обложка прижата к
 * верху (`items-start` на строке), поэтому при смене трека не «ездит».
 */

/** Исполнители — чуть отодвинуты от названия (между альбомом и ними отступ не нужен). */

/** Человекочитаемая метка источника по типу контекста Spotify. */
const SOURCE_LABEL: Record<string, string> = {
  playlist: "плейлист",
  artist: "артист",
  collection: "любимое",
  show: "подкаст",
};



/** Маленькая обложка-квадрат (пиксельный рендер в духе волны 01). */

/** Альбом строкой-ссылкой (если есть и не сингл/одноимённый — бэкенд уже отфильтровал). */

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
function NowPlaying({
  track,
  source,
  sourceRef,
  sourceClipped,
}: {
  track: TrackView;
  source: SourceRef | null;
  /** Ref на плашку источника (плейлист) — им меряем, обрезается ли она нижним краем плитки. */
  sourceRef: RefObject<HTMLDivElement | null>;
  /** Плашка обрезается ⇒ прячем её визуально (данные грузятся, место держим): §5.5. */
  sourceClipped: boolean;
}) {
  return (
    <NowPlayingCard track={track} testId="now-playing">
      {/* Плашка источника (плейлист — рисуется, когда трек-сингл без своего альбома). Она всегда
          в DOM (данные грузятся: задел под расширение виджета), но если нижний край плитки её
          обрезает — прячем через visibility (место сохраняется, замер не осциллирует). */}
      {source && (
        <div ref={sourceRef} style={sourceClipped ? { visibility: "hidden" } : undefined}>
          <Source source={source} />
        </div>
      )}
    </NowPlayingCard>
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
  // Плашка источника (плейлист) прячется, если её обрезает нижний край плитки (§5.5).
  const sourceRef = useRef<HTMLDivElement>(null);
  const [frameW, setFrameW] = useState(0);
  const [naturalW, setNaturalW] = useState(0);
  const [sourceClipped, setSourceClipped] = useState(false);

  const measure = useCallback(() => {
    const frame = frameRef.current;
    if (frame) setFrameW(frame.getBoundingClientRect().width);
    const c = contentRef.current;
    if (!c) {
      setNaturalW(0);
      setSourceClipped(false);
      return;
    }
    let max = 0;
    c.querySelectorAll<HTMLElement>(".marquee-inner, .fit-measure").forEach((el) => {
      if (el.scrollWidth > max) max = el.scrollWidth;
    });
    setNaturalW(max > 0 ? max + (playing ? COVER + COVER_GAP : 0) : 0);
    // Обрезается ли плашка источника нижним краем контента (клип плитки)? Меряем её низ против
    // низа overflow-hidden-колонки; в jsdom всё по нулям ⇒ не обрезано (плашка видима в тестах).
    const src = sourceRef.current;
    setSourceClipped(
      src != null && src.getBoundingClientRect().bottom > c.getBoundingClientRect().bottom + 1,
    );
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
    <div ref={frameRef} style={style} className={`tile-frame t-music-vars ${className ?? ""}`}>
      <TileShell
        state={state === "loaded" && isEmpty ? "empty" : state}
        emptyText="ничего не играет"
        onRetry={retry}
        ariaLabel="Музыка"
        // Ширина задана ВСЕГДА (нет скачка auto→px), но БЕЗ `transition` — карточка несёт
        // `filter: drop-shadow`, а WebKit не подчищает область, освобождённую сжимающимся
        // композитным слоем: каждый кадр перегона оставлял полосу своей тени, и под плиткой
        // вырастала гребёнка (docs/pitfalls.md). Здесь это било чаще всего — ширина едет на
        // КАЖДОЙ смене трека, а не однажды при загрузке.
        style={{ height: "100%", width: cardWidth, marginInline: "auto" }}
      >
      {state === "loaded" && !isEmpty && (
        <div ref={contentRef} className="flex h-full flex-col gap-1 overflow-hidden">
          {/* Статус слева, атрибуция Spotify справа в той же строке — освобождает
              вертикаль под список недавних (плитка низкая). */}
          <div
            className="flex items-center justify-between"
            style={{ ...mono, color: "var(--text-tertiary)", fontSize: "var(--fs-music-artists)" }}
          >
            <span>{playing ? (now?.isPlaying ? "сейчас играет" : "на паузе") : "недавно"}</span>
            <span style={{ fontSize: "var(--fs-music-source)" }}>Spotify</span>
          </div>

          {playing && (
            <NowPlaying
              track={playing}
              source={now?.source ?? null}
              sourceRef={sourceRef}
              sourceClipped={sourceClipped}
            />
          )}

          {showRecent && (
            // Обёртка с жёсткой высотой (flex-1 + relative), список — absolute inset-0:
            // так его clientHeight всегда равен доступному месту, а не контенту — замер
            // в useFitOverflow корректен и лишние треки реально прячутся (не наезжают).
            // Оборотная сторона: своей высоты у обёртки нет, поэтому в стеке (§8) её задаёт
            // min-height класса .music-recent — иначе список нулевой и треков не видно.
            <div className="music-recent relative min-h-0 flex-1">
              <ul ref={recentRef} className="absolute inset-0 flex flex-col gap-0.5 overflow-hidden">
                {collapsedRecent.map((r, i) => (
                <li
                  key={`${r.track.url ?? r.track.title}-${r.playedAt ?? i}`}
                  data-testid="recent-track"
                  style={{ lineHeight: 1.4 }}
                >
                  {/* Как и в now-playing: едет бегущей строкой, только если не влезло по
                      ширине (Marquee меряет overflow сам). Влезло — обычная строка. */}
                  <Marquee style={{ ...mono, color: "var(--text-secondary)", fontSize: "var(--fs-music-artists)" }}>
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
