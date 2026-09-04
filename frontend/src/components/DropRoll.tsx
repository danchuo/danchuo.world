"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { boxesAt } from "@/lib/artifactHighlight";
import { mediaUrl } from "@/lib/api/media";
import {
  nearestFrameIndex,
  scrollFromPointer,
  sliderGeometry,
  startFrameIndex,
  stripPadding,
  wheelStep,
} from "@/lib/dropRoll";
import type { FilmPhotoView } from "@/lib/api/types";
import { ArtifactBoxes } from "./ArtifactBoxes";
import { Icon } from "./Icon";

/** Сколько соседних кадров держать предзагруженными в полном размере с каждой стороны. */
const PRELOAD_AHEAD = 3;
/** Пол ширины ползунка: за него надо уметь схватиться мышью (px). */
const MIN_THUMB = 28;

/**
 * Галерея дропа в редакции **«плёнка»** (DESIGN §7.5): дроп — одна катушка, и читается он как
 * катушка. Крупный кадр сверху, под ним лента миниатюр, под лентой — засечка на каждый кадр,
 * по которым едут как по таймлайну. Соседи в ленте уходят в прогрессивный блюр — тот же приём,
 * которым волна одевает борд.
 *
 * **Позиция ленты — единственное состояние.** Крупный кадр и засечки читают её прокрутку
 * (`nearestFrameIndex`), а не держат свой индекс: два источника истины разошлись бы на первом
 * же инерционном докрутe. Клик по засечке и стрелки двигают саму ленту, а не «текущий кадр».
 *
 * **Крайние кадры достижимы** — у ленты боковой запас в полокна (`stripPadding`): при
 * `scroll-snap-align: center` без него лента доезжает до края, но по центру встаёт кадр,
 * отстоящий от конца на полокна, и последние кадры выбрать нельзя вовсе.
 *
 * Находки на крупном кадре подсвечиваются, как в мозаике: рамка акцентом волны, карточка
 * предмета — по наведению. А кнопка лупы открывает кадр во весь экран **чистым**: полный
 * размер и ни одной рамки поверх (решение владельца — разглядывать снимок, а не разметку).
 */
