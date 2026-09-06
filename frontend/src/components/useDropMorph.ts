"use client";

import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { cssDurationMs, morphClip, morphRadius, morphTransform } from "@/lib/dropMorph";

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
/**
 * Потолок попыток снять замер (кадров отрисовки). Двадцать — треть секунды: этого хватает и
 * на доводку ленты, и на раскладку галереи, и при этом отсутствие героя (мозаика) не
 * превращается в вечный цикл rAF.
 */
const MAX_PLAY_RETRIES = 40;

/** Сколько ждать первого кадра галереи, прежде чем показать её вовсе без движения. */
const WAIT_CAP_MS = 500;

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
  /** Сколько раз ещё пробовать снять замер, прежде чем признать, что морфить не из чего. */
  const retriesRef = useRef(0);
  /**
   * Ссылка на свежий [playIn] — через неё повтор зовёт САМ СЕБЯ. Прямая рекурсия в
   * `useCallback` невозможна: функция не может стоять в списке собственных зависимостей.
   */
  const playInRef = useRef<(() => void) | null>(null);
  const leavingRef = useRef(false);
  /** Отложенный старт движения (см. [playIn]); 0 — ничего не запланировано. */
  const frameRef = useRef(0);
  /** Плитка, с которой снят кадр: её надо вернуть на борд, чем бы галерея ни закончилась. */
  const hiddenRef = useRef<HTMLElement | null>(null);
  /** Картинки кадра уже декодированы: полёт можно отпускать (см. [heroPaintable]). */
  const paintableRef = useRef(false);
  /** Декод уже заказан — второй раз не просим. */
  const decodingRef = useRef(false);

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

  /**
   * Будет ли проявка вообще — БЕЗ кадра галереи, которого на первом рендере ещё нет.
   *
   * Нужно отдельно от [parts] ровно поэтому: галерея грузит кадры, и до их приезда сцена
   * рисуется панелью с шапкой и без снимка. Если не пометить её ожиданием СРАЗУ, зритель
   * видит «меню без фотки», а гребёнка и лента миниатюр показываются раньше кадра, потом
   * прячутся на время его полёта и возвращаются вместе с ним (замечание владельца).
   */
  const morphPossible = useCallback(() => {
    if (typeof window === "undefined") return false;
    if (!sceneRef.current || !origin?.current) return false;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
    return getComputedStyle(document.documentElement).getPropertyValue("--drop-morph").trim() === "1";
  }, [origin, sceneRef]);

  // Помечаем сцену ожиданием ДО первой отрисовки: layout-эффект, потому что метка обязана
  // лечь раньше, чем браузер покажет панель.
  //
  // И снимаем её по таймеру, если движение так и не началось. Ожидание прячет галерею
  // целиком, а кадры к ней грузятся по сети: без потолка медленный ответ означал бы клик,
  // после которого не происходит НИЧЕГО. Полсекунды — предел, за которым отсутствие движения
  // честнее пустого экрана; проявку после этого не играем вовсе, иначе кадр прыгнул бы на
  // уже показанной галерее.
  useLayoutEffect(() => {
    const scene = sceneRef.current;
    if (!scene || scene.dataset.morph || !morphPossible()) return;
    scene.dataset.morph = "wait";
    const timer = window.setTimeout(() => {
      if (scene.dataset.morph !== "wait") return;
      delete scene.dataset.morph;
      playedRef.current = true;
    }, WAIT_CAP_MS);
    return () => window.clearTimeout(timer);
  }, [morphPossible, sceneRef]);

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
    // Клип — пара к равномерному масштабу: кадр едет целым, а в плитку садится кадрированным
    // сверху и снизу, ровно как его показывает сама плитка (`object-fit: cover`).
    const clip = morphClip(tileBox, heroBox, Number.isFinite(radius) ? radius : 0);
    if (clip) p.scene.style.setProperty("--drop-morph-clip-from", clip);
    return true;
  }, []);

  /**
   * Готов ли кадр к отрисовке — не «есть ли он в разметке», а декодированы ли его пиксели.
   *
   * Без этого полёт стартовал ровно в тот момент, когда браузер брался декодировать снимок,
   * и первую треть пути просто не рисовал. Замер на живом стеке (headed, реальная отрисовка):
   * первое открытие дропа — 17–20 кадров из 27 возможных с провалами до 115мс, и раскрытие
   * среза приезжало ступенями («слишком резко прибавляет сверху и снизу» — замечание
   * владельца). С заранее декодированными картинками — 26–27 кадров из 27, максимум 33мс.
   * Ждать нечего на повторных заходах: там кадр уже в кэше, и `decode` отвечает сразу.
   *
   * ⚠️ Это НЕ ожидание сети: у ожидания замера свой потолок ([WAIT_CAP_MS]), за которым
   * галерея показывается вовсе без движения. Медленный кадр стоит проявки, а не открытия.
   */
  const heroPaintable = useCallback((hero: HTMLElement) => {
    if (paintableRef.current) return true;
    const imgs = Array.from(hero.querySelectorAll("img"));
    if (imgs.length === 0) return true;
    if (!imgs.every((img) => img.complete && img.naturalWidth > 0)) return false;
    if (decodingRef.current) return false;
    decodingRef.current = true;
    // `complete` говорит «файл приехал», а не «пиксели готовы»: декод у больших кадров
    // отложенный (`decoding="async"`), и приходится он ровно на первые кадры полёта.
    // `decode` есть не везде (jsdom, старые движки) — там довольствуемся `complete`.
    const ready = imgs.map((img) =>
      typeof img.decode === "function" ? img.decode().catch(() => undefined) : Promise.resolve(),
    );
    Promise.all(ready).then(() => {
      paintableRef.current = true;
      playInRef.current?.();
    });
    return false;
  }, []);

  const playIn = useCallback(() => {
    if (playedRef.current) return;
    const p = parts();
    // Мерить пока нечего — пробуем ещё раз на следующем кадре. Замер бывает не готов не
    // потому, что морфа нет, а потому, что галерея ещё раскладывается: кадр ленты дропов
    // открывается после доводки ленты в середину, и первый замер попадал в незаконченную
    // прокрутку — морф не играл вовсе, кроме самого верхнего дропа, которому доводка не
    // нужна (замечание владельца: «выезжает только первый»). Попытки ограничены: у мозаики
    // героя нет вообще, и молчаливый бесконечный цикл там был бы хуже отсутствия движения.
    // Замер принимается СРАЗУ, как только он годен. Ждать «устоявшегося» размера пробовали
    // и откатили: галерее последнего дропа кадры известны на момент открытия, ей ждать
    // нечего, и лишние кадры отсрочки читались подтормаживанием в начале движения
    // (замечание владельца). Повтор нужен не для точности замера, а для того, что мерить
    // бывает НЕЧЕГО: галерея ленты дропов грузит кадры после клика, и первая попытка
    // приходится на сцену без кадра вовсе — раньше шов на этом сдавался, и проявка играла
    // только у верхнего дропа, которому доводка ленты не нужна.
    if (!p || !heroPaintable(p.hero) || !placeOnTile(p)) {
      if (retriesRef.current >= MAX_PLAY_RETRIES) {
        // Сдались — галерея показывается как есть, без движения. Метку ожидания снимаем,
        // иначе кадр остался бы невидимым навсегда.
        if (sceneRef.current?.dataset.morph === "wait") delete sceneRef.current.dataset.morph;
        return;
      }
      // Метка ожидания обычно уже стоит с монтирования; ставим и здесь — на случай, когда
      // проявка стала возможна позже (плитка появилась на борде после открытия галереи).
      if (p?.scene && !p.scene.dataset.morph) p.scene.dataset.morph = "wait";
      retriesRef.current += 1;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        playInRef.current?.();
      });
      return;
    }
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
  }, [heroPaintable, parts, placeOnTile]);
  playInRef.current = playIn;

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
