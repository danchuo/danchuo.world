"use client";

import { useEffect, useMemo, useRef } from "react";
import type { DaySummary } from "@/lib/api/types";
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

/** Потолок дублей: страховка от бесконечного цикла, если измерение вдруг соврёт. */
const MAX_REPEATS = 40;

/** Тот же разделитель, что внутри ленты, — стык дублей не должен быть заметен. */
const DOT = " · ";

export function WaveBackdrop({ summaries, wave }: { summaries: DaySummary[]; wave: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const ribbon = useMemo(() => buildRibbon(summaries), [summaries]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fill = () => {
      // Волна фон не включала — не тратим ни измерения, ни узлов текста.
      if (!ribbon || getComputedStyle(el).display === "none") {
        el.textContent = "";
        return;
      }
      el.textContent = ribbon;
      // Нулевая высота — верстки ещё нет (SSR-гидрация, скрытый таб, jsdom): одного
      // прохода достаточно, дублировать вслепую нечего.
      if (el.clientHeight === 0) return;
      let text = ribbon;
      for (let i = 0; i < MAX_REPEATS && el.scrollHeight <= el.clientHeight; i++) {
        text += DOT + ribbon;
        el.textContent = text;
      }
    };

    fill();

    if (typeof ResizeObserver === "undefined") return; // jsdom-тесты без ResizeObserver

    // Наблюдаем за самим слоем, а не за окном: он растянут на вьюпорт, поэтому ловит и
    // ресайз, и зум, и смену ориентации одним источником. Дубли меняют scrollHeight, но
    // не border-box, так что наблюдатель себя не будит.
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fill);
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
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
