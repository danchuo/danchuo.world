"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { cssDurationMs, morphRadius, morphTransform } from "@/lib/dropMorph";

/**
 * Длительность проявки, если скин её не назвал (уход берёт её же, пока не назван свой,
 * `--drop-morph-out-ms`). Число здесь — только страховка: настоящее
 * значение приезжает из `--drop-morph-ms`, потому что оно же стоит в переходе самого кадра,
 * и разъехаться этим двум нельзя (иначе галерея размонтируется на середине движения).
 */
const FALLBACK_MS = 560;

/**
 * **Проявка** (DESIGN §7.5) — общий шов, а не часть волны 03, ровно как [TileEdgeLight]:
 * механика живёт здесь, а решает волна у себя в скине объявлением `--drop-morph: 1` на `:root`.
 * Волна, которой проявка не нужна, свойство не объявляет — и шов не трогает ни одного узла,
 * галерея открывается как открывалась. Правило «новая волна = запись в БД, без правок кода»
 * (§10.1) цело: включение идёт из CSS, ветвления по ключу волны в коде нет.
 *
 * Что происходит: кадр галереи прикидывается кадром плитки (снимаем FLIP-трансформацию,
 * [morphTransform]) и едет из неё на своё место, попутно наводясь на резкость. Геометрию даёт
 * JS, всё остальное — CSS: длительность, кривая и размытие приезжают переменными, а сам
 * переход стоит на `[data-morph-hero]`. Поэтому в компоненте нет ни одного визуального числа.
 *
 * Закрытие играет ту же механику назад (`data-morph="out"`), и лишь потом размонтирует
 * галерею: полуоткрытый кадр, схлопнувшийся в фейд, читался бы как поломка. Прямоугольник
 * плитки снимается заново — за время просмотра страницу могли прокрутить.
 *
 * Пока кадр живёт в галерее, плитки на борде нет вовсе (`data-morph-source` на её ячейке): два
 * одинаковых снимка на экране разом — ровно то враньё, против которого проявка и затеяна, а
 * если погасить только снимок, на его месте остаётся пустая карточка — рамка от фотографии,
 * которой в ней уже нет (замечание владельца). Уезжает вся ячейка целиком. На закрытии она
 * возвращается чуть РАНЬШЕ, чем галерея размонтируется: кадр в этот момент уже почти дома, и
 * подмена приходится на совпавшие прямоугольники, то есть не видна.
 *
 * Под `prefers-reduced-motion` шва нет вовсе: галерея появляется и исчезает без движения.
 */
