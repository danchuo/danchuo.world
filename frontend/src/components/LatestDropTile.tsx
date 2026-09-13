"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { getDrop, getDrops } from "@/lib/api/client";
import { mediaUrl } from "@/lib/api/media";
import { GAP, buildMosaic, dropCardWidth, mosaicWidth, type Cell } from "@/lib/mosaic";
import { SWIPE_NOTCH, frameWheelStep, stepFrameIndex } from "@/lib/dropRoll";
import { pluralRu } from "@/lib/rideFormat";
import { pickSeeded } from "@/lib/sample";
import type { FilmDropView, FilmPhotoView } from "@/lib/api/types";
import { PhotoDropModal } from "./PhotoDropModal";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

/**
 * Редакции плитки (DESIGN §7.5) — выбирает ВОЛНА через раскладку (`tiles.latestDrop.edition`,
 * §10.1), компонент о волнах не знает. Незнакомое значение ⇒ мозаика.
 * - `mosaic` — justified-мозаика из пяти случайных кадров без обрезки (волна 01);
 * - `frame`  — один случайный кадр во всю карточку, карточка берёт пропорцию кадра (PRIME);
 * - `sheet`  — контактный лист: та же укладка, но четыре кадра и строка данных сверху (Obscura).
 */
export type DropEdition = "mosaic" | "frame" | "sheet";

interface LatestDropTileProps {
  style?: CSSProperties;
  className?: string;
  /** Редакция из раскладки волны (строка как есть; проверяется здесь). */
  edition?: string;
  /** Редакция галереи дропа из раскладки волны (см. [PhotoDropModal]). */
  gallery?: string;
}

interface LatestData {
  latest: FilmDropView | null;
  photos: FilmPhotoView[];
}

/* TileShell horizontal padding (p-4 on both sides) — added back around the mosaic width. */
const CARD_PAD_X = 32;
/* Don't shrink the card below this: the label and caption row need room to breathe. */
const MIN_CARD_W = 200;
/**
 * Тишина, которой кончается жест колеса (мс): трекпад шлёт десятки событий на один мах, и
 * пауза — единственный признак, что рука отпустила. Меньше — и инерция прокрутки читается
 * вторым жестом; больше — и второй честный мах приходится ждать.
 */
const WHEEL_GESTURE_GAP_MS = 140;

/**
 * Въезд нового кадра: сдвиг в сторону жеста и его длительность. Движение намеренно маленькое —
 * кадр большой, и слайд во всю карточку читался бы аттракционом; нужно ровно столько, чтобы
 * глаз понял направление.
 */
const FRAME_SLIDE_PX = 14;
const FRAME_SLIDE_MS = 260;

/* Frames per edition: the mosaic packs five, the sheet four (two rows of two), the frame one. */
const MOSAIC_FRAMES = 5;
const SHEET_FRAMES = 4;

/* useLayoutEffect warns during SSR of client components — fall back to useEffect there. */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const monoTertiary = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-drop-meta)",
  color: "var(--text-tertiary)",
} satisfies CSSProperties;

function resolveEdition(value: string | undefined): DropEdition {
  return value === "frame" || value === "sheet" ? value : "mosaic";
}

function framesLabel(count: number): string {
  return `${count} ${pluralRu(count, ["кадр", "кадра", "кадров"])}`;
}

/**
 * Ряды justified-мозаики (общие для редакций `mosaic` и `sheet`).
 */
