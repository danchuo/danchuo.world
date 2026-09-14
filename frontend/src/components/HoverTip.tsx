"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface HoverTipProps {
  /** Текст подсказки. `null` ⇒ подсказки нет: якорь рендерится голым, без обёртки. */
  text?: string | null;
  /**
   * Подсказка-КАРТОЧКА вместо строки текста (превью поста соцсети, DESIGN §7.9). Размещается
   * тем же кодом, что и текстовая: задача «всплыть у якоря и не попасть под клип плитки» у них
   * одна, и решать её дважды значило бы держать две копии выбора направления.
   *
   * ⚠️ Карточка уходит из дерева доступности (`aria-hidden`), в отличие от текстовой подсказки:
   * та ОПИСЫВАЕТ якорь и потому подцеплена `aria-describedby`, а карточка — картинка рядом со
   * ссылкой, и зачитывать её содержимое как описание ссылки на профиль незачем.
   */
  content?: ReactNode;
  /**
   * Подсказка-ФРАЗА, а не короткая строчка: переносится по словам и капается по ширине.
   * По умолчанию подсказка в одну строку (`nowrap`) — так её задумывал SVG-собрат у огонька,
   * где текст короткий (номер дня жизни, длина стрика).
   */
  phrase?: boolean;
  /**
   * Якорь занимает ячейку целиком вместо `inline-block` по содержимому.
   *
   * ⚠️ Нужен везде, где обёрнутое само тянется на всю ячейку (`w-full`/`h-full`). Обёртка
   * появляется ВМЕСТЕ с подсказкой, то есть по данным: у одной плитки из ряда она есть, у
   * соседних нет, и `inline-block` схлопывал бы растянутого ребёнка в ноль — предмет уезжал
   * бы из своей ячейки ровно в тот момент, когда доехали данные. Обёртка обязана быть
   * безразличной к раскладке; `display: contents` для этого не годится — у якоря не осталось
   * бы коробки, а по ней считается место подсказки.
   */
  fill?: boolean;
  children: ReactNode;
}

/** Зазор между якорем и подсказкой, он же отступ от края экрана. */
const GAP = 4;
const EDGE = 8;

/**
 * Подсказка-мини-плитка в стиле активной волны — HTML-близнец SVG-тултипа карты-тропы
 * (`.quest-tip` у огонька-стрика): та же поверхность, тот же глиняный кант, тот же моно.
 *
 * Нативный `title` для этого не годится: его рисует ОС, а не волна — серо-жёлтый прямоугольник
 * системным шрифтом поверх пиксельного борда, с секундной задержкой и своим курсором `help`,
 * который на неинтерактивной дате обещал больше, чем там есть. Один язык подсказок на борде
 * важнее того, что системный тултип достаётся даром.
 *
 * ⚠️ **Подсказка живёт в ПОРТАЛЕ, а не внутри плитки, и это несущее условие.** Плитка режет
 * содержимое (`overflow: hidden`) и снять клип нельзя — он держит выхлоп `filter: blur` кадров
 * (docs/pitfalls.md). Пока подсказка была ребёнком плитки, длинный текст обрезался её краем, и
 * лечить это подгонкой ширины/направления бессмысленно: любой из четырёх краёв рано или поздно
 * оказывается ближе, чем нужно. В портале подсказка меряется только ЭКРАНОМ. `position: fixed`
 * тут обязателен вместе с порталом: `.pixel-tile` несёт `filter`, а он делает плитку containing
 * block для `fixed` — оставь мы подсказку внутри, она прибилась бы к плитке и снова клипалась.
 *
 * Направление выбирается САМО: вниз, если под якорем есть место, иначе вверх; по горизонтали
 * подсказка прижимается к экрану, а не к якорю. Жёсткий выбор направления не годится:
 * «всегда вниз» ломается на якорях внизу борда, «всегда вверх» — на якорях в шапке.
 *
 * Скринридеру подсказка достаётся через `aria-describedby` — как описание, а не как имя:
 * дата обязана остаться датой, номер дня жизни лишь дополняет её (DESIGN §4).
 */
export function HoverTip({ text, content, phrase = false, fill = false, children }: HoverTipProps) {
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // Портал существует только на клиенте: на сервере `document` нет, а несовпадение разметки
  // при гидрации дороже, чем подсказка, появляющаяся кадром позже.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const place = useCallback(() => {
    const a = anchorRef.current;
    const t = tipRef.current;
    if (!a || !t) return;
    const ar = a.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    // Вниз, если под якорем помещается; иначе вверх. Решает ЭКРАН, а не плитка: из портала
    // подсказку больше ничто не режет.
    const below = ar.bottom + GAP + tr.height <= window.innerHeight - EDGE;
    const top = below ? ar.bottom + GAP : ar.top - GAP - tr.height;
    // По горизонтали идём от левого края якоря, но не даём уехать за экран.
    const maxLeft = window.innerWidth - EDGE - tr.width;
    const left = Math.max(EDGE, Math.min(ar.left, maxLeft));
    setPos({ top, left });
  }, []);

  const show = useCallback(() => {
    place();
    setOpen(true);
  }, [place]);
  const hide = useCallback(() => setOpen(false), []);

  // Экран уехал или изменился — подсказка прячется, а не висит оторванной от якоря.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [open, hide]);

  if (!text && !content) return <>{children}</>;

  const tip = content ? (
    <span
      ref={tipRef}
      className="hover-tip hover-tip--card"
      aria-hidden="true"
      data-open={open ? "true" : undefined}
      style={pos ? { top: pos.top, left: pos.left } : undefined}
    >
      {content}
    </span>
  ) : (
    <span
      ref={tipRef}
      className={`hover-tip${phrase ? " hover-tip--phrase" : ""}`}
      id={id}
      role="tooltip"
      data-open={open ? "true" : undefined}
      style={pos ? { top: pos.top, left: pos.left } : undefined}
    >
      {text}
    </span>
  );

  return (
    <>
      <span
        ref={anchorRef}
        className={`hover-tip-anchor${fill ? " hover-tip-anchor--fill" : ""}`}
        aria-describedby={content ? undefined : id}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {mounted && typeof document !== "undefined" ? createPortal(tip, document.body) : null}
    </>
  );
}
