"use client";

import { useEffect, useMemo, useRef } from "react";
import type { DaySummary } from "@/lib/api/types";
import { onFontsReady } from "@/lib/fontGate";
import { buildRibbon } from "@/lib/waveRibbon";

/**
 * Фоновый слой волны (DESIGN §10.2) — **общий шов, а не часть волны 03**.
 *
 * До сих пор фон волны был чистым CSS: волна 02 рисует небо и облака псевдоэлементами,
 * и этого хватало, потому что фон ничего не знал о данных. Волне 03 «PRIME» фоном служит
 * сама лента прожитых дней, а она приезжает из API и меняется вместе с окном календаря —
 * такое из CSS не достать. Поэтому слой живёт компонентом.
 *
 * Чтобы это не сломало правило «новая волна = запись в БД, без правок кода» (§10.1), шов
 * сделан **волна-агностичным**: разметка есть всегда, `common.css` держит её выключенной
 * (`display: none`), а волна включает и оформляет её у себя в скине. Волне, которой фон не
 * нужен, он не стоит ничего — ни узла в раскладке, ни кадра на отрисовке.
 *
 * Заполнение экрана — императивное, не через состояние: лента дублируется до тех пор, пока
 * не перестанет помещаться, а это измерение, и на каждый его шаг рендерить React-дерево
 * незачем. React владеет самим узлом, содержимым узла владеет этот эффект.
 */

/**
 * Потолок длины текста — страховка от вранья измерения. 300 000 символов с запасом
 * закрывают 8K-стену и стоят полмегабайта.
 */
const MAX_CHARS = 300_000;

/** Тот же разделитель, что внутри ленты, — стык повторов не должен быть заметен. */
const DOT = " · ";

/**
 * Доля ширины строки, ниже которой перенос по слову не делается: у длинного слова в конце
 * строки иначе срезалось бы полстроки, и рваный край становился бы дырой.
 *
 * *Рассмотрено и отклонено: резать по счёту знаков, чтобы строка перекрывала окно и края
 * заполнялись до упора.* Пустые полоски по бокам оно не убрало (строка шире окна не двигается
 * выключкой — она уже упёрлась в левый край), зато слова стали рваться посередине. Слово
 * целое важнее ровного края: холст читают краем глаза, и обрубок слова заметнее просвета.
 */
const MIN_LINE_FILL = 0.72;

/**
 * Ширина знака, если замер не состоялся (jsdom, скрытый таб). Лента набрана моноширинным,
 * а у моноширинных наборов ширина знака — около 0.6 кегля.
 */
const MONO_ADVANCE = 0.6;
/** Межстрочный интервал, если `line-height` не вычислился (`normal` в jsdom). */
const FALLBACK_LEADING = 1.4;

/**
 * Ширина знака ленты — замером по пробе, потому что это единственный честный способ.
 *
 * ⚠️ Проба набирается САМОЙ ЛЕНТОЙ, а не строкой из нулей. У холста задан `word-spacing`, и
 * лента состоит из слов: проба без пробелов не платила за межсловные интервалы, знак выходил
 * у́же настоящего, строка получалась длиннее окна — и её хвост срезался справа. Реальный
 * кусок ленты несёт ту же плотность пробелов, что и строки, которые из него нарежут.
 */
function measureAdvance(el: HTMLElement, fontSize: number, sample: string): number {
  const text = sample.length >= 200 ? sample.slice(0, 200) : sample.repeat(Math.ceil(200 / Math.max(1, sample.length))).slice(0, 200);
  const probe = document.createElement("span");
  probe.textContent = text;
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;pointer-events:none";
  el.appendChild(probe);
  const width = probe.getBoundingClientRect().width / text.length;
  probe.remove();
  return width > 0 ? width : fontSize * MONO_ADVANCE;
}

