"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { getDrop } from "@/lib/api/client";
import { boxesAt, padHighlight } from "@/lib/artifactHighlight";
import { laysOnSide } from "@/lib/artifactBox";
import { mediaUrl } from "@/lib/api/media";
import type { ArtifactBoxView, FilmPhotoView } from "@/lib/api/types";
import { Icon } from "./Icon";
import { useCoarsePointer } from "./useCoarsePointer";
import { useTileData } from "./useTileData";

interface PhotoDropModalProps {
  dropId: number;
  title: string;
  monthLabel: string | null;
  onClose: () => void;
}

/**
 * Модалка-галерея фото-дропа (PRD §5.12, DESIGN §7.5) — большое всплывающее окно (НЕ новая
 * вкладка). Затемнённый фон, закрытие по `×`/`Esc`/клику по фону, фокус-трап, вертикальный
 * скролл (≈36 кадров длиннее экрана). Композиция — плотная masonry по реальным размерам кадров
 * (CSS-колонки; точный justified-алгоритм — дизайн-TODO). До B1 кадров нет — пустое состояние.
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
export function PhotoDropModal({ dropId, title, monthLabel, onClose }: PhotoDropModalProps) {
  const { phase, data } = useTileData<FilmPhotoView[]>(
    useCallback((signal) => getDrop(dropId, { signal }), [dropId]),
  );
  const photos = data ?? [];
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  // Кадр, открытый во весь экран, и плитка, с которой его открыли (ей вернём фокус).
  const [zoomed, setZoomed] = useState<number | null>(null);
  const zoomTriggerRef = useRef<HTMLElement | null>(null);

  const closeZoom = useCallback(() => {
    setZoomed(null);
    zoomTriggerRef.current?.focus();
  }, []);

  // Первичный фокус — один раз на маунте: переоткрытие кадра не должно уводить фокус в шапку.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Esc закрывает верхний слой; Tab держим в его пределах (минимальный фокус-трап, §9).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (zoomed !== null) closeZoom();
        else onClose();
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
  }, [onClose, zoomed, closeZoom]);

  return (
    <>
      <div
        className="modal-scale fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6"
        style={{ background: "rgba(33, 26, 22, 0.55)" }}
        onClick={onClose}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="pixel-tile my-auto w-full max-w-4xl p-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Подложка «коробочки» + белая внутренняя рамка (§2.4) — как у TileShell:
              панель-модалка несёт .pixel-tile сама, элементы слоёв добавляем сами. */}
          <span className="pixel-slab" aria-hidden />
          <span className="pixel-lid" aria-hidden />
          <div className="mb-3 flex items-center justify-between">
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
              onClick={onClose}
              aria-label="Закрыть"
              style={{ ...monoTertiary, cursor: "pointer", background: "none", border: "none", display: "inline-flex" }}
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          {phase === "loading" && <p style={monoTertiary}>загрузка…</p>}
          {phase === "error" && <p style={monoTertiary}>не удалось загрузить дроп</p>}
          {phase === "loaded" && photos.length === 0 && (
            <p style={monoTertiary}>в этом дропе пока нет кадров</p>
          )}
          {phase === "loaded" && photos.length > 0 && (
            // Плотная masonry: CSS-колонки пакуют кадры разной ориентации без фиксированной сетки.
            <div style={{ columnGap: 6, columns: "3 160px" }}>
              {photos.map((p, i) => (
                <BlurUpPhoto
                  key={p.imageUrl}
                  photo={p}
                  index={i}
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
  { photo: FilmPhotoView; index: number; total: number; onClose: () => void }
>(function PhotoLightbox({ photo, index, total, onClose }, ref) {
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
            На мыши полный экран не несёт находок вовсе (решение владельца): там их показывает
            наведение в самой галерее, а поверх открытого снимка объяснять уже нечего. */}
        {ratio && coarse && <ArtifactBoxes boxes={boxes} shown={boxes.map((a) => a.artifactId)} />}
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
 * Рамки находок поверх кадра (§5.12). Позиция — **в процентах**: координаты приходят долями
 * кадра, а кадр рендерится в разном размере (мозаика, галерея, полный экран), так что множитель
 * задаёт вёрстка.
 *
 * [shown] — чьи карточки сейчас раскрыты, **в порядке появления**: индекс задаёт высоту слоя,
 * поэтому в пересечении рамок сверху оказывается та, что открылась позже. В галерее это порядок
 * наведения, в полноэкранном кадре — просто все находки (тач-флоу, см. [PhotoLightbox]).
 */
function ArtifactBoxes({ boxes, shown }: { boxes: ArtifactBoxView[]; shown: number[] }) {
  return (
    <>
      {boxes.map((a) => {
        // Рамка намеренно шире находки: показываем область, а не обводим предмет по краю.
        const r = padHighlight(a);
        return (
          <span
            key={a.artifactId}
            className="artifact-box"
            style={{
              left: `${r.x0 * 100}%`,
              top: `${r.y0 * 100}%`,
              width: `${r.width * 100}%`,
              height: `${r.height * 100}%`,
            }}
          >
            {/* Имя — в разметке ВСЕГДА: подсказка живёт по наведению, а ховера у скринридера
                нет, и без этого находка для него просто не существовала бы. */}
            <span className="sr-only">{a.name}</span>
            {shown.includes(a.artifactId) && (
              // Карточка предмета: сам предмет картинкой + имя под ней. Имя словами не объясняет,
              // что это за надпись на фото, — знакомый вырезанный предмет объясняет сразу.
              <span
                className="artifact-card"
                aria-hidden
                style={{ zIndex: shown.indexOf(a.artifactId) + 1 }}
              >
                {a.imageUrl && (
                  <ArtifactCardImage src={a.imageUrl} rotatable={a.rotatable === true} />
                )}
                <span className="artifact-card__name">{a.name}</span>
              </span>
            )}
          </span>
        );
      })}
    </>
  );
}

/**
 * Предмет внутри карточки-подсказки. Слот карточки **лежачий**, а предмет бывает нарисован
 * стоймя (ракетка ~1:3.3) — в contain он вырождается в нитку и опознать его нельзя. Поэтому
 * карточка уважает тот же флаг «можно набок», что и лента (DESIGN §7.2): флаг разрешает,
 * решает пропорция самой картинки, и меряется она только по факту загрузки — до `onLoad`
 * пропорции нет, а повернуть «на всякий случай» значит показать предмет боком.
 */
function ArtifactCardImage({ src, rotatable }: { src: string; rotatable: boolean }) {
  const [ratio, setRatio] = useState(0);
  // Слот лежачий ⇒ vertical = false.
  const tilted = laysOnSide(ratio, rotatable, false);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={`artifact-card__img${tilted ? " artifact-card__img--tilted" : ""}`}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (img.naturalHeight > 0) setRatio(img.naturalWidth / img.naturalHeight);
      }}
    />
  );
}

/**
 * Один кадр с blur-up-загрузкой: размытый `thumbUrl` виден сразу, полноразмерный `imageUrl`
 * грузится лениво и по готовности проступает поверх (кросс-фейд, thumb гаснет). `aspect-ratio`
 * из реальных `width/height` держит место кадра до загрузки — колонки не «прыгают». Если
 * размеров нет, обёртка просто обнимает контент. Уважает `prefers-reduced-motion` (без анимации
 * переходов — кадр появляется сразу по готовности).
 */
function BlurUpPhoto({
  photo,
  index,
  onOpen,
}: {
  photo: FilmPhotoView;
  index: number;
  onOpen: (trigger: HTMLElement) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const ratio = photo.width && photo.height ? `${photo.width} / ${photo.height}` : undefined;
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
      className="drop-frame mb-1.5"
      aria-label={`открыть кадр ${index + 1} на весь экран`}
      onClick={(e) => onOpen(e.currentTarget)}
      onMouseMove={trackPointer}
      onMouseLeave={() => setUnder([])}
      style={{ position: "relative", breakInside: "avoid" }}
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
          aspectRatio: ratio,
        }}
      >
        {/* Размытое превью — непрозрачная подложка: держит цвет/композицию всё время, пока
            проявляется полный кадр (не гасим, иначе в кросс-фейде мелькнёт фон тайла). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl(photo.thumbUrl)}
          alt=""
          aria-hidden
          className="blur-up-thumb w-full"
          style={{ display: "block", borderRadius: "var(--radius-sm)" }}
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