export function useDropMorph({
  origin,
  sceneRef,
  onClose,
}: {
  /** Кадр на борде, из которого растёт галерея; нет — морфить не из чего (мозаика, лента дропов). */
  origin?: RefObject<HTMLElement | null>;
  /** Слой галереи целиком: на нём живёт `data-morph`, по которому одевается вся сцена. */
  sceneRef: RefObject<HTMLElement | null>;
  /** Размонтирование галереи — вызывается ПОСЛЕ обратной проявки. */
  onClose: () => void;
}): {
  /** Сыграть проявку; повторные вызовы игнорируются (кадр уже на месте). */
  playIn: () => void;
  /** Закрыть галерею: с проявкой — обратным ходом, без неё — сразу. */
  requestClose: () => void;
} {
  const playedRef = useRef(false);
  const leavingRef = useRef(false);
  /** Отложенный старт движения (см. [playIn]); 0 — ничего не запланировано. */
  const frameRef = useRef(0);
  /** Плитка, с которой снят кадр: её надо вернуть на борд, чем бы галерея ни закончилась. */
  const hiddenRef = useRef<HTMLElement | null>(null);

  const showSource = useCallback(() => {
    hiddenRef.current?.removeAttribute("data-morph-source");
    hiddenRef.current = null;
  }, []);

  const cancelStart = useCallback(() => {
    if (!frameRef.current) return false;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    return true;
  }, []);

  // Галерею могли снять и мимо закрытия (смена волны, уход со страницы) — плитка не должна
  // остаться невидимой из-за анимации, которой уже нет.
  useEffect(
    () => () => {
      cancelStart();
      showSource();
    },
    [cancelStart, showSource],
  );

  /** Слой, кадр галереи и кадр плитки разом — либо все трое есть, либо морфа нет. */
  const parts = useCallback(() => {
    const scene = sceneRef.current;
    const hero = scene?.querySelector<HTMLElement>("[data-morph-hero]") ?? null;
    const tile = origin?.current ?? null;
    if (!scene || !hero || !tile) return null;
    // Мерим по кадру, а прячем карточку: геометрия у снимка, а исчезнуть должна вся плитка —
    // иначе на её месте остаётся пустая рамка от фотографии, которой в ней уже нет.
    // ⚠️ Именно КАРТОЧКА, не ячейка борда: галерея живёт в разметке того же тайла, и `opacity`
    // на ячейке гасит вместе с плиткой саму галерею (поймано на живом борде — открывалась
    // пустота). `.pixel-tile` — карточка тайла в любой волне, галереи в ней нет.
    const card = tile.closest<HTMLElement>(".pixel-tile") ?? tile;
    // Опт-ин волны читаем вычисленным стилем: он объявлен в скине, а не инлайном. «Меньше
    // движения» отменяет проявку целиком — это движение через полэкрана, смягчать тут нечего.
    if (typeof window === "undefined") return null;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null;
    const root = getComputedStyle(document.documentElement);
    if (root.getPropertyValue("--drop-morph").trim() !== "1") return null;
    // Две длительности: приход и уход. Уход короче — назад кадр едет по знакомой дороге.
    // Разбираем с единицей ([cssDurationMs]): сборка переписывает `320ms` в `.32s`, и наивный
    // `parseInt` подменял бы число дефолтом — CSS играл бы одну длительность, таймеры другую.
    const read = (name: string) => cssDurationMs(root.getPropertyValue(name));
    const ms = read("--drop-morph-ms") ?? FALLBACK_MS;
    return {
      scene,
      hero,
      tile,
      card,
      ms,
      outMs: read("--drop-morph-out-ms") ?? ms,
      // Досадка: кадр уже дома и неподвижен, но ещё держится — под ним проступает плитка со
      // своей полосой и подписью. Скин вправе её не просить, тогда галерея снимается сразу.
      settleMs: read("--drop-morph-settle-ms") ?? 0,
    };
  }, [origin, sceneRef]);

  /**
   * Поставить кадр в границы плитки: и трансформацию, и скругление. Скругление считается по
   * КАРТОЧКЕ (кант плитки его и рисует), за вычетом самого канта — клипует картинку внутренний
   * край рамки, а не внешний.
   */
  const placeOnTile = useCallback((p: NonNullable<ReturnType<typeof parts>>) => {
    const tileBox = p.tile.getBoundingClientRect();
    const heroBox = p.hero.getBoundingClientRect();
    const at = morphTransform(tileBox, heroBox);
    if (!at) return false;
    p.scene.style.setProperty("--drop-morph-from", at);
    const edge = getComputedStyle(p.card);
    const radius = Math.max(
      0,
      Number.parseFloat(edge.borderTopLeftRadius) - Number.parseFloat(edge.borderTopWidth),
    );
    const r = Number.isFinite(radius) ? morphRadius(tileBox, heroBox, radius) : null;
    if (r) p.scene.style.setProperty("--drop-morph-radius-from", r);
    return true;
  }, []);

  const playIn = useCallback(() => {
    if (playedRef.current) return;
    const p = parts();
    if (!p) return;
    if (!placeOnTile(p)) return;
    playedRef.current = true;
    // Стартовый кадр ставится БЕЗ перехода (`from`) — и движение отпускается только после того,
    // как браузер этот кадр ОТРИСОВАЛ. Двойной rAF здесь не суеверие, а плата за то, что первая
    // отрисовка галереи тяжёлая: декодируется снимок и лента миниатюр. Таймлайн перехода идёт по
    // стенным часам, и если запустить его раньше этой работы, то к первому же показанному кадру
    // он уже почти доигран — галерея открывается «мгновенно, без анимации» (замечание владельца;
    // форсированный рефлоу от этого не спасал, он даёт границу стиля, но не отрисовку).
    p.scene.dataset.morph = "from";
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        p.scene.dataset.morph = "in";
        // Кадр уехал в галерею — плитки на борде больше нет.
        p.card.dataset.morphSource = "on";
        hiddenRef.current = p.card;
      });
    });
  }, [parts, placeOnTile]);

  const requestClose = useCallback(() => {
    if (leavingRef.current) return;
    const p = parts();
    // Закрыли раньше, чем движение успело начаться (кадр ещё стоит на плитке) — отыгрывать
    // назад нечего. Проявки не было вовсе (другая волна, мозаика, reduced-motion) — тоже:
    // закрываем как закрывали.
    const notStarted = cancelStart();
    if (!p || !playedRef.current || notStarted) {
      showSource();
      onClose();
      return;
    }
    if (!placeOnTile(p)) {
      showSource();
      onClose();
      return;
    }
    leavingRef.current = true;
    p.scene.dataset.morph = "out";
    // Плитка проявляется обратно к концу движения, а не после него: за 150мс до посадки кадр
    // уже почти на её месте и закрывает подмену собой.
    window.setTimeout(showSource, Math.max(0, p.outMs - 150));
    // Галерея снимается не в момент посадки, а после досадки: кадр уже стоит ровно в плитке и
    // растворяется в ней, пропуская сквозь себя полосу с подписью. Снять его щелчком значило бы
    // проявить их разом — единственное, чем плитка отличается от кадра, появлялось бы рывком.
    window.setTimeout(onClose, p.outMs + p.settleMs);
  }, [cancelStart, onClose, parts, placeOnTile, showSource]);

  return { playIn, requestClose };
}