export function DropRoll({
  photos,
  startAt,
  onZoom,
}: {
  photos: FilmPhotoView[];
  /** Адрес кадра, с которого открыть плёнку (кадр из плитки); нет — открываем с первого. */
  startAt?: string | null;
  /** Открыть кадр во весь экран (чистым, без находок). */
  onZoom: (index: number, trigger: HTMLElement) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const rollRef = useRef<HTMLDivElement>(null);
  const initial = useMemo(() => startFrameIndex(photos, startAt), [photos, startAt]);
  const [current, setCurrent] = useState(initial);
  // Какие полные кадры уже в кэше браузера. Держим в ref + счётчике, а не в state-множестве:
  // сюда пишет предзагрузка соседей, и перерисовка нужна только чтобы снять размытую подложку.
  const readyRef = useRef<Set<string>>(new Set());
  const [, bumpReady] = useState(0);
  // Последний ЗАКАЗАННЫЙ кадр: плавная прокрутка едет несколько кадров отрисовки, и цепочка
  // щелчков колеса, считающая от видимого кадра, топталась бы на месте. Сбрасывается, когда
  // лента доехала, и когда за неё берутся рукой (тогда заказ уже неактуален).
  const targetRef = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  // Боковой запас считается по ЖИВОЙ ширине окна ленты: она зависит от ширины модалки, а та —
  // от экрана. До первого замера запас 0 — лента просто стоит с начала, без скачка.
  const [pad, setPad] = useState(0);

  const scrollTo = useCallback((index: number, smooth: boolean) => {
    const strip = stripRef.current;
    const item = strip?.children[index] as HTMLElement | undefined;
    if (!strip || !item) return;
    strip.scrollTo({
      left: item.offsetLeft + item.offsetWidth / 2 - strip.clientWidth / 2,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  // Запас — от ширины окна и ширины миниатюры (её задаёт CSS волны, поэтому меряем, а не
  // берём число из кода). Пересчитывается на ресайзе: модалка резиновая.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const measure = () => {
      const item = strip.children[0] as HTMLElement | undefined;
      setPad(stripPadding(strip.clientWidth, item?.offsetWidth ?? 0));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return; // jsdom-тесты без ResizeObserver
    const ro = new ResizeObserver(measure);
    ro.observe(strip);
    return () => ro.disconnect();
  }, [photos.length]);

  // Открываем на кадре из плитки — без анимации: это стартовая позиция, а не переход. Ждём
  // запаса: до него у крайних кадров нет места встать по центру, и прокрутка легла бы не туда.
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || pad === 0) return;
    jumped.current = true;
    scrollTo(initial, false);
  }, [initial, pad, scrollTo]);

  // Ползунок ведём стилями через ref, а не через state: он двигается на КАЖДОМ кадре прокрутки,
  // и гонять ради этого перерисовку всей галереи (37 миниатюр) незачем.
  const syncSlider = useCallback(() => {
    const strip = stripRef.current;
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!strip || !track || !thumb) return;
    const g = sliderGeometry(
      strip.scrollLeft,
      strip.clientWidth,
      strip.scrollWidth,
      track.clientWidth,
      MIN_THUMB,
    );
    thumb.style.width = `${g.width}px`;
    thumb.style.transform = `translateX(${g.offset}px)`;
  }, []);

  // Прокрутка ленты → текущий кадр. Считаем в rAF: события скролла идут пачками, а нам нужен
  // один ответ на кадр отрисовки.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    let raf: number | null = null;
    const onScroll = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const mid = strip.scrollLeft + strip.clientWidth / 2;
        const centers = Array.from(strip.children).map((el) => {
          const item = el as HTMLElement;
          return item.offsetLeft + item.offsetWidth / 2;
        });
        const next = nearestFrameIndex(centers, mid);
        if (targetRef.current === next) targetRef.current = null; // доехали — заказ исполнен
        syncSlider();
        setCurrent(next);
      });
    };
    strip.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      strip.removeEventListener("scroll", onScroll);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [photos.length, syncSlider]);

  // Первая отрисовка и ресайз: ползунок обязан стоять правильно ДО первой прокрутки.
  useEffect(() => {
    syncSlider();
  }, [syncSlider, pad, photos.length]);

  // Колесо и трекпад листают плёнку — по кадру за щелчок, и **в любом месте панели галереи**
  // (просьба владельца), а не только над лентой: рука уже на кадре, и требовать прицелиться в
  // ленту незачем. Слушаем ПАНЕЛЬ модалки, а не окно: над затемнённым фоном по краям экрана
  // колесо не должно двигать кадры — там мышь уже не в галерее.
  //
  // Сколько кадров стоит одно событие, решает [wheelStep] — чистая функция: мышиный щелчок
  // равен одному кадру, мелкие дельты трекпада копятся до порога.
  useEffect(() => {
    const host = (rollRef.current?.closest('[role="dialog"]') as HTMLElement | null) ?? rollRef.current;
    if (!host) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaX === 0 && e.deltaY === 0) return;
      e.preventDefault();
      const step = wheelStep(e.deltaX, e.deltaY, e.deltaMode, acc);
      acc = step.acc;
      const dir = step.dir;
      if (dir === 0) return;
      // Считаем от последнего ЗАКАЗАННОГО кадра, а не от видимого: плавная прокрутка ещё едет,
      // и цепочка щелчков иначе топталась бы на месте.
      const base = targetRef.current ?? current;
      const next = Math.min(photos.length - 1, Math.max(0, base + dir));
      targetRef.current = next;
      scrollTo(next, true);
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [current, photos.length, scrollTo]);

  // Полные кадры соседей — заранее. Иначе при листании крупный кадр стоит размытой миниатюрой,
  // пока едет web-версия: «заметно плохое качество» (замечание владельца). Окно узкое: тянуть
  // все 37 кадров вперёд значило бы выкачивать дроп целиком ради одного просмотренного.
  useEffect(() => {
    const from = Math.max(0, current - PRELOAD_AHEAD);
    const to = Math.min(photos.length - 1, current + PRELOAD_AHEAD);
    const dying: HTMLImageElement[] = [];
    for (let i = from; i <= to; i += 1) {
      const src = photos[i]?.imageUrl;
      if (!src || readyRef.current.has(src)) continue;
      const img = new Image();
      img.onload = () => {
        readyRef.current.add(src);
        bumpReady((n) => n + 1);
      };
      img.src = mediaUrl(src);
      dying.push(img);
    }
    return () => {
      // Уезжая, снимаем обработчики: догрузка кадра, который уже никому не нужен, не должна
      // будить перерисовку размонтированной галереи.
      dying.forEach((img) => {
        img.onload = null;
      });
    };
  }, [current, photos]);

  // Стрелки листают плёнку. Слушаем окно, а не ленту: фокус чаще на кнопке лупы или на самой
  // модалке, и требовать «сперва ткни в ленту» значило бы прятать управление.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const base = targetRef.current ?? current;
      const next = Math.min(photos.length - 1, Math.max(0, base + (e.key === "ArrowRight" ? 1 : -1)));
      targetRef.current = next;
      scrollTo(next, true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, photos.length, scrollTo]);

  // Перетаскивание и клик по дорожке — один обработчик: клик это перетаскивание длиной ноль,
  // и разводить их значило бы писать ту же формулу дважды. Пока тащим, прокрутка не плавная
  // (`auto`): плавность здесь спорила бы с рукой — лента догоняла бы палец с отставанием.
  const dragTrack = useCallback(
    (clientX: number) => {
      const strip = stripRef.current;
      const track = trackRef.current;
      const thumb = thumbRef.current;
      if (!strip || !track || !thumb) return;
      const r = track.getBoundingClientRect();
      strip.scrollLeft = scrollFromPointer(
        clientX - r.left,
        track.clientWidth,
        thumb.offsetWidth,
        strip.clientWidth,
        strip.scrollWidth,
      );
    },
    [],
  );

  const onTrackPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault(); // иначе тянется выделение текста, и жест обрывается на первом же пикселе
    targetRef.current = null; // рука важнее заказанного колесом кадра
    e.currentTarget.setPointerCapture(e.pointerId);
    dragTrack(e.clientX);
  };

  const photo = photos[current] ?? photos[0];
  const boxes = photo?.artifacts ?? [];
  const ratio = photo?.width && photo?.height ? `${photo.width} / ${photo.height}` : undefined;
  const zoomRef = useRef<HTMLButtonElement>(null);

  // Какие находки под курсором — та же механика, что в мозаике: считаем по точке, а не по
  // `:hover` рамки (рамки пересекаются, и ховер достаётся только верхней).
  const [under, setUnder] = useState<number[]>([]);
  useEffect(() => setUnder([]), [current]);
  const trackPointer = (e: ReactMouseEvent<HTMLElement>) => {
    if (boxes.length === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const ids = boxesAt(boxes, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height).map(
      (b) => b.artifactId,
    );
    setUnder((cur) => {
      const kept = cur.filter((id) => ids.includes(id));
      const next = [...kept, ...ids.filter((id) => !kept.includes(id))];
      return cur.length === next.length && cur.every((v, i) => v === next[i]) ? cur : next;
    });
  };

  if (!photo) return null;

  return (
    <div className="drop-roll" ref={rollRef}>
      <div className="drop-roll__hero">
        {/* Сцена повторяет пропорцию кадра: только тогда рамки находок, заданные процентами,
            попадают туда же, куда попали бы на самом снимке. Размеров нет (старый дроп до
            замера) — сцена просто обнимает картинку, и находок на ней не рисуем. */}
        <span
          className="drop-roll__stage"
          style={ratio ? { aspectRatio: ratio } : undefined}
          onMouseMove={trackPointer}
          onMouseLeave={() => setUnder([])}
        >
          {/* Миниатюра — подложка только пока полного кадра НЕТ в кэше. Соседи предзагружены,
              поэтому при листании её обычно не видно вовсе: кадр сразу полного качества. */}
          {!readyRef.current.has(photo.imageUrl) && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={mediaUrl(photo.thumbUrl)} alt="" aria-hidden className="drop-roll__thumb" />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={photo.imageUrl}
            src={mediaUrl(photo.imageUrl)}
            alt=""
            decoding="async"
            fetchPriority="high"
            onLoad={() => {
              if (readyRef.current.has(photo.imageUrl)) return;
              readyRef.current.add(photo.imageUrl);
              bumpReady((n) => n + 1);
            }}
            className="drop-roll__photo"
          />
          {ratio && <ArtifactBoxes boxes={boxes} shown={under} />}
          {/* Лупа — НА самом кадре (просьба владельца), а не в углу сцены: кнопка относится к
              снимку, который сейчас смотрят, и уезжает вместе с ним, когда пропорция меняет
              размер кадра. */}
          <button
            ref={zoomRef}
            type="button"
            className="tap-target drop-roll__zoom"
            onClick={() => onZoom(current, zoomRef.current as HTMLElement)}
            aria-label={`открыть кадр ${current + 1} во весь экран`}
          >
            <Icon name="zoom" size={18} />
          </button>
        </span>
      </div>

      {/* Полоса данных — ПОД кадром, а не поверх: кадр смотрят целиком, и закрывать его низ
          подписью незачем (места хватает — плёнка и так ниже). */}
      <div className="drop-roll__ribbon">
        <span className="drop-roll__no">
          кадр {String(current + 1).padStart(2, "0")} / {photos.length}
        </span>
        {photo.width && photo.height && (
          <span>
            {photo.width} × {photo.height}
          </span>
        )}
        {boxes.length > 0 && <span className="drop-roll__found">находок: {boxes.length}</span>}
      </div>

      <div
        className="drop-roll__strip"
        id="drop-roll-strip"
        ref={stripRef}
        style={{ paddingInline: pad }}
        onPointerDown={() => {
          targetRef.current = null;
        }}
      >
        {photos.map((p, i) => {
          const d = Math.abs(i - current);
          return (
            <button
              key={p.imageUrl}
              type="button"
              className={`drop-roll__cell${d === 0 ? " is-current" : d === 1 ? " is-near" : ""}`}
              onClick={() => scrollTo(i, true)}
              aria-label={`кадр ${i + 1}`}
              aria-current={d === 0 ? "true" : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(p.thumbUrl)} alt="" loading="lazy" />
            </button>
          );
        })}
      </div>

      {/* Ползунок НАД засечками. Засечки говорят «сколько кадров и который из них», ползунок —
          «где мы в ленте и сколько её видно»: без него ряд засечек не читался как регулятор
          (замечание владельца — «непонятно, что он там есть»). */}
      <div
        className="drop-roll__track"
        ref={trackRef}
        role="scrollbar"
        aria-label="прокрутка плёнки"
        aria-controls="drop-roll-strip"
        aria-orientation="horizontal"
        aria-valuenow={current + 1}
        aria-valuemin={1}
        aria-valuemax={photos.length}
        onPointerDown={onTrackPointerDown}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) dragTrack(e.clientX);
        }}
      >
        <div className="drop-roll__thumb" ref={thumbRef} />
      </div>

      {/* Засечки — одна на кадр: сколько всего кадров и где ты в них, видно без счёта. */}
      <div className="drop-roll__scrub">
        {photos.map((p, i) => (
          <button
            key={p.imageUrl}
            type="button"
            className={`drop-roll__tick${i === current ? " is-current" : ""}`}
            onClick={() => scrollTo(i, true)}
            aria-label={`перейти к кадру ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
