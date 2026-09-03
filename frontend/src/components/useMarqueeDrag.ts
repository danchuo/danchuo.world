"use client";

import { useCallback, useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import {
  DRAG_SLOP,
  decayVelocity,
  driftSpeed,
  flingVelocity,
  wheelDelta,
  wrapOffset,
  type DragSample,
} from "@/lib/marqueeMotion";

interface MarqueeDragOptions {
  /** Трек ленты — то, что едет внутри окна тайла. */
  trackRef: RefObject<HTMLElement | null>;
  /** Окно ленты — над ним ловится колесо (жест без нажатия принадлежит месту, а не предмету). */
  containerRef: RefObject<HTMLElement | null>;
  /** Размер одной копии контента вдоль ленты (px). `0` ⇒ лента влезла: ни хода, ни протяжки. */
  span: number;
  /** Вертикальная лента едет и тянется по Y (ориентация тайла из layout волны, DESIGN §10.1). */
  vertical: boolean;
  /** Время полного прохода копии — тот же темп, что задавала CSS-анимация. */
  seconds: number;
}

/**
 * Собственный ход ленты + протяжка рукой (DESIGN §7.2).
 *
 * Ход считает JS покадрово, а не CSS-анимация: CSS-кадры не остановить на середине и не сдвинуть
 * пальцем, а лента обязана слушаться руки в обе стороны и продолжать с того места, где её
 * отпустили. Позиция едет свойством `left`/`top`, а **не** `transform`, — по правилу из
 * `docs/pitfalls.md`: анимируемый `transform` уезжает в композитный слой WebKit, и `overflow`
 * плитки перестаёт его обрезать (уже ловили на бегущей строке карточки подкаста).
 *
 * Сдвиг применяется прямо в обработчике `pointermove`, а не в следующем кадре: лента идёт за
 * рукой, а не догоняет её.
 *
 * Третий вход в тот же механизм — колесо/тачпад при наведении, без нажатия: то же смещение,
 * так что все три способа продолжают ленту с одного места.
 */
export function useMarqueeDrag({ trackRef, containerRef, span, vertical, seconds }: MarqueeDragOptions) {
  const state = useRef({
    /** Текущее смещение ленты в пределах копии (px, растёт «вперёд»). */
    offset: 0,
    /** Скорость докатывания после броска (px/мс); 0 ⇒ идёт собственный ход. */
    velocity: 0,
    /** Указатель прижат к ленте. Ведётся и у ленты, которая никуда не едет: по этому же флагу
     *  отличается фокус от мыши (браузер даёт его на нажатии) от клавиатурного. */
    pressing: false,
    /** Путь указателя от нажатия — по нему жест делится на тап и протяжку. */
    moved: 0,
    /** Жест уже признан протяжкой ⇒ следующий клик гасим (иначе протяжка откроет меню). */
    dragged: false,
    /** Указатель над лентой — собственный ход стоит, чтобы предмет можно было разглядеть. */
    hover: false,
    last: 0,
    samples: [] as DragSample[],
  });
  /** Опция «меньше движения»: собственный ход выключен, но рукой листать по-прежнему можно —
   *  это движение затеял сам зритель, а не борд. */
  const reduced = useRef(false);

  const axis = vertical ? "top" : "left";
  const posOf = useCallback(
    (e: { clientX: number; clientY: number }) => (vertical ? e.clientY : e.clientX),
    [vertical],
  );

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    reduced.current = mq.matches;
    const onChange = () => (reduced.current = mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // Кадры: собственный ход и докатывание после броска. Пока тянут рукой — кадр ничего не считает,
  // позицию в этот момент ведёт сам `pointermove`.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || span <= 0) return;
    const s = state.current;
    const drift = driftSpeed(span, seconds);
    let frame = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      // Шаг кадра зажат в [0, 64]. Потолок — на случай, когда вкладка была в фоне и кадры не
      // шли: лента не должна прыгать за раз на всё пропущенное. Пол — потому что метка кадра
      // и `performance.now()` считаются от разных начал (в jsdom это видно сразу: первый шаг
      // выходил в минус на пару секунд, и лента стартовала уехавшей назад).
      const dt = Math.min(Math.max(now - prev, 0), 64);
      prev = now;
      if (!s.pressing) {
        if (s.velocity !== 0) {
          s.offset = wrapOffset(s.offset - s.velocity * dt, span);
          s.velocity = decayVelocity(s.velocity, dt);
        } else if (!s.hover && !reduced.current) {
          s.offset = wrapOffset(s.offset + drift * dt, span);
        }
        track.style[axis] = `${-s.offset}px`;
      }
      frame = requestAnimationFrame(tick);
    };
    track.style[axis] = `${-s.offset}px`;
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [trackRef, span, seconds, axis]);

  // Keep the current position while the measured loop span changes. Clear only
  // the axis that is no longer active when switching between orientations.
  useEffect(() => {
    return () => {
      const track = trackRef.current;
      if (!track) return;
      track.style[axis === "left" ? "top" : "left"] = "";
    };
  }, [trackRef, axis]);

  // Протяжка. Слушаем окно, а не сам трек: рука почти всегда уходит за пределы ленты, и на
  // `pointerleave` жест обрывался бы на полпути. Слушатели живут независимо от того, едет ли
  // лента: отпускание указателя надо ловить и у неподвижной — на нём гасится `pressing`.
  useEffect(() => {
    const s = state.current;
    const onMove = (e: PointerEvent) => {
      const track = trackRef.current;
      if (!s.pressing || !track || span <= 0) return;
      const pos = posOf(e);
      const step = pos - s.last;
      s.last = pos;
      s.moved += Math.abs(step);
      if (s.moved > DRAG_SLOP) s.dragged = true;
      s.offset = wrapOffset(s.offset - step, span);
      track.style[axis] = `${-s.offset}px`;
      s.samples.push({ t: performance.now(), pos });
      if (s.samples.length > 8) s.samples.shift();
    };
    const onUp = () => {
      if (!s.pressing) return;
      s.pressing = false;
      s.velocity = s.dragged ? flingVelocity(s.samples) : 0;
      s.samples = [];
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [trackRef, span, axis, posOf]);

  // Колесо и тачпад при наведении: листать, не прижимая указателя. Слушатель вешается руками и
  // НЕ пассивным — React регистрирует `wheel` на корне пассивно, и `preventDefault` из `onWheel`
  // молча ничего бы не дал: лента поехала бы вместе со страницей под ней.
  //
  // Своей инерции у колеса нет и не надо: докат после броска тачпад присылает сам, отдельными
  // событиями, — свой поверх него читался бы как разгон после конца жеста.
  useEffect(() => {
    const box = containerRef.current;
    // Лента влезла целиком ⇒ листать нечего, и колесо над тайлом остаётся страницы.
    if (!box || span <= 0) return;
    const s = state.current;
    const onWheel = (e: WheelEvent) => {
      const track = trackRef.current;
      const delta = wheelDelta(e, vertical);
      if (!track || delta === 0) return;
      e.preventDefault();
      s.velocity = 0;
      s.offset = wrapOffset(s.offset + delta, span);
      track.style[axis] = `${-s.offset}px`;
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [containerRef, trackRef, span, vertical, axis]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const s = state.current;
      s.pressing = true;
      if (span <= 0) return;
      s.velocity = 0;
      s.moved = 0;
      s.dragged = false;
      s.last = posOf(e);
      s.samples = [{ t: performance.now(), pos: s.last }];
      // Мышь иначе тащит саму картинку предмета вместо ленты. На тач `preventDefault` тут
      // не нужен: поперечный скролл страницы отдан браузеру через `touch-action`.
      if (e.pointerType === "mouse") e.preventDefault();
    },
    [span, posOf],
  );

  /** Клик, родившийся из протяжки, до предмета не доходит — иначе лента открывала бы меню. */
  const onClickCapture = useCallback((e: ReactMouseEvent<HTMLElement>) => {
    if (!state.current.dragged) return;
    state.current.dragged = false;
    e.stopPropagation();
    e.preventDefault();
  }, []);

  const onPointerEnter = useCallback(() => {
    state.current.hover = true;
  }, []);
  const onPointerLeave = useCallback(() => {
    state.current.hover = false;
  }, []);

  /** Прижат ли сейчас указатель — по нему отличается фокус от мыши от клавиатурного. */
  const isPointerDown = useCallback(() => state.current.pressing, []);

  return useMemo(
    () => ({
      /** Пропсы окна ленты. */
      handlers: { onPointerDown, onClickCapture, onPointerEnter, onPointerLeave },
      isPointerDown,
    }),
    [onPointerDown, onClickCapture, onPointerEnter, onPointerLeave, isPointerDown],
  );
}
