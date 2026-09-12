"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { getDrop } from "@/lib/api/client";
import { boxesAt } from "@/lib/artifactHighlight";
import { mediaUrl } from "@/lib/api/media";
import {
  MOSAIC_NARROW_PX,
  MOSAIC_UNITS,
  MOSAIC_UNITS_NARROW,
  columnMajorMosaic,
  type MosaicCell,
} from "@/lib/dropMosaic";
import type { FilmPhotoView } from "@/lib/api/types";
import { ArtifactBoxes } from "./ArtifactBoxes";
import { DropRoll } from "./DropRoll";
import { Icon } from "./Icon";
import { useBackToClose } from "./useBackToClose";
import { useCoarsePointer } from "./useCoarsePointer";
import { useDropMorph } from "./useDropMorph";
import { useTileData } from "./useTileData";

interface PhotoDropModalProps {
  dropId: number;
  title: string;
  monthLabel: string | null;
  /**
   * Редакция галереи из раскладки волны (`layout.gallery`, DESIGN §10.1): `roll` — плёнка,
   * всё остальное (и отсутствие) — мозаика. Строка как есть; проверяется здесь, как редакция
   * плитки: набор редакций — знание галереи, реестр раскладки о нём не знает.
   */
  gallery?: string;
  /**
   * Адрес кадра, с которого открывать галерею: плитка в редакции кадра показывает ОДИН снимок,
   * и открывать дроп с начала значило бы потерять тот кадр, по которому кликнули. Мозаика поле
   * игнорирует — там на экране сразу весь дроп, «открыть на кадре» не про что.
   */
  startAt?: string | null;
  /**
   * Кадры дропа, уже загруженные плиткой. Плитка тянет `getDrop(id)` ради своей мозаики/кадра
   * ещё до клика, и открывать галерею лоадером поверх тех же самых данных значило бы показать
   * пустую панель на ровном месте. С проявкой (§7.5) это ещё и обязательное условие: кадру не
   * из чего расти, пока сцены нет на экране.
   */
  initialPhotos?: FilmPhotoView[];
  /**
   * Кадр на борде, из которого растёт галерея (проявка, DESIGN §7.5). Приходит только оттуда,
   * где «тот самый кадр» определён — из редакции `frame`; без него галерея открывается как
   * прежде. Ссылка, а не прямоугольник: снимать его надо и на открытии, и на закрытии.
   */
  origin?: RefObject<HTMLElement | null>;
  /**
   * Кадр, который сейчас смотрят. Плитка борда переходит на него, чтобы проявка возвращалась
   * в кадр, из которого выходишь, а не в тот, с которого входил (DESIGN §7.5).
   */
  onFrameShown?: (photo: FilmPhotoView) => void;
  onClose: () => void;
}

/**
 * Модалка-галерея фото-дропа (PRD §5.12, DESIGN §7.5) — большое всплывающее окно (НЕ новая
 * вкладка). Затемнённый фон, закрытие по `×`/`Esc`/клику по фону, фокус-трап, вертикальный
 * скролл (≈36 кадров длиннее экрана). Композиция по умолчанию — квантованная мозаика: кадр
 * занимает целое число клеток сетки (лежачий 3×2, стоячий 2×3 — по шесть клеток у обоих), кадры
 * идут по полосам сверху вниз (`dropMosaic.ts`). Кадров нет — пустое состояние.
 *
 * **Редакцию галереи выбирает волна** (`layout.gallery`, DESIGN §10.1), как и редакцию плитки:
 * `roll` — плёнка ([DropRoll]), где дроп читается одной катушкой; всё остальное — мозаика.
 * Модалка о волнах не знает, ей приходит имя редакции строкой.
 *
 * Загрузка кадров — **blur-up**: сразу виден крошечный `thumbUrl` (размытый, он лёгкий и обычно
 * уже в кэше борда), полноразмерный `imageUrl` грузится `loading="lazy"` (только видимое) и по
 * `onLoad` резко «наводится на резкость» поверх размытого. Размытый thumb остаётся непрозрачной
 * подложкой (не гаснет) — так во время проявления полного кадра сквозь него не мелькает фон
 * тайла. Никакой «доливки по чуть-чуть»: кадр не появляется из пустоты (см. [BlurUpPhoto]).
 *
 * Каждый кадр — **кнопка**: клик открывает его во весь экран слоем поверх галереи
 * ([PhotoLightbox]). Слой именно поверх, а не вместо: закрыл кадр — набор дропа на месте, и
 * закрытие кадра не закрывает галерею (Esc гасит верхний слой, следующий Esc — саму галерею).
 */