export function WaveBackdrop({
  summaries,
  today,
  wave,
}: {
  summaries: DaySummary[];
  /** Опора «сегодня» (MSK): дни после неё на холст не едут — они ещё не прожиты. */
  today: string;
  wave: string | null;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const ribbon = useMemo(() => buildRibbon(summaries, today), [summaries, today]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fill = () => {
      // Волна фон не включала — не тратим ни измерения, ни узлов текста.
      if (!ribbon || getComputedStyle(el).display === "none") {
        el.replaceChildren();
        return;
      }

      const cs = getComputedStyle(el);
      const fontSize = parseFloat(cs.fontSize) || 12.5;
      const lineH = parseFloat(cs.lineHeight) || fontSize * FALLBACK_LEADING;
      const innerW =
        el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      const innerH =
        el.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);

      // Вёрстки ещё нет (SSR-гидрация, скрытый таб): кладём ленту одной строкой и ждём
      // наблюдателя — резать на строки нечем, ширина неизвестна.
      if (innerW <= 0 || innerH <= 0) {
        el.textContent = ribbon;
        return;
      }

      // Строки лента ломает САМА, а не переносом браузера, и вот почему: выключка у этой
      // волны идёт ЧЕРЕЗ СТРОКУ (нечётные прижаты влево, чётные вправо, см. wave-03.css),
      // а `text-align` в CSS применяется ко всему абзацу сразу — отдельной строкой оттуда
      // не управлять. Значит, каждая строка обязана быть своим узлом.
      const advance = measureAdvance(el, fontSize, ribbon);
      // Знак запаса: плотность пробелов у строки своя, и средняя по пробе может оказаться
      // чуть оптимистичнее реальной. Недобрать знак незаметно, перебрать — срезать хвост.
      const perLine = Math.max(8, Math.floor(innerW / advance) - 1);
      const rows = Math.min(
        Math.ceil(innerH / lineH) + 1,
        Math.floor(MAX_CHARS / (perLine + 1)),
      );

      // Лента короче стены — повторяем её до нужной длины (тем же разделителем, чтобы стык
      // повторов не был заметен). Удвоение, а не дописывание по куску: стена бывает в сотни
      // раз выше ленты, и линейный шаг упирался в потолок раньше, чем закрывал её.
      const need = rows * (perLine + 1);
      let pool = ribbon;
      while (pool.length < need && pool.length < MAX_CHARS) pool += DOT + pool;

      const frag = document.createDocumentFragment();
      let at = 0;
      for (let r = 0; r < rows; r += 1) {
        if (at >= pool.length) at = 0; // лента кончилась — заходим на второй круг
        let end = Math.min(pool.length, at + perLine);
        if (end < pool.length) {
          // Перенос по слову: середины слов на срезе строки не режем, из-за этого край
          // и получается рваным — а рваный край здесь и есть рисунок.
          const cut = pool.lastIndexOf(" ", end);
          if (cut > at + perLine * MIN_LINE_FILL) end = cut;
        }
        const line = document.createElement("span");
        line.className = "wave-backdrop-line";
        line.textContent = pool.slice(at, end).trim();
        frag.appendChild(line);
        at = end + 1;
      }
      el.replaceChildren(frag);
    };

    fill();

    // Пересборка по открытию ворот шрифта (`fontGate.ts`): лента набрана моноширинным, а до
    // его загрузки строки меряются подменным набором — заполнение, честное на старте, после
    // подмены не достаёт до края. Наблюдатель размеров этот случай не ловит: коробка слоя не
    // меняется, меняются метрики текста внутри. Ворота, а не `document.fonts.ready` напрямую:
    // до первой раскладки набор шрифтов пуст и отвечает «готов» мгновенно (см. врез там же),
    // и пересборка пришлась бы на то же подменное начертание.
    const offFonts = onFontsReady(fill);

    // Наблюдаем за самим слоем, а не за окном: он растянут на всю страницу, поэтому ловит
    // одним источником и ресайз, и зум, и смену ориентации, и подросшую от новых данных
    // страницу. Дубли меняют scrollHeight, но не border-box, так что наблюдатель себя не
    // будит. `undefined` — jsdom-тесты без ResizeObserver: там хватает первого прохода.
    let frame = 0;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(fill);
          });
    observer?.observe(el);
    return () => {
      offFonts();
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
    // `wave` в зависимостях: своп волны меняет `display` слоя, и ленту надо пересобрать
    // под новую высоту (или стереть, если новая волна фон не рисует).
  }, [ribbon, wave]);

  return (
    <div className="wave-backdrop" aria-hidden="true">
      <p className="wave-backdrop-ribbon" ref={ref} />
    </div>
  );
}