function renderRows(mosaic: Cell[][] | null) {
  return (
    <>
      {/* ⚠️ Ширину ряда раздаёт САМ ФЛЕКСБОКС, а не пиксели из JS, — и это несущее
          решение, а не оптимизация. Прежде расчёт мерил ячейку, делил ширину на
          кадры и записывал результат в `style.width` каждой картинки, то есть
          держался на том, что движок сложит эти числа ровно так же. Safari
          складывал иначе, и правый кадр вылезал за карточку. Теперь ряд заполняет
          контейнер ПО ОПРЕДЕЛЕНИЮ: `flex-basis: 0` + `flex-grow` пропорционально
          ширине ячейки дают ровно justified-формулу `(W − зазоры)·aᵢ/Σa`, только
          считает её раскладчик — по своей же реальной ширине. Переполнение
          становится невозможным структурно, а не арифметически.
          Высоту держит `aspect-ratio`: ширины пропорциональны аспектам, значит
          высоты у кадров ряда совпадают сами, без общего числа из JS. */}
      {mosaic?.map((row, ri) => {
        // Расчётная ширина ряда остаётся ПОТОЛКОМ: в ветке, где карточка упёрлась
        // в край ячейки, контейнер чуть шире расчёта, и без потолка ряд подрос бы
        // в высоту на пиксель-другой.
        const rowW = row.reduce((s, c) => s + c.w, 0) + (row.length - 1) * GAP;
        return (
          <div
            key={ri}
            className="flex"
            // `flex-start` по поперечной оси: иначе `stretch` тянул бы картинку по
            // высоте ряда и спорил с `aspect-ratio`.
            style={{ gap: GAP, width: "100%", maxWidth: rowW, alignItems: "flex-start" }}
          >
            {row.map((cell, ci) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${cell.photo.thumbUrl}-${ri}-${ci}`}
                src={mediaUrl(cell.photo.thumbUrl)}
                alt=""
                style={{
                  // grow по ширине ячейки = grow по аспекту (высота в ряду общая).
                  flex: `${cell.w} 1 0`,
                  minWidth: 0,
                  aspectRatio: `${cell.w} / ${cell.h}`,
                  height: "auto",
                  objectFit: "cover", // бокс точно по пропорции кадра ⇒ без обрезки
                  borderRadius: "var(--radius-sm)",
                  display: "block",
                }}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

/**
 * Тайл последнего фото-дропа (DESIGN §7.5). В дефолтной редакции показывает 5 **случайных**
 * кадров (перетасовка на каждом обновлении страницы) **justified-мозаикой**: кадры разной
 * ориентации (портрет/ландшафт) пакуются в ряды по реальным `width/height` — без обрезки,
 * без искажения, влезая в виджет. Волна вправе выбрать другую редакцию (см. [DropEdition]).
 * Клик → модалка-галерея со всеми кадрами. Прошлые дропы — лентой [PhotoDropsTile]. До первой
 * загрузки через /admin — тихий empty «пока нет дропов».
 */
export function LatestDropTile({
  style,
  className,
  edition: editionRaw,
  gallery,
}: LatestDropTileProps) {
  const edition = resolveEdition(editionRaw);
  const { phase, data, settled, retry } = useTileData<LatestData>(
    useCallback(async (signal) => {
      const drops = await getDrops({ signal });
      if (drops.length === 0) return { latest: null, photos: [] };
      const latest = drops[0];
      const photos = await getDrop(latest.id, { signal });
      return { latest, photos };
    }, []),
    "latest-drop",
  );

  const latest = data?.latest ?? null;
  const isEmpty = phase === "loaded" && latest === null;
  const [open, setOpen] = useState(false);
  /**
   * Кадр, на котором стоит открытая плёнка. Плитка переходит на него **локально** — в памяти
   * вкладки, без записи куда-либо: перезагрузка вернёт обычную случайную выборку. Смысл в
   * проявке (DESIGN §7.5): возврат обязан сесть в тот кадр, из которого выходишь, иначе
   * вертикальный снимок растягивается по горизонтальной карточке.
   */
  const [wantedFrame, setWantedFrame] = useState<FilmPhotoView | null>(null);
  /**
   * Кадр, который уже ДЕКОДИРОВАН и стоит на карточке. Отдельно от заказанного ([wantedFrame]):
   * плитка ждёт загрузки следующего снимка на текущем, а не на пустом месте, — иначе свайп
   * мигал бы дырой (карточки нет, пока кадр не готов, см. [hidden] ниже).
   */
  const [shownFrame, setShownFrame] = useState<FilmPhotoView | null>(null);
  /** Откуда приезжает новый кадр: −1 — слева (шаг назад), +1 — справа, 0 — без движения. */
  const [slide, setSlide] = useState(0);
  /**
   * Адрес кадра, с которого открыли галерею, замороженный на время просмотра: сама галерея
   * прокручивается к нему при изменении (`startAt`), и живой адрес дёргал бы ленту назад на
   * каждом же движении гребёнки.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null);

  // Случайная выборка — новая на каждую загрузку страницы, но ОДНА на загрузку: зерно берётся
  // при монтировании, а выбор из него детерминирован (`lib/sample.ts`). Плитка рендерится
  // дважды — копией из кэша и ответом сети с теми же кадрами, — и без зерна кадр на глазах
  // менялся дважды.
  const [seed] = useState(() => Math.random());
  const sampleSize = edition === "sheet" ? SHEET_FRAMES : edition === "frame" ? 1 : MOSAIC_FRAMES;
  const sample = useMemo(() => pickSeeded(data?.photos ?? [], sampleSize, seed), [data?.photos, sampleSize, seed]);

  // Available width comes from the outer grid-cell wrapper, NOT from the card itself:
  // the card shrinks to the mosaic below, and measuring it back would loop the observer.
  const frameRef = useRef<HTMLDivElement>(null);
  // Сама карточка-кадр: из неё растёт галерея (проявка, DESIGN §7.5). Ссылка нужна и на
  // закрытии, поэтому держим её, а не прямоугольник, снятый в момент клика.
  const frameCardRef = useRef<HTMLButtonElement>(null);
  const [frameW, setFrameW] = useState(0);
  const [frameH, setFrameH] = useState(0);

  // Height of the mosaic area (label/caption rows are single-line — it doesn't depend on
  // the card width, so it stays a stable input for the layout).
  // Узел — в state (callback-ref), а не в ref: карточка появляется ПОСЛЕ ответа сети, когда
  // фаза уже «loaded» (копия из кэша), и замер, привязанный к фазе, не перезапускался — блок
  // мерился нулём, раскладка не строилась, кадров не было (поймано на второй загрузке).
  const [boxEl, setBoxEl] = useState<HTMLButtonElement | null>(null);
  const [boxH, setBoxH] = useState(0);

  // Synchronous measure before paint: the shrunken width is computed in the same frame the
  // loaded content commits, so cached loads paint the card already hugged (no width flash).
  useIsomorphicLayoutEffect(() => {
    if (frameRef.current) {
      const r = frameRef.current.getBoundingClientRect();
      setFrameW(r.width);
      setFrameH(r.height);
    }
    if (boxEl) setBoxH(boxEl.getBoundingClientRect().height);
  }, [phase, isEmpty, edition, boxEl]);

  // ResizeObserver keeps the measurements live afterwards (window resize, wave/layout swap).
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return; // jsdom-тесты без ResizeObserver
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === frameRef.current) {
          setFrameW(entry.contentRect.width);
          setFrameH(entry.contentRect.height);
        }
        if (entry.target === boxEl) setBoxH(entry.contentRect.height);
      }
    });
    if (frameRef.current) ro.observe(frameRef.current);
    if (boxEl) ro.observe(boxEl);
    return () => ro.disconnect();
  }, [phase, isEmpty, edition, boxEl]);

  // Mosaic and sheet share the packer: rows justified by real aspect, no crop, both orientations.
  const mosaic = useMemo(
    () => (edition !== "frame" ? buildMosaic(sample, mosaicWidth(frameW, CARD_PAD_X), boxH) : null),
    [edition, sample, frameW, boxH],
  );

  // Shrink-to-content (per-shuffle): when scale <1 leaves side gaps, the card hugs the
  // widest mosaic row and centers in the cell — label and caption ride along with it.
  const usedW = mosaic
    ? Math.max(...mosaic.map((row) => row.reduce((s, c) => s + c.w, 0) + (row.length - 1) * GAP))
    : 0;
  // Ширина карточки — через `dropCardWidth`, а не руками: она держит инвариант «между
  // мозаикой и краем карточки всегда есть запас». Раньше карточка жалась к ряду впритык
  // (замер: зазор 0.00–0.02px), и в Safari правый кадр обрезался краем.
  const cardW = usedW > 0 && frameW > 0 ? dropCardWidth(usedW, frameW, CARD_PAD_X, MIN_CARD_W) : null;

  // Frame edition: the card itself takes the photo's aspect. In the bento the host gives the
  // wrapper a height (the reserved slot, DESIGN §10.2) and the card fits inside it — landscape
  // fills the width, portrait fills the height; in the stack there is no slot height (the
  // wrapper is as tall as the card, measuring it back would loop), so width rules.
  // Заказанный кадр: случайная выборка → кадр, на котором вышли из галереи → свайп по плитке.
  const wanted = edition === "frame" ? (wantedFrame ?? sample[0] ?? null) : null;
  // Карточка-кадр появляется только вместе со снимком. До его прихода стекло не рисуется
  // вовсе: при быстрой перезагрузке пустая карточка без ширины вставала узкой вертикальной
  // полоской и через мгновение заполнялась кадром — лучше пауза без
  // виджета, чем виджет без содержимого. Снимок предзагружается отдельным `Image`, и лишь
  // после `load` он встаёт на карточку: на первом показе — вместе с ней, на свайпе — вместо
  // предыдущего кадра, который всё это время остаётся на экране.
  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (alive) setShownFrame(wanted);
    };
    img.src = mediaUrl(wanted.imageUrl);
    return () => {
      alive = false;
    };
  }, [wanted]);
  const frame = edition === "frame" ? shownFrame : null;

  /**
   * Соседние кадры плёнки тянутся ЗАРАНЕЕ — по два в каждую сторону от заказанного. Свайп по
   * плитке показывает новый кадр только после его загрузки (выше), и без этого каждый жест на
   * телефоне упирался в сеть: палец уже увёл кадр, а на экране секунду стоит прежний.
   * Предзагруженный сосед приезжает из кэша, и шаг читается движением, а не ожиданием.
   *
   * Окно узкое (±2) намеренно: листают обычно на шаг-два, а тянуть весь дроп ради плитки
   * значило бы выкачивать его целиком тому, кто мимо проходил. Тот же размен, что у галереи
   * с её соседями ±3 (DESIGN §7.5).
   *
   * Снимки нигде не держатся ссылками: их место — кэш браузера, и отменять начатую загрузку
   * на смену кадра не надо (следующий жест как раз за ней и пришёл).
   */
  useEffect(() => {
    const list = data?.photos ?? [];
    if (!wanted || list.length < 2) return;
    const base = list.findIndex((p) => p.imageUrl === wanted.imageUrl);
    if (base < 0) return;
    for (const i of [base + 1, base - 1, base + 2, base - 2]) {
      if (i < 0 || i >= list.length) continue;
      new Image().src = mediaUrl(list[i].imageUrl);
    }
  }, [wanted, data?.photos]);

  /**
   * Свайп по самой карточке листает плёнку дропа: влево — следующий кадр,
   * вправо — предыдущий, за краями шага нет ([stepFrameIndex]). Считаем от ЗАКАЗАННОГО кадра,
   * а не от стоящего на экране: пока новый снимок декодируется, второй жест иначе повторял бы
   * первый (тот же урок, что у ленты архива с её щелчками колеса).
   */
  const stepFrame = useCallback(
    (dir: -1 | 1) => {
      const list = data?.photos ?? [];
      const base = wanted ? list.findIndex((p) => p.imageUrl === wanted.imageUrl) : -1;
      if (base < 0) return;
      const next = stepFrameIndex(base, dir, list.length);
      if (next === base) return; // первый/последний кадр — дальше плёнка не идёт
      setSlide(dir);
      setWantedFrame(list[next]);
    },
    [data?.photos, wanted],
  );

  // Перетаскивание (палец и мышь — одни и те же pointer-события). **Один жест стоит ровно
  // один кадр**, какой бы длины он ни был: накопитель плёнки в галерее (`swipeStep`, где
  // длинное движение стоит нескольких кадров) здесь не годится — плитка показывает ОДИН
  // снимок, и длинный свайп доматывал её до края дропа рывком.
  // Порог тот же, что у плёнки (`SWIPE_NOTCH`), считается от начала жеста, а не от прошлого
  // события: рука ведёт непрерывно, и шаг обязан зависеть от пройденного пути, а не от того,
  // насколько часто браузер прислал `pointermove`.
  // `moved` гасит клик после жеста — иначе свайп ещё и открывал бы галерею.
  // ⚠️ Метка живёт ровно один жест и снимается НАЧАЛОМ следующего, а не кликом, который её
  // прочитал: завершающий клик приходит не всегда — на тач-экране свайп им не оборачивается
  // вовсе, на мыши его съедает нативное перетаскивание картинки. Метка, снятая только
  // в обработчике клика, доживает до следующего нажатия и глотает его: полистал плёнку,
  // ткнул в кадр — ничего, открывает лишь второе нажатие.
  const dragRef = useRef<{ from: number; done: boolean } | null>(null);
  const movedRef = useRef(false);
  const onFramePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    movedRef.current = false;
    dragRef.current = { from: e.clientX, done: false };
  };
  const onFramePointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.done) return;
    const dx = e.clientX - drag.from;
    if (Math.abs(dx) < SWIPE_NOTCH) return;
    drag.done = true; // кадр за жест отдан; остаток движения — уже не второй шаг
    movedRef.current = true;
    stepFrame(dx < 0 ? 1 : -1);
  };
  const onFramePointerEnd = () => {
    dragRef.current = null;
  };

  // Трекпад: горизонтальный жест двумя пальцами приезжает колесом, а не указателем. Слушатель
  // нативный и НЕ passive — только так у него есть право отменить прокрутку страницы вбок;
  // вертикаль не трогаем вовсе, она принадлежит странице. Сколько пути стоит кадр и как часто
  // он может меняться — в [frameWheelStep].
  //
  // ⚠️ Слушатель вешается КОЛБЭК-ССЫЛКОЙ, а не эффектом, и живёт ровно столько же, сколько сам
  // узел. Причина та же, по которой узел не пересоздаётся на смену кадра (врез у
  // `.drop-frame__view`): браузер ведёт трекпадный жест к цели, которая отменила прокрутку
  // первым событием, и слушатель, снятый на полпути, уводит остаток жеста странице. Эффект
  // сюда не годится ни в каком виде: по `frame` в зависимостях он перевешивается посреди
  // жеста, а по «есть ли кадр» — может не запуститься вовсе, потому что показ карточки гейтит
  // ещё и `settled`, и узел появляется в ДРУГОМ коммите, чем флипается признак.
  //
  // Накопитель и время прошлого шага живут в ССЫЛКЕ: карточка перерисовывается на каждый кадр,
  // и в замыкании они сбрасывались бы ровно тем событием, которое сами же и вызвали.
  const stepRef = useRef(stepFrame);
  stepRef.current = stepFrame;
  const wheelRef = useRef<{ acc: number; steppedAt: number; quiet: ReturnType<typeof setTimeout> | null }>({
    acc: 0,
    steppedAt: 0,
    quiet: null,
  });
  const detachWheelRef = useRef<(() => void) | null>(null);
  const mountFrameCard = useCallback((el: HTMLButtonElement | null) => {
    frameCardRef.current = el;
    detachWheelRef.current?.();
    detachWheelRef.current = null;
    if (!el) return;
    const gesture = wheelRef.current;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      // Тишина — конец жеста: накопленный путь недоведённого жеста не должен доставаться
      // следующему, иначе кадр менялся бы от касания через полминуты.
      if (gesture.quiet) clearTimeout(gesture.quiet);
      gesture.quiet = setTimeout(() => {
        gesture.acc = 0;
      }, WHEEL_GESTURE_GAP_MS);
      const step = frameWheelStep(e.deltaX, e.deltaMode, gesture.acc, e.timeStamp - gesture.steppedAt);
      gesture.acc = step.acc;
      if (step.dir === 0) return;
      gesture.steppedAt = e.timeStamp;
      stepRef.current(step.dir);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    detachWheelRef.current = () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Таймер конца жеста живёт в ссылке и слушателя переживает, поэтому гасится отдельно —
  // на размонтировании плитки, а не вместе с узлом карточки.
  useEffect(() => {
    const gesture = wheelRef.current;
    return () => {
      if (gesture.quiet) clearTimeout(gesture.quiet);
    };
  }, []);

  /**
   * Въезд нового кадра. Анимация **императивная**, потому что слой кадра обязан оставаться тем
   * же узлом (см. врез у `.drop-frame__view` в разметке): CSS-анимация проигрывается на
   * появлении элемента, а появления тут больше нет — меняются только атрибуты.
   * Сдвиг маленький (14px) и в сторону жеста, дальше — проявление; уважает `prefers-reduced-motion`.
   */
  const viewRef = useRef<HTMLSpanElement>(null);
  const shownUrl = frame?.imageUrl ?? null;

  /**
   * Какой кадр УЖЕ нарисован. Пока новый декодируется, здесь лежит предыдущий — и он же едет
   * в подложку ([holdUrl]): отдельного «прошлого кадра» держать не нужно, им и служит
   * последний загруженный.
   *
   * `complete` проверяем эффектом, потому что у кадра из кэша браузера событие загрузки
   * успевает пройти до того, как React повесит обработчик, и подложка залипла бы навсегда.
   */
  const imgRef = useRef<HTMLImageElement>(null);
  const [paintedUrl, setPaintedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (shownUrl && imgRef.current?.complete) setPaintedUrl(shownUrl);
  }, [shownUrl]);
  // Подложка нужна, только пока новый кадр не встал, и только если есть что подложить.
  const holdUrl = shownUrl !== null && paintedUrl !== null && paintedUrl !== shownUrl ? paintedUrl : null;
  useEffect(() => {
    const el = viewRef.current;
    // `animate` нет в jsdom — в тестах эффект просто молчит, и это ровно то, что им нужно.
    if (!el || !shownUrl || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const play = el.animate(
      [
        { opacity: 0, transform: `translateX(${slide * FRAME_SLIDE_PX}px)` },
        { opacity: 1, transform: "none" },
      ],
      { duration: FRAME_SLIDE_MS, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" },
    );
    return () => play.cancel();
    // `slide` меняется вместе с заказом кадра и к моменту его показа уже держит сторону жеста.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownUrl]);

  const frameStyle = useMemo<CSSProperties>(() => {
    if (!frame) return { height: "100%" };
    // Кадр без размеров (старый дроп до замера) считаем лежачим 3:2 — пропорцией плёнки.
    const fw = frame.width ?? 3;
    const fh = frame.height ?? 2;
    const a = fw / fh;
    const aspect = `${fw} / ${fh}`;
    if (frameW <= 0) return { aspectRatio: aspect, width: "100%" };
    const slotH = style?.height !== undefined ? frameH : 0;
    let w = frameW;
    let h = frameW / a;
    if (slotH > 0 && h > slotH) {
      h = slotH;
      w = slotH * a;
    }
    return { aspectRatio: aspect, width: w, height: h };
  }, [frame, frameW, frameH, style?.height]);

  // Жмёмся к мозаике ТОЛЬКО в бенто. В стеке слот высоты не задаёт, и блок кадров берёт её
  // от собственной ширины (`aspect-ratio` у `.drop-mosaic`, §8) — а раз так, подгонка ширины
  // замыкает петлю: у́же карточка ⇒ ниже блок ⇒ другая раскладка рядов ⇒ другая нужная ширина
  // ⇒ снова у́же. На телефоне это видно как виджет, который не может встать на месте (волна 02,
  // замечание владельца). Центровать в стеке всё равно не в чем: карточка и есть ряд стека.
  const hugCard = style?.height !== undefined;
  const cardStyle: CSSProperties =
    edition === "frame"
      ? frame
        ? frameStyle
        : // Пустота/ошибка в редакции кадра: карточка нужна (в ней «пока нет дропов» и
          // «повторить»), а пропорции кадра нет — берём плёночные 3:2 во всю ширину слота.
          { width: "100%", aspectRatio: "3 / 2" }
      : hugCard && cardW !== null
        ? // No `transition: width` here — see the note above the component: an animated
          // width on this filtered card smears its drop-shadow across the side gaps in
          // WebKit.
          { height: "100%", width: cardW, marginInline: "auto" }
        : { height: "100%" };

  const openLabel = latest ? `Открыть дроп «${latest.title}»` : undefined;
  const meta = latest
    ? [latest.monthLabel, framesLabel(latest.photoCount)].filter(Boolean).join(" · ")
    : "";

  // Карточки нет, пока СЕТЬ НЕ ОТВЕТИЛА: копия из
  // кэша не показывается «на секунду до свежего». Ответила успехом — на экран едут свежие
  // кадры; не ответила (рейтлимит после серии F5) — копия из кэша, но и она появляется один
  // раз, а не сменяется. Редакция кадра ждёт ещё и сам снимок (см. выше).
  // Пока галерея открыта, плитку НЕ прячем, даже если её новый кадр ещё не догрузился: она
  // и так невидима (проявка сняла с неё снимок), но её прямоугольник нужен возврату — без
  // него морфу некуда садиться.
  const hidden = !settled || (edition === "frame" && wanted !== null && frame === null && !open);

  return (
    <>
      {/* Measuring wrapper keeps the cell's full footprint; the card inside may be narrower. */}
      <div
        ref={frameRef}
        style={style}
        className={`tile-frame t-drop-vars ${edition === "frame" ? "drop-slot--frame" : ""} ${className ?? ""}`}
      >
        {hidden ? null : (
        <TileShell
          state={isEmpty ? "empty" : phase}
          emptyText="пока нет дропов"
          onRetry={retry}
          label="последний дроп"
          ariaLabel="Последний фото-дроп"
          className={edition === "frame" ? "drop-card--frame" : ""}
          style={cardStyle}
        >
          {phase === "loaded" && latest && edition === "frame" && frame && (
            // Один кадр во всю карточку; подпись лежит в нижней полосе, которую кадр отдаёт
            // прогрессивному блюру (`.drop-frame__band`, common.css) — текст на снимке, а не
            // под ним, и без плашки: полоса и есть стекло из самого кадра. Подпись — В полосе,
            // а не рядом с ней: так высота полосы = растушёвка + сама подпись, и длинное
            // название, перенесясь на вторую строку, углубляет её само, без замеров.
            <button
              ref={mountFrameCard}
              type="button"
              className="drop-frame"
              onPointerDown={onFramePointerDown}
              onPointerMove={onFramePointerMove}
              onPointerUp={onFramePointerEnd}
              onPointerCancel={onFramePointerEnd}
              onClick={() => {
                // Жест только что листал плёнку — значит это был свайп, а не клик по кадру.
                if (movedRef.current) return;
                setOpenedAt(frame.imageUrl);
                setOpen(true);
              }}
              aria-label={openLabel}
            >
              {/* Кадр и его полоса въезжают ОДНИМ слоем: анимация висит на нём, поэтому
                  подпись и размытые копии меняются вместе со снимком, а не догоняют его.
                  ⚠️ Слой НЕ пересоздаётся на смену кадра (ни `key`, ни размонтирования):
                  исчезнувший из-под курсора узел уносит с собой цель наведения, и до первого
                  движения мышью карточка перестаёт получать колесо — свайп трекпадом молча
                  переставал работать после первого же. Поэтому меняются
                  только атрибуты, а въезд играет Web Animations (см. эффект выше). */}
              {/* Смена кадра меняет пропорцию карточки СРАЗУ, а снимок приезжает позже, да и слой
                  кадра въезжает с нуля прозрачности — в этот зазор было видно стекло волны
                  (на волне 03 — синеватым по краям). Подложка держит в нём прошлый кадр
                  размытым: она СНАРУЖИ въезжающего слоя, поэтому сама не проявляется вместе
                  с ним и зазор закрывает целиком. */}
              {holdUrl && (
                <span
                  className="drop-frame__hold"
                  style={{ "--drop-frame-hold": `url("${mediaUrl(holdUrl)}")` } as CSSProperties}
                  aria-hidden
                />
              )}
              <span ref={viewRef} className="drop-frame__view">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={mediaUrl(frame.imageUrl)}
                  alt=""
                  className="drop-frame__img"
                  onLoad={() => setPaintedUrl(frame.imageUrl)}
                />
                {/* Полоса несёт адрес кадра переменной: под подписью лежат две РАЗМЫТЫЕ КОПИИ
                    снимка (`.drop-frame__blur`, common.css), а не backdrop-filter — у того на
                    кромках бокса выборка зажимается краем и даёт серую линию. */}
                <span
                  className="drop-frame__band"
                  style={{ "--drop-frame-src": `url("${mediaUrl(frame.imageUrl)}")` } as CSSProperties}
                >
                  <span className="drop-frame__blur drop-frame__blur--soft" aria-hidden />
                  <span className="drop-frame__blur drop-frame__blur--deep" aria-hidden />
                  <span className="drop-frame__caption">
                    <span className="drop-frame__title">{latest.title}</span>
                    <span className="drop-frame__meta">{meta}</span>
                  </span>
                </span>
              </span>
            </button>
          )}

          {phase === "loaded" && latest && edition === "sheet" && (
            <div className="flex h-full flex-col gap-1">
              {/* Строка данных СВЕРХУ, как шапка контактного листа: имя · месяц слева, счёт кадров справа. */}
              <div className="drop-sheet__head flex items-baseline justify-between gap-2">
                <span className="truncate" style={{ fontSize: "var(--fs-drop-title)", color: "var(--text-primary)" }}>
                  {latest.title}
                  {latest.monthLabel && <span style={monoTertiary}> · {latest.monthLabel}</span>}
                </span>
                <span className="shrink-0" style={monoTertiary}>
                  {framesLabel(latest.photoCount)}
                </span>
              </div>
              {/* Та же укладка, что у мозаики (без обрезки, без поворота, обе ориентации), но
                  четыре кадра: два ряда по два в квадратной плитке. `drop-mosaic` — ради своей
                  высоты в стеке (§8), `drop-sheet` — зацепка редакции. */}
              <button
                ref={setBoxEl}
                type="button"
                onClick={() => setOpen(true)}
                className="drop-mosaic drop-sheet flex min-h-0 flex-1 flex-col items-center justify-center"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, gap: GAP }}
                aria-label={openLabel}
              >
                {renderRows(mosaic)}
              </button>
            </div>
          )}

          {phase === "loaded" && latest && edition === "mosaic" && (
            <div className="flex h-full flex-col gap-1">
              <button
                ref={setBoxEl}
                type="button"
                onClick={() => setOpen(true)}
                // drop-mosaic: своя высота там, где родитель её не задаёт (мобильный стек, §8) —
                // без неё boxH=0, раскладка не строится и кадры не появляются вовсе.
                className="drop-mosaic flex min-h-0 flex-1 flex-col items-center justify-center"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, gap: GAP }}
                aria-label={openLabel}
              >
                {renderRows(mosaic)}
              </button>

              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate" style={{ fontSize: "var(--fs-drop-title)", color: "var(--text-primary)" }}>
                  {latest.title}
                </span>
                {latest.monthLabel && <span style={monoTertiary}>{latest.monthLabel}</span>}
              </div>
            </div>
          )}
        </TileShell>
        )}
      </div>

      {open && latest && (
        <PhotoDropModal
          dropId={latest.id}
          title={latest.title}
          monthLabel={latest.monthLabel}
          gallery={gallery}
          // Редакция кадра показывает ОДИН снимок — галерея обязана открыться именно на нём,
          // а не с начала дропа: клик по кадру спрашивает про этот кадр. В остальных редакциях
          // на плитке несколько кадров, и «тот самый» не определён — открываем с первого.
          startAt={edition === "frame" ? openedAt : null}
          // Кадры уже в руках — плитка тянула их ради собственной раскладки. Галерее незачем
          // открываться лоадером поверх тех же данных (и проявке незачем ждать сеть).
          initialPhotos={data?.photos}
          // Проявка — только из редакции кадра: там на плитке ОДИН снимок, и он же встречает
          // в галерее (`startAt`). В мозаике и контактном листе «тот самый кадр» не определён,
          // расти не из чего — галерея открывается как прежде.
          origin={edition === "frame" ? frameCardRef : undefined}
          // Плитка идёт за плёнкой, пока та открыта: к моменту закрытия она уже показывает тот
          // кадр, на котором вышли, и проявке есть куда вернуться без растяжения.
          onFrameShown={edition === "frame" ? setWantedFrame : undefined}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