export function PhotoDropModal({
  dropId,
  title,
  monthLabel,
  gallery,
  startAt,
  initialPhotos,
  origin,
  onFrameShown,
  onClose,
}: PhotoDropModalProps) {
  const roll = gallery === "roll";
  const { phase, data } = useTileData<FilmPhotoView[]>(
    useCallback((signal) => getDrop(dropId, { signal }), [dropId]),
  );
  const photos = data ?? initialPhotos ?? [];
  // Кадры с плитки — полноценное содержимое, а не «копия на секунду»: это ответ того же
  // `getDrop(id)`. Пока едет свой запрос, галерея уже открыта и работает; ответ её обновит.
  const shown = photos.length > 0 ? "loaded" : phase;
  const sceneRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  // Кадр, открытый во весь экран, и плитка, с которой его открыли (ей вернём фокус).
  const [zoomed, setZoomed] = useState<number | null>(null);
  const zoomTriggerRef = useRef<HTMLElement | null>(null);

  // Клеток по ширине — не медиазапросом: раскладку считает JS, и число полос ему нужно тем же
  // числом, каким сетка объявлена, иначе кадры уехали бы за её край.
  const units = useMosaicUnits();
  const cells = useMemo(
    () => columnMajorMosaic(photos.map(isPortrait), units),
    [photos, units],
  );

  // Проявка: кадр растёт из плитки и наводится на резкость (DESIGN §7.5). Шов общий, включает
  // его волна (`--drop-morph`), поэтому здесь нет ни ключа волны, ни единого числа анимации.
  const { playIn, requestClose } = useDropMorph({ origin, sceneRef, onClose });
  // Играем, когда сцена кадра уже разложена: до появления кадров мерить нечего. Layout-эффект,
  // а не обычный, — трансформация обязана лечь ДО первой отрисовки галереи, иначе кадр успеет
  // мигнуть на своём месте. SSR тут не страшен: галерея существует только после клика.
  useLayoutEffect(() => {
    if (shown === "loaded" && photos.length > 0) playIn();
  }, [shown, photos.length, playIn]);

  const closeZoom = useCallback(() => {
    setZoomed(null);
    zoomTriggerRef.current?.focus();
  }, []);

  // Системное «Назад» закрывает окно, а не уводит с сайта (DESIGN §9). Слоёв два, и порядок
  // объявления есть порядок закрытия: сперва кадр во весь экран, потом сама галерея.
  useBackToClose(true, requestClose);
  useBackToClose(zoomed !== null, closeZoom);

  // Первичный фокус — один раз на маунте: переоткрытие кадра не должно уводить фокус в шапку.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Esc закрывает верхний слой; Tab держим в его пределах (минимальный фокус-трап, §9).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (zoomed !== null) closeZoom();
        else requestClose();
        return;
      }
      if (e.key !== "Tab") return;
      const trap = lightboxRef.current ?? panelRef.current;
      const focusable = trap?.querySelectorAll<HTMLElement>(
        'button, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose, zoomed, closeZoom]);

  return (
    <>
      <div
        ref={sceneRef}
        className="drop-scene modal-scale fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6"
        onClick={requestClose}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          // При четырёх кадрах в ряду ширина панели И ЕСТЬ размер кадра, поэтому она широкая:
          // на узкой панели горизонтальный кадр уходит за 250px — мелко для просмотра плёнки.
          // `--roll`: плёнка вписывается в экран целиком (см. common.css). Мозаика этого не
          // получает — её тридцать шесть кадров длиннее экрана по построению, и скролл там смысл.
          className={`drop-modal__panel pixel-tile my-auto w-full max-w-[64rem] p-4 ${roll ? "drop-modal__panel--roll" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Подложка «коробочки» + белая внутренняя рамка (§2.4) — как у TileShell:
              панель-модалка несёт .pixel-tile сама, элементы слоёв добавляем сами. */}
          <span className="pixel-slab" aria-hidden />
          <span className="pixel-lid" aria-hidden />
          <div className="drop-modal__head mb-3 flex items-center justify-between">
            <div className="flex flex-col">
              <span style={{ fontSize: "var(--fs-modal-title)", color: "var(--text-primary)" }}>{title}</span>
              {monthLabel && (
                <span style={{ ...monoTertiary }}>{monthLabel}</span>
              )}
            </div>
            <button
              ref={closeRef}
              type="button"
              className="tap-target"
              onClick={requestClose}
              aria-label="Закрыть"
              style={{ ...monoTertiary, cursor: "pointer", background: "none", border: "none", display: "inline-flex" }}
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          {shown === "loading" && <p style={monoTertiary}>загрузка…</p>}
          {shown === "error" && <p style={monoTertiary}>не удалось загрузить дроп</p>}
          {shown === "loaded" && photos.length === 0 && (
            <p style={monoTertiary}>в этом дропе пока нет кадров</p>
          )}
          {shown === "loaded" && photos.length > 0 && roll && (
            // Плёнка: одна лента вместо сетки (DESIGN §7.5). Кадр во весь экран открывает
            // только кнопка лупы — по самому снимку водят мышью, разглядывая находки.
            <DropRoll
              photos={photos}
              startAt={startAt}
              onZoom={(index, trigger) => {
                zoomTriggerRef.current = trigger;
                setZoomed(index);
              }}
              onCurrent={onFrameShown}
            />
          )}
          {shown === "loaded" && photos.length > 0 && !roll && (
            // Квантованная мозаика: кадр занимает целое число клеток базовой сетки — горизонтальный
            // 3×2, вертикальный 2×3. Площади равны по построению (6 клеток у обоих), поэтому
            // вертикальный кадр не выходит вдвое мельче соседа, как это было бы у justified
            // (тот равняет высоту ряда, а при равной высоте площадь идёт за пропорцией).
            // Пропорция округляется до 3:2 — на живых дропах это 0.3% обрезки, глазом не видно.
            <div
              className="drop-gallery"
              style={{ gridTemplateColumns: `repeat(${units}, 1fr)` }}
            >
              {photos.map((p, i) => (
                <BlurUpPhoto
                  key={p.imageUrl}
                  photo={p}
                  index={i}
                  cell={cells[i]}
                  onOpen={(el) => {
                    zoomTriggerRef.current = el;
                    setZoomed(i);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      {zoomed !== null && photos[zoomed] && (
        <PhotoLightbox
          ref={lightboxRef}
          photo={photos[zoomed]}
          index={zoomed}
          total={photos.length}
          // Из плёнки кадр открывается ЧИСТЫМ: находки разглядывают на
          // самой плёнке, а полный экран существует ради снимка — рамки поверх него мешают.
          artifacts={!roll}
          onClose={closeZoom}
        />
      )}
    </>
  );
}

/**
 * Кадр во весь экран — слой ПОВЕРХ галереи (не замена): под ним остаётся набор дропа, и
 * закрытие возвращает ровно то, что было. Картинка вписывается целиком (`object-fit: contain`) —
 * плёночный кадр смотрят целиком, обрезать его на просмотре бессмысленно. Закрытие: фон, `×`,
 * `Esc`; клик по самой картинке НЕ закрывает — промах мимо фона не должен стоить просмотра.
 */
const PhotoLightbox = forwardRef<
  HTMLDivElement,
  {
    photo: FilmPhotoView;
    index: number;
    total: number;
    /** Показывать ли находки поверх кадра; `false` — чистый снимок (плёнка, см. [DropRoll]). */
    artifacts?: boolean;
    onClose: () => void;
  }
>(function PhotoLightbox({ photo, index, total, artifacts = true, onClose }, ref) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  const coarse = useCoarsePointer();
  const boxes = photo.artifacts ?? [];
  const ratio = photo.width && photo.height ? `${photo.width} / ${photo.height}` : undefined;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={`кадр ${index + 1} из ${total}`}
      className="modal-scale fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(20, 15, 12, 0.92)" }}
      onClick={onClose}
    >
      {/* Сцена повторяет пропорцию кадра, поэтому картинка заполняет её без полей, а рамки
          находок можно ставить процентами прямо от неё. Без известных `width/height` пропорции
          нет — тогда сцена просто обнимает картинку, а рамки не рисуются (ставить их было бы
          некуда: `contain` оставил бы поля, и проценты поехали бы). */}
      <span
        className="lightbox-stage"
        style={ratio ? { aspectRatio: ratio } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lightbox-photo" src={mediaUrl(photo.imageUrl)} alt="" />
        {/* Тач-флоу (DESIGN §7.5): на телефоне ховера нет, а тап по кадру занят открытием на
            весь экран — поэтому находки объясняет сам полноэкранный кадр, показывая карточки
            сразу. «Постоянные подписи — шум» тут не применимо: кадр ровно один, а не 36.
            На мыши полный экран не несёт находок вовсе: там их показывает
            наведение в самой галерее, а поверх открытого снимка объяснять уже нечего. */}
        {artifacts && ratio && coarse && (
          <ArtifactBoxes boxes={boxes} shown={boxes.map((a) => a.artifactId)} />
        )}
      </span>
      <button
        ref={closeRef}
        type="button"
        className="tap-target lightbox-close"
        onClick={onClose}
        aria-label="Закрыть кадр"
      >
        <Icon name="close" size={22} />
      </button>
    </div>
  );
});

const monoTertiary = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-modal-meta)",
  color: "var(--text-tertiary)",
} satisfies CSSProperties;

/**
 * Один кадр с blur-up-загрузкой: размытый `thumbUrl` виден сразу, полноразмерный `imageUrl`
 * грузится лениво и по готовности проступает поверх (кросс-фейд, thumb гаснет). Место кадра
 * держит его клетка мозаики ([cell]) — до загрузки сетка уже стоит и не «прыгает». Уважает
 * `prefers-reduced-motion` (без анимации переходов — кадр появляется сразу по готовности).
 */
function BlurUpPhoto({
  photo,
  index,
  cell,
  onOpen,
}: {
  photo: FilmPhotoView;
  index: number;
  /** Клетка мозаики; `undefined` — раскладка ещё не посчитана, кадр идёт автопотоком. */
  cell?: MosaicCell;
  onOpen: (trigger: HTMLElement) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const portrait = isPortrait(photo);
  const boxes = photo.artifacts ?? [];
  // Какие находки сейчас под курсором. Считаем по точке, а не по :hover самой рамки: рамки
  // пересекаются (футболка и очки на одном человеке), а :hover достаётся только верхней.
  const [under, setUnder] = useState<number[]>([]);

  const trackPointer = (e: ReactMouseEvent<HTMLElement>) => {
    if (boxes.length === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const ids = boxesAt(boxes, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
      .map((b) => b.artifactId);
    setUnder((cur) => {
      // Держим ПОРЯДОК НАВЕДЕНИЯ, а не порядок находок: кто вошёл под курсор позже, того
      // карточка и лежит сверху. Иначе в пересечении рамок одна и та же плашка всегда была бы
      // верхней, и к нижней находке подвести мышь было бы нельзя — её карточку не увидеть.
      const kept = cur.filter((id) => ids.includes(id));
      const next = [...kept, ...ids.filter((id) => !kept.includes(id))];
      // Мышь шлёт события пачками — перерисовываемся только когда набор реально сменился.
      return cur.length === next.length && cur.every((v, i) => v === next[i]) ? cur : next;
    });
  };

  return (
    <button
      type="button"
      className="drop-frame"
      aria-label={`открыть кадр ${index + 1} на весь экран`}
      onClick={(e) => onOpen(e.currentTarget)}
      onMouseMove={trackPointer}
      onMouseLeave={() => setUnder([])}
      // Пропорцию клетки задаёт CSS по этому хуку, место в сетке — расчёт раскладки.
      data-portrait={portrait ? "true" : undefined}
      style={{
        position: "relative",
        gridColumn: cell && `${cell.col + 1} / span ${cell.w}`,
        gridRow: cell && `${cell.row + 1} / span ${cell.h}`,
      }}
    >
      {/* Клипует ИМЕННО картинку, а не весь кадр: `filter: blur()` на thumb расплывается за
          границы элемента, и без клипа кадры «светятся» ореолом по всему периметру. Клип на
          самом кадре был бы шире нужного — он резал бы и подписи артефактов, которым надо
          выходить за кадр целиком (имя предмета длиннее рамки — обычное дело). */}
      <span
        style={{
          position: "relative",
          display: "block",
          overflow: "hidden",
          background: "var(--bg-surface-muted)",
          borderRadius: "var(--radius-sm)",
          // Форму задаёт клетка мозаики, а не пропорция кадра: картинка её заполняет
          // (`cover`), обрезая свои же 0.3% — округление 1.495 до 3:2.
          height: "100%",
        }}
      >
        {/* Размытое превью — непрозрачная подложка: держит цвет/композицию всё время, пока
            проявляется полный кадр (не гасим, иначе в кросс-фейде мелькнёт фон тайла). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl(photo.thumbUrl)}
          alt=""
          aria-hidden
          className="blur-up-thumb"
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "var(--radius-sm)",
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl(photo.imageUrl)}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className="blur-up-full"
          data-loaded={loaded}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "var(--radius-sm)",
          }}
        />
        {/* Затемнение по наведению — сигнал «кадр кликабелен». Лежит внутри клипа, чтобы не
            вылезать за скруглённый край картинки. */}
        <span className="drop-frame__scrim" aria-hidden />
      </span>
      <ArtifactBoxes boxes={boxes} shown={under} />
      {/* Значок «крупнее» — последним в дереве, чтобы лежать поверх всего кадра. Он декор:
          что кадр открывается, скринридеру говорит доступное имя кнопки. */}
      <span className="drop-frame__zoom" aria-hidden>
        <Icon name="zoom" size={16} />
      </span>
    </button>
  );
}

/**
 * Стоячий ли кадр. Размеров нет (кадр залит до того, как их стали хранить) — считаем лежачим:
 * это форма большинства кадров плёнки, и мозаика от одной догадки не разъедется.
 */
function isPortrait(photo: FilmPhotoView): boolean {
  const w = photo.width ?? 0;
  const h = photo.height ?? 0;
  return w > 0 && h > 0 && h > w;
}

/** Клеток по ширине мозаики: на узком окне полос две, а не четыре (иначе кадр мельче пальца). */
function useMosaicUnits(): number {
  const [units, setUnits] = useState(MOSAIC_UNITS);
  useEffect(() => {
    const mql = window.matchMedia?.(`(max-width: ${MOSAIC_NARROW_PX}px)`);
    if (!mql) return;
    const sync = () => setUnits(mql.matches ? MOSAIC_UNITS_NARROW : MOSAIC_UNITS);
    sync();
    mql.addEventListener?.("change", sync);
    return () => mql.removeEventListener?.("change", sync);
  }, []);
  return units;
}
