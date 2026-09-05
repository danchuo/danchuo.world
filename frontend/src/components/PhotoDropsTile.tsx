"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { getDrops } from "@/lib/api/client";
import { mediaUrl } from "@/lib/api/media";
import {
  CAROUSEL_RADIUS_PX,
  CAROUSEL_SLOT_PX,
  slotLook,
} from "@/lib/dropCarousel";
import { ROLL_SETTLE_PX, nearestFrameIndex, stripPadding, wheelStep } from "@/lib/dropRoll";
import type { FilmDropView, FilmPhotoView } from "@/lib/api/types";
import type { TileOrientation } from "@/lib/layout";
import { PhotoDropModal } from "./PhotoDropModal";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

interface PhotoDropsTileProps {
  style?: CSSProperties;
  className?: string;
  /**
   * Content flow (DESIGN §10.1): "horizontal" — a strip of cover cards with titles below
   * (readable, no truncation to nothing); "vertical" (default) — the compact list of rows.
   */
  orientation?: TileOrientation;
  /**
   * Вёрстка ленты (DESIGN §7.5) — выбирает ВОЛНА через раскладку (`tiles.photoDrops.edition`):
   * - не задана / незнакомая — прежние ленты, которыми правит [orientation];
   * - `carousel` — карусель архива: кадр в середине окна крупный, дальние уходят в холст (волна 03).
   */
  edition?: string;
  /** Редакция галереи из раскладки волны (см. [PhotoDropModal]). */
  gallery?: string;
}

/** Незнакомое имя редакции ⇒ дефолт: набор редакций — знание тайла, а не реестра раскладки. */
function resolveEdition(value: string | undefined): "carousel" | "default" {
  return value === "carousel" ? "carousel" : "default";
}

/**
 * Компактная лента фото-дропов (D) — PRD §5.12, DESIGN §7.5. Маленькое перечисление всех дропов
 * (обложка + название), новые слева; клик по дропу → модалка-галерея. Сама лента и есть архив —
 * отдельной страницы нет. Крупно последний дроп показывает отдельный [LatestDropTile]. До первой
 * загрузки через /admin дропов нет ⇒ тихий empty «пока нет дропов».
 */
