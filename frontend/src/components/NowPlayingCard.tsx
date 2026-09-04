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

/**
 * Сколько ждём обложку, прежде чем считать её неприехавшей (см. врез в [Cover]).
 *
 * Восемь секунд — не «сколько грузится картинка», а «после чего пустое место хуже заглушки».
 * Обложка Spotify весит десятки килобайт и на мобильной сети приезжает за секунды; всё, что
 * дольше, посетитель уже читает как дырку в виджете. Ждать меньше нельзя — заглушка мигала бы
 * на медленной сети вместо честной картинки.
 */
const COVER_WAIT_MS = 8000;

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
    <div ref={outer} className="marquee-clip" style={style}>
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
  fallback,
  onError,
}: {
  url: string | null;
  alt: string;
  size?: number;
  height?: number;
  /**
   * Чем заменить картинку, когда её нет или она не загрузилась. Не задан — прежний глухой
   * прямоугольник: у карточек книги и подкаста своя история, и подменять её музыкальной
   * плашкой Spotify им незачем.
   */
  fallback?: ReactNode;
  /** Картинка не загрузилась. Плитке это нужно знать: волна вправе перестроиться (§7.1). */
  onError?: () => void;
}) {
  /* Помним НЕ факт «сломалось», а КАКОЙ адрес сломался: при смене трека приезжает новый
     url, сравнение перестаёт совпадать, и картинка пробуется заново — без эффекта на сброс
     флага и без риска, что один битый кадр похоронит все следующие. */
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  /* …и отдельно — адрес, которого мы просто НЕ ДОЖДАЛИСЬ (см. врез у COVER_WAIT_MS). */
  const [timedOutUrl, setTimedOutUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const broken = url != null && (failedUrl === url || timedOutUrl === url);

  /* Ждём картинку не вечно. Ошибку браузер отдаёт, только когда запрос ЗАВЕРШИЛСЯ неудачей;
     недоступный CDN (у Spotify это `i.scdn.co` — с мобильной сети он у владельца просто не
     отвечает) держит соединение открытым, `onerror` не приходит НИКОГДА, и на месте обложки
     остаётся пустое место вместо оговорённой заглушки (замечание владельца с телефона).
     Поэтому «не приехала за отведённое время» — такой же отказ, как ошибка: показываем ту же
     запасную плашку. Ожидание считается по АДРЕСУ, поэтому новый трек пробует загрузку
     заново, а картинка, успевшая приехать, ожидание снимает. */
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
      width={size}
      height={height}
      // Картинка из кэша успевает загрузиться до того, как React повесит `onLoad`, — поэтому
      // готовность проверяем ещё и на самом узле (`complete` + ненулевая ширина), иначе
      // ожидание досчитало бы до конца над уже нарисованной обложкой.
      ref={(el) => {
        if (el?.complete && el.naturalWidth > 0) setLoadedUrl(url);
      }}
      onLoad={() => setLoadedUrl(url)}
      onError={() => {
        setFailedUrl(url);
        onError?.();
      }}
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
  coverFallback,
  onCoverError,
  children,
}: {
  track: TrackView;
  /** Сторона обложки в единицах контекста (по умолчанию 44 CSS-пикселя плитки). */
  coverSize?: number;
  testId?: string;
  /** Запасная обложка (см. [Cover]); не задана — прежний глухой прямоугольник. */
  coverFallback?: ReactNode;
  /** Обложка не загрузилась — сообщаем наверх (см. [Cover]). */
  onCoverError?: () => void;
  /** Подвал карточки: плашка источника у плитки, строка минут у карточки подкаста. */
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
      {/* Обложка ведёт на трек — как в самом Spotify, где картинка и есть кнопка «открыть».
          Ссылка оборачивает обложку, а не подменяет её: без `url` (бэк его не отдал) остаётся
          прежняя картинка без ссылки, а не битый якорь. */}
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
        {track.album && (
          <div className="np-album truncate fit-measure">
            <Album album={track.album} />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
