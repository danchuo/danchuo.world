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
  startFrameIndex,
  stripPadding,
  swipeStep,
  tickIndexAt,
  toothHeight,
  wheelStep,
} from "@/lib/dropRoll";
import type { FilmPhotoView } from "@/lib/api/types";
import { ArtifactBoxes } from "./ArtifactBoxes";
import { Icon } from "./Icon";
import { useRollMotion } from "./useRollMotion";

/** Сколько соседних кадров держать предзагруженными в полном размере с каждой стороны. */
const PRELOAD_AHEAD = 3;
/**
 * Магнит гребёнки (px). Радиус — насколько далеко от курсора засечки ещё растут; база и потолок
 * — от какой высоты и до какой. `COMB_BASE` обязан совпадать с высотой покоя в CSS
 * (`.drop-roll__tick`), `COMB_CURRENT` — с высотой засечки текущего кадра: высоты JS пишет,
 * только пока курсор над рядом, а уходя, возвращает их под управление стилям.
 */
const COMB_RADIUS = 78;
const COMB_BASE = 8;
const COMB_PEAK = 30;
const COMB_CURRENT = 26;

/**
 * Галерея дропа в редакции **«плёнка»** (DESIGN §7.5): дроп — одна катушка, и читается он как
 * катушка. Крупный кадр сверху, под ним лента миниатюр, под лентой — **магнитная гребёнка**:
 * засечка на каждый кадр, и она же единственный регулятор. Соседи в ленте уходят в
 * прогрессивный блюр — тот же приём, которым волна одевает борд.
 *
 * **Регулятор здесь один.** Прежде над засечками стояла ещё дорожка с ползунком — она отвечала
 * на тот же вопрос «где я в ленте» и держала ради этого целую полосу, чужую плёнке по языку
 * (перекрашенная полоса прокрутки). Её сняли: засечки объявляют себя органом управления сами —
 * ряд отзывается на подход курсора, ближние зубцы растут косинусным спадом ([toothHeight]),
 * под пальцем всплывает кадр. Цена решения принята сознательно: «сколько ленты видно» больше
 * не показывается нигде, а на тач-устройствах магнита нет — там гребёнка работает как обычный
 * ряд засечек с перетаскиванием.
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
  onCurrent,
}: {
  photos: FilmPhotoView[];
  /** Адрес кадра, с которого открыть плёнку (кадр из плитки); нет — открываем с первого. */
  startAt?: string | null;
  /** Открыть кадр во весь экран (чистым, без находок). */
  onZoom: (index: number, trigger: HTMLElement) => void;
  /** Какой кадр сейчас крупным. Плитка борда слушает это, чтобы вернуться на него (§7.5). */
  onCurrent?: (photo: FilmPhotoView) => void;
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
  const scrubRef = useRef<HTMLDivElement>(null);
  const peekRef = useRef<HTMLDivElement>(null);
  const peekImgRef = useRef<HTMLImageElement>(null);
  const peekNoRef = useRef<HTMLSpanElement>(null);
  /** Тащат ли гребёнку прямо сейчас: пока да, движение мыши двигает и плёнку. */
  const scrubbingRef = useRef(false);
  /** Где курсор над гребёнкой (clientX); `null` — курсора над рядом нет. */
  const combXRef = useRef<number | null>(null);
  // Боковой запас считается по ЖИВОЙ ширине окна ленты: она зависит от ширины модалки, а та —
  // от экрана. До первого замера запас 0 — лента просто стоит с начала, без скачка.
  const [pad, setPad] = useState(0);

  /**
   * Собственное движение ленты к кадру — общий шов обеих лент дропов ([useRollMotion]):
   * нативная плавная прокрутка каждым новым вызовом обрывала анимацию и разгонялась с нуля.
   */
  const motion = useRollMotion(stripRef, "x");
  const scrollTo = useCallback(
    (index: number, smooth: boolean) => {
      if (smooth) motion.to(index);
      else motion.jump(index);
    },
    [motion],
  );

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

  /**
   * Форма гребёнки под курсором: каждой засечке — своя высота по расстоянию до него
   * ([toothHeight]). Возвращает засечку, над которой стоит курсор, — она же и кадр, к которому
   * едем, если гребёнку тащат.
   *
   * Пишем прямо в стили, как раньше писали ползунок: событие приходит на каждый пиксель
   * движения, и перерисовывать ради него всю галерею (37 миниатюр плюс крупный кадр) нельзя.
   * Замеры идут ОДНИМ проходом до записи: чередовать чтение и запись значило бы просить
   * браузер пересчитать раскладку 37 раз на каждое движение мыши.
   *
   * `null` вместо координаты — «курсора над рядом больше нет»: высоты снимаются, и засечки
   * возвращаются к тому, что говорит CSS.
   */
  const shapeComb = useCallback((clientX: number | null): number => {
    const scrub = scrubRef.current;
    if (!scrub) return -1;
    const ticks = Array.from(scrub.querySelectorAll<HTMLElement>(".drop-roll__tick"));
    if (clientX === null) {
      ticks.forEach((tick) => {
        tick.style.height = "";
      });
      return -1;
    }
    const row = scrub.getBoundingClientRect();
    const shaped = ticks.map((tick) => {
      const r = tick.getBoundingClientRect();
      const base = tick.classList.contains("is-current") ? COMB_CURRENT : COMB_BASE;
      return toothHeight(r.left + r.width / 2 - clientX, COMB_RADIUS, base, COMB_PEAK);
    });
    ticks.forEach((tick, i) => {
      tick.style.height = `${shaped[i].toFixed(1)}px`;
    });
    return tickIndexAt(clientX - row.left, row.width, ticks.length);
  }, []);

  // Кадр сменился, а курсор всё ещё над рядом — гребёнку лепим заново. Высоты живут в инлайн-
  // стилях и пишутся только на движении мыши; после клика по засечке (или щелчка колеса под
  // рядом) прежний текущий зубец оставался бы высоким, а новый — низким, пока мышь не
  // шевельнётся (замечание владельца). Эффект идёт после коммита React: классы `is-current`,
  // по которым [shapeComb] берёт базу зубца, к этому моменту уже переставлены.
  useEffect(() => {
    if (combXRef.current !== null) shapeComb(combXRef.current);
  }, [current, shapeComb]);

  /**
   * Кадр под пальцем — всплывающей миниатюрой над гребёнкой. Она и есть ответ на «куда я
   * попаду»: лента показывает лишь несколько кадров вокруг текущего, а гребёнка тянется на весь
   * дроп, и без превью тыкать в её дальний конец пришлось бы вслепую.
   */
  const movePeek = useCallback(
    (index: number, x: number) => {
      const peek = peekRef.current;
      const photo = photos[index];
      if (!peek || !photo) return;
      peek.hidden = false;
      // Держим карточку в пределах ряда: у первого и последнего кадра она иначе вылезает за
      // край гребёнки — а там её обрежет панель модалки, и превью крайнего кадра не увидеть.
      const half = peek.offsetWidth / 2;
      const row = peek.parentElement?.clientWidth ?? 0;
      peek.style.left = `${row > peek.offsetWidth ? Math.max(half, Math.min(row - half, x)) : x}px`;
      const src = mediaUrl(photo.thumbUrl);
      if (peekImgRef.current && peekImgRef.current.getAttribute("src") !== src) {
        peekImgRef.current.setAttribute("src", src);
      }
      if (peekNoRef.current) peekNoRef.current.textContent = String(index + 1).padStart(2, "0");
    },
    [photos],
  );

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
        setCurrent(next);
      });
    };
    strip.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      strip.removeEventListener("scroll", onScroll);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [photos.length]);

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

  // Свайп по САМОМУ кадру (DESIGN §7.5). На телефоне гребёнка и полоса миниатюр — цели в
  // несколько миллиметров, а самый большой объект на экране до сих пор на жест не отвечал.
  // Мышь сюда не пускаем: у неё уже есть колесо и гребёнка, а протяжка мышью по кадру
  // перехватывала бы наведение на находки.
  const swipeRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    lastX: number;
    acc: number;
    locked: boolean;
  } | null>(null);

  const onStagePointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse") return;
    swipeRef.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      acc: 0,
      locked: false,
    };
  };

  const onStagePointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.id !== e.pointerId) return;
    const totalX = e.clientX - swipe.startX;
    const totalY = e.clientY - swipe.startY;
    if (!swipe.locked) {
      // Пока жест не определился, ничего не двигаем. Определившись вертикальным, отдаём его
      // странице совсем: диагональ, начатую как скролл, лента перехватывать не вправе.
      if (Math.abs(totalX) < 8 && Math.abs(totalY) < 8) return;
      if (Math.abs(totalY) > Math.abs(totalX)) {
        swipeRef.current = null;
        return;
      }
      swipe.locked = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const step = swipeStep(e.clientX - swipe.lastX, swipe.acc);
    swipe.lastX = e.clientX;
    swipe.acc = step.acc;
    if (step.dir === 0) return;
    // Считаем от последнего ЗАКАЗАННОГО кадра, как и колесо: движение ещё едет, и длинный
    // свайп иначе топтался бы на месте.
    const base = targetRef.current ?? current;
    const next = Math.min(photos.length - 1, Math.max(0, base + step.dir));
    targetRef.current = next;
    scrollTo(next, true);
  };

  const endSwipe = () => {
    swipeRef.current = null;
  };

  // Полные кадры соседей — заранее. Иначе при листании крупный кадр стоит размытой миниатюрой,
  // пока едет web-версия: «заметно плохое качество» (замечание владельца). Окно узкое: тянуть
  // все 37 кадров вперёд значило бы выкачивать дроп целиком ради одного просмотренного.
  //
  // Окно тянется и к ЗАКАЗАННОМУ кадру: при быстром вращении колеса лента уходит вперёд быстрее,
  // чем три соседа успевают приехать, и крупный кадр мелькал подложкой (замер: шесть кадров
  // отрисовки с миниатюрой на двадцати щелчках).
  useEffect(() => {
    const ordered = targetRef.current ?? current;
    const from = Math.max(0, Math.min(current, ordered) - PRELOAD_AHEAD);
    const to = Math.min(photos.length - 1, Math.max(current, ordered) + PRELOAD_AHEAD);
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

  // Наведение и перетаскивание гребёнки — один обработчик: разница между ними ровно в том,
  // держат ли кнопку. Пока тащим, прокрутка НЕ плавная (`auto`): плавность спорила бы с рукой —
  // плёнка догоняла бы палец с отставанием.
  const onCombPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    combXRef.current = e.clientX;
    const index = shapeComb(e.clientX);
    if (index < 0) return;
    movePeek(index, e.clientX - e.currentTarget.getBoundingClientRect().left);
    if (scrubbingRef.current) scrollTo(index, false);
  };

  const onCombPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault(); // иначе тянется выделение текста, и жест обрывается на первом же пикселе
    targetRef.current = null; // рука важнее заказанного колесом кадра
    motion.stop();
    scrubbingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    combXRef.current = e.clientX;
    const index = shapeComb(e.clientX);
    if (index >= 0) scrollTo(index, true);
  };

  const onCombPointerLeave = () => {
    scrubbingRef.current = false;
    // Класс ставим ДО снятия высот и напрямую, а не через state: переход должен быть в силе уже
    // в тот момент, когда высоты снимаются, иначе гребёнка не опадала бы, а схлопывалась. Ждать
    // перерисовки React здесь нельзя — она произойдёт после.
    scrubRef.current?.classList.add("is-relaxing");
    combXRef.current = null;
    shapeComb(null);
    if (peekRef.current) peekRef.current.hidden = true;
  };

  const photo = photos[current] ?? photos[0];
  // Кадр, на котором сейчас стоит плёнка, — наружу. Из-за него плитка борда меняет свой снимок
  // (и вместе с ним пропорцию), поэтому возврат проявки садится в тот же прямоугольник, а не
  // растягивает вертикальный кадр по горизонтальной карточке (§7.5).
  useEffect(() => {
    if (photo) onCurrent?.(photo);
  }, [photo, onCurrent]);
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
          // Сцена — «тот самый кадр» для проявки (DESIGN §7.5): её границы совпадают с
          // границами снимка, потому что пропорцию она берёт у него же. Атрибут, а не класс:
          // шов [useDropMorph] ищет кадр по нему в любой редакции галереи.
          data-morph-hero
          style={ratio ? { aspectRatio: ratio } : undefined}
          onMouseMove={trackPointer}
          onMouseLeave={() => setUnder([])}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={endSwipe}
          onPointerCancel={endSwipe}
        >
          {/* Миниатюра — подложка только пока полного кадра НЕТ в кэше. Соседи предзагружены,
              поэтому при листании её обычно не видно вовсе: кадр сразу полного качества. */}
          {!readyRef.current.has(photo.imageUrl) && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img data-morph-face src={mediaUrl(photo.thumbUrl)} alt="" aria-hidden className="drop-roll__thumb" />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={photo.imageUrl}
            // «Лицо» героя проявки — слой, который режется клипом на время полёта (common.css).
            // У дропа это сам снимок; у карты поездок лицом работает её контейнер.
            data-morph-face
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
        ref={stripRef}
        style={{ paddingInline: pad }}
        onPointerDown={() => {
          targetRef.current = null;
          motion.stop(); // рука важнее заказанного кадра
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
              {/* `decoding="async"` — не микрооптимизация: лента открывается в один кадр с проявкой,
                  и синхронный декод десятка миниатюр отъедает у неё первые кадры движения. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(p.thumbUrl)} alt="" loading="lazy" decoding="async" />
            </button>
          );
        })}
      </div>

      {/* Гребёнка: засечка на кадр — и она же единственный регулятор плёнки. Ряд отвечает на
          подход курсора (высоты пишет [shapeComb]), поэтому объявляет себя органом управления
          ещё до касания — то, ради чего прежде над ним стояла отдельная дорожка с ползунком.
          Тащат гребёнку — едет плёнка; под пальцем всплывает кадр, к которому приедешь. */}
      <div
        className="drop-roll__scrub"
        ref={scrubRef}
        onPointerEnter={() => scrubRef.current?.classList.remove("is-relaxing")}
        onPointerDown={onCombPointerDown}
        onPointerMove={onCombPointerMove}
        onPointerUp={() => {
          scrubbingRef.current = false;
        }}
        onPointerCancel={() => {
          scrubbingRef.current = false;
        }}
        onPointerLeave={onCombPointerLeave}
      >
        {photos.map((p, i) => (
          <button
            key={p.imageUrl}
            type="button"
            className={`drop-roll__tick${i === current ? " is-current" : ""}`}
            onClick={() => scrollTo(i, true)}
            aria-label={`перейти к кадру ${i + 1}`}
            aria-current={i === current ? "true" : undefined}
          />
        ))}
        {/* Превью кадра под пальцем. Стоит ПОСЛЕДНИМ и позиционируется абсолютно: в ряду
            засечек оно не участвует, а лежит над ним. */}
        <div className="drop-roll__peek" ref={peekRef} hidden aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={peekImgRef} alt="" />
          <span ref={peekNoRef} />
        </div>
      </div>
    </div>
  );
}