export function PhotoDropsTile({
  style,
  className,
  orientation = "vertical",
  edition: editionRaw,
  gallery,
}: PhotoDropsTileProps) {
  const edition = resolveEdition(editionRaw);
  const { phase, data, retry } = useTileData<FilmDropView[]>(
    useCallback((signal) => getDrops({ signal }), []),
    "drops",
  );
  const drops = data ?? [];
  const isEmpty = phase === "loaded" && drops.length === 0;
  const [openDrop, setOpenDrop] = useState<FilmDropView | null>(null);
  // Карусель — вёрстка вертикальная по своей природе, поэтому она сильнее ориентации: волна,
  // забывшая снять `orientation: horizontal`, не должна получить ленту внутри колонки.
  const carousel = edition === "carousel";
  const horizontal = !carousel && orientation === "horizontal";
  const shelfRef = useRef<HTMLUListElement>(null);
  const reelRef = useRef<HTMLUListElement>(null);
  // Плитка, из которой растёт галерея: проявке нужен именно тот кадр, по которому кликнули.
  const originRef = useRef<HTMLElement | null>(null);
  /**
   * Кадр, на котором закрыли галерею, — по дропу. Нужен, чтобы проявка возвращалась в тот
   * кадр, из которого выходишь, а не в тот, с которого входил (то же правило, что у плитки
   * последнего дропа, DESIGN §7.5). Живёт в памяти вкладки: перезагрузка страницы молча
   * возвращает обложку, выбранную владельцем, — и это верно, а не забывчивость.
   */
  const [viewed, setViewed] = useState<Record<number, FilmPhotoView>>({});
  /**
   * Первая обложка доехала. До этого лента не рисуется вовсе: с плитой, снятой скином волны,
   * пустой каркас читался мигающим прямоугольником на холсте (замечание владельца о жёсткой
   * перезагрузке). На повторных загрузках данные уже в кэше, и ленте нечего ждать.
   */
  const [coversReady, setCoversReady] = useState(false);
  // Какой дроп стоит в середине окна: он и есть «текущий» для доступности. Индекс, а не id,
  // — позиция в ленте здесь и есть ответ, а он меняется от прокрутки, не от данных.
  const [centered, setCentered] = useState(0);

  // Карусель: вид каждого кадра — чистая функция расстояния до середины окна
  // (`slotLook`, DESIGN §7.5). Считаем императивно по ref, а не состоянием на кадр
  // прокрутки: раскладка от этого не зависит, а перерисовывать React 60 раз в секунду
  // ради двух CSS-свойств незачем. В состояние уезжает только смена центрального кадра.
  useEffect(() => {
    const el = reelRef.current;
    if (!el || !carousel) return;

    // Боковой запас ленты: без него КРАЙНИЕ дропы недостижимы — по центру окна встаёт не
    // первый кадр, а тот, что отстоит от края на полокна (тот же приём и та же функция,
    // что у ленты галереи плёнки).
    const layout = () => {
      const pad = stripPadding(el.clientHeight, CAROUSEL_SLOT_PX);
      el.style.paddingBlock = `${pad}px`;
    };

    const paint = () => {
      const box = el.getBoundingClientRect();
      const mid = box.top + box.height / 2;
      const centers: number[] = [];
      for (const node of Array.from(el.children)) {
        const li = node as HTMLElement;
        const rect = li.getBoundingClientRect();
        // Масштаб держит центр слота на месте (`transform-origin` по умолчанию — середина),
        // поэтому замер по нему не гоняет сам себя: центр не зависит от своего же масштаба.
        const center = rect.top + rect.height / 2;
        centers.push(center);
        const look = slotLook(center - mid, CAROUSEL_RADIUS_PX);
        li.style.transform = `scale(${look.scale})`;
        li.style.opacity = String(look.opacity);
        li.style.zIndex = String(look.zIndex);
      }
      if (centers.length > 0) setCentered(nearestFrameIndex(centers, mid));
    };

    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        paint();
      });
    };

    // Колесо мыши лента разбирает САМА, а не отдаёт браузеру: щелчок стоит ровно один дроп,
    // всегда одинаково. Отданная браузеру прокрутка спорила со снапом — тот доводил кадр в
    // середину поверх ещё едущего щелчка, и лента то шла ровно, то вязла. Решает [wheelStep]
    // — та же чистая функция, что у плёнки: щелчок мыши = один шаг, мелкие дельты трекпада
    // копятся до порога. На краях колесо отдаётся странице (не запираем прокрутку).
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 0) return;
      const down = e.deltaY > 0;
      if ((!down && el.scrollTop <= 0) || (down && el.scrollTop >= max - 1)) return;
      const step = wheelStep(e.deltaX, e.deltaY, e.deltaMode, acc);
      acc = step.acc;
      e.preventDefault();
      if (step.dir === 0) return;
      const slots = Array.from(el.children) as HTMLElement[];
      const box = el.getBoundingClientRect();
      const mid = box.top + box.height / 2;
      const from = nearestFrameIndex(
        slots.map((li) => {
          const r = li.getBoundingClientRect();
          return r.top + r.height / 2;
        }),
        mid,
      );
      const next = slots[Math.min(slots.length - 1, Math.max(0, from + step.dir))];
      if (next) el.scrollTo({ top: next.offsetTop - (el.clientHeight - next.offsetHeight) / 2, behavior: "smooth" });
    };

    layout();
    paint();
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    // Замеры держит живыми ResizeObserver (ресайз окна, смена волны/раскладки). В jsdom его
    // нет — там лента просто остаётся с первой раскраской, и это ровно то, что проверяют тесты.
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      layout();
      paint();
    });
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      ro?.disconnect();
      // Стереть за собой ВСЁ, что эффект написал в разметку. Инлайновые стили ставит не
      // React, а этот эффект, и React их не уберёт: смена волны меняет редакцию ленты, но
      // `<ul>` и `<li>` остаются на своих местах в дереве — узлы переиспользуются, и на
      // прежней ленте оставались масштаб, прозрачность и боковой запас карусели (на волне 01
      // это читалось «список есть, а картинок нет»).
      el.style.paddingBlock = "";
      for (const node of Array.from(el.children)) {
        const li = node as HTMLElement;
        li.style.transform = "";
        li.style.opacity = "";
        li.style.zIndex = "";
      }
    };
  }, [carousel, phase, drops.length]);

  // Живой скролл горизонтальной полки без видимого ползунка (DESIGN §7.5): вертикальное колесо
  // мыши листает полку вбок. Перетаскивания мышью НЕТ намеренно — оно перехватывало клик и
  // мешало открывать дроп на весь экран; листаем только колесом (и родным touch/трекпадом).
  // На краях колесо отдаётся странице (не запираем прокрутку).
  useEffect(() => {
    const el = shelfRef.current;
    if (!el || !horizontal) return;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // родной горизонтальный (трекпад)
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft >= max - 1;
      if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return; // край → страница скроллит
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [horizontal, phase, drops.length]);

  /**
   * Открыть дроп из карусели. Если кадр стоит не по центру окна, лента СНАЧАЛА доматывает
   * его в середину и только потом отдаёт галерею: проявка растёт из кадра, и расти ей надо
   * из того места, куда смотрит зритель, — иначе галерея выезжает из края плитки.
   */
  const openFromReel = (drop: FilmDropView, card: HTMLElement) => {
    originRef.current = card;
    const reel = reelRef.current;
    const slot = card.closest("li");
    if (!reel || !slot) {
      setOpenDrop(drop);
      return;
    }
    const offset = () => {
      const box = reel.getBoundingClientRect();
      const r = slot.getBoundingClientRect();
      return r.top + r.height / 2 - (box.top + box.height / 2);
    };
    const off = offset();
    if (Math.abs(off) <= ROLL_SETTLE_PX) {
      setOpenDrop(drop);
      return;
    }
    reel.scrollTo({ top: reel.scrollTop + off, behavior: "smooth" });
    // Ждём, пока лента доедет. Потолок по времени обязателен: плавная прокрутка не обещает
    // попасть в точку, и без него клик по краю ленты мог не открыть дроп вовсе.
    const startedAt = performance.now();
    const settle = () => {
      if (Math.abs(offset()) <= ROLL_SETTLE_PX * 3 || performance.now() - startedAt > 600) {
        setOpenDrop(drop);
        return;
      }
      requestAnimationFrame(settle);
    };
    requestAnimationFrame(settle);
  };

  return (
    <>
      <TileShell
        state={isEmpty ? "empty" : phase}
        emptyText="пока нет дропов"
        onRetry={retry}
        label="дропы"
        ariaLabel="Фото-дропы"
        style={style}
        className={className}
      >
        {phase === "loaded" && !isEmpty && (carousel ? (
          // Карусель архива: кадры едут вертикальной лентой, и главный тот, что встал в
          // середину окна. Прокрутка и есть орган управления — наведение в раскладке не
          // участвует, поэтому лента не дёргается под курсором и одинаково ведёт себя на
          // трёх дропах и на трёхстах. Масштаб и яркость пишет `slotLook` (см. эффект выше).
          //
          // Обложка — <img>, а не фон: слот фиксированной высоты, кадру нужен только
          // `object-fit`, а браузеру — знание, что это картинка (ленивая загрузка, декод).
          <ul
            ref={reelRef}
            className={`drop-carousel scroll-invisible tile-frame${coversReady ? " is-ready" : ""}`}
          >
            {drops.map((d, i) => {
              // Обложка дропа — та, на которой закрыли его галерею; до первого захода и
              // после перезагрузки страницы это обложка, выбранная владельцем.
              const cover = viewed[d.id]?.thumbUrl ?? d.coverPhotoUrl;
              return (
              <li key={d.id} className="drop-carousel__slot">
                <button
                  type="button"
                  onClick={(e) => openFromReel(d, e.currentTarget)}
                  className="drop-carousel__card"
                  aria-current={i === centered ? "true" : undefined}
                  aria-label={`Открыть дроп «${d.title}»`}
                >
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mediaUrl(cover)}
                      alt=""
                      className="drop-carousel__cover"
                      onLoad={() => setCoversReady(true)}
                      // Битая обложка ленту не запирает: показываем то, что есть.
                      onError={() => setCoversReady(true)}
                    />
                  ) : (
                    <span aria-hidden className="drop-carousel__cover drop-carousel__cover--blank" />
                  )}
                  <span className="drop-carousel__label">
                    <span className="t-drops-title drop-carousel__title" title={d.title}>
                      {d.title}
                    </span>
                    <span className="t-drops-month drop-carousel__month">{d.monthLabel ?? ""}</span>
                  </span>
                </button>
              </li>
              );
            })}
          </ul>
        ) : horizontal ? (
          // Horizontal strip: big cover cards with the title underneath. Extra drops scroll
          // sideways; no visible scrollbar — the cut-off card at the edge is the affordance.
          <ul
            ref={shelfRef}
            className="scroll-invisible tile-frame flex h-full items-stretch gap-3 overflow-x-auto overflow-y-hidden"
          >
            {drops.map((d) => (
              <li key={d.id} className="flex h-full min-w-0 shrink-0">
                <button
                  type="button"
                  onClick={() => setOpenDrop(d)}
                  className="flex h-full min-h-0 flex-col gap-1 text-left"
                  // Card width tuned so a sliver of the next card peeks out at the tile edge —
                  // the visible cut-off is the affordance that the strip scrolls sideways.
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, width: 84 }}
                  aria-label={`Открыть дроп «${d.title}»`}
                >
                  {d.coverPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mediaUrl(d.coverPhotoUrl)}
                      alt=""
                      className="min-h-0 w-full flex-1"
                      style={{ objectFit: "cover", borderRadius: "var(--radius-sm)" }}
                    />
                  ) : (
                    <span aria-hidden className="min-h-0 w-full flex-1" style={{ background: "var(--bg-surface-muted)", borderRadius: "var(--radius-sm)" }} />
                  )}
                  <span
                    className="t-drops-title w-full"
                    style={{
                      lineHeight: 1.25,
                      color: "var(--text-secondary)",
                      // Two-line clamp: readable titles are the whole point of the horizontal
                      // strip — a one-line ellipsis ate half of every title.
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                    title={d.title}
                  >
                    {d.title}
                  </span>
                  <span className="t-drops-month" style={{ fontFamily: "var(--font-mono)", lineHeight: 1.2, color: "var(--text-tertiary)" }}>
                    {d.monthLabel ?? ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          // Вертикальный список листается тем же жестом и БЕЗ ползунка — как полка выше:
          // серая полоса поверх обложек читалась элементом интерфейса, а не подсказкой
          // (`scroll-invisible` в common.css; прокрутка колесом и тачпадом на месте).
          <ul className="scroll-invisible tile-frame flex h-full flex-col gap-1.5 overflow-y-auto">
            {drops.map((d) => (
              <li key={d.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => setOpenDrop(d)}
                  className="flex w-full items-center gap-2 text-left"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  aria-label={`Открыть дроп «${d.title}»`}
                >
                  {d.coverPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mediaUrl(d.coverPhotoUrl)}
                      alt=""
                      width={32}
                      height={32}
                      style={{ flexShrink: 0, width: 32, height: 32, objectFit: "cover", borderRadius: "var(--radius-sm)" }}
                    />
                  ) : (
                    <span aria-hidden style={{ flexShrink: 0, width: 32, height: 32, background: "var(--bg-surface-muted)", borderRadius: "var(--radius-sm)" }} />
                  )}
                  <span className="t-drops-title min-w-0 flex-1 truncate" style={{ color: "var(--text-secondary)" }}>
                    {d.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}
      </TileShell>

      {openDrop && (
        <PhotoDropModal
          dropId={openDrop.id}
          title={openDrop.title}
          monthLabel={openDrop.monthLabel}
          gallery={gallery}
          // Проявка: галерея растёт из того кадра ленты, по которому кликнули, и возвращается
          // в него же. Шов тот же, что у плитки последнего дропа, — компонент один.
          origin={originRef}
          startAt={viewed[openDrop.id]?.imageUrl ?? null}
          onFrameShown={(photo) => setViewed((v) => ({ ...v, [openDrop.id]: photo }))}
          onClose={() => setOpenDrop(null)}
        />
      )}
    </>
  );
}
