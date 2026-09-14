"use client";

import { useEffect } from "react";
import { edgeVector, type TileBox } from "@/lib/tileEdgeLight";
import { useCoarsePointer } from "./useCoarsePointer";

/**
 * Кромка, ловящая свет (DESIGN §10.2) — **общий шов, а не часть волны 03**, ровно как
 * [WaveBackdrop]: разметка/слушатель живут здесь, а решает волна у себя в скине.
 *
 * Опт-ин — пользовательское свойство `--tile-edge-light: 1` на `:root`. Волна, которой этот
 * ховер не нужен, не объявляет его — и шов не вешает ни одного слушателя, то есть не стоит
 * ничего. Правило «новая волна = запись в БД, без правок кода» (§10.1) при этом цело: включение
 * идёт из CSS-скина, а не из ветвления по ключу волны.
 *
 * Свойство наследуется, поэтому тем же ключом волна отказывается и ЗА ОТДЕЛЬНУЮ плитку:
 * `--tile-edge-light: 0` на `[data-tile-id="…"]` — и шов эту плитку пропускает. Нужно это
 * там, где волна сняла плиту: рисовать свет не на чем, а цена записи остаётся (см. ниже).
 *
 * Шов пишет в плитку под курсором две переменные — `--tile-dx`/`--tile-dy`, вектор от её центра
 * к указателю в `[-1, 1]`. Что с ними делать, знает только скин: PRIME кладёт их в смещение
 * `inset`-тени, и светящийся торец перетекает на ближнюю к курсору сторону.
 *
 * Слушатель ОДИН на весь документ, а не по одному на плитку: тайлов полтора десятка, событие
 * общее, а нужный элемент даёт `closest` — тот же приём, что у клик-хитмапы в [AnalyticsBeacon].
 * Коробка плитки замеряется на входе в неё и переиспользуется до перехода на соседнюю: иначе
 * каждый кадр движения мыши заставлял бы браузер считать layout заново.
 */
export function TileEdgeLight({ wave }: { wave: string | null }) {
  // Ховера на тач-устройстве не бывает — там этот эффект не может сработать в принципе.
  const coarse = useCoarsePointer();

  useEffect(() => {
    if (coarse || typeof window === "undefined") return;
    // Волна не просила — выходим до слушателя. Читать приходится вычисленный стиль: значение
    // объявлено в скине волны, а не инлайном.
    if (getComputedStyle(document.documentElement).getPropertyValue("--tile-edge-light").trim() !== "1") {
      return;
    }
    // «Меньше движения» — свет остаётся, но перестаёт ездить: без переменных `inset`-тень
    // ложится с нулевым смещением, то есть ровным свечением по всей кромке (см. wave-03.css).
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let hovered: HTMLElement | null = null;
    let box: TileBox | null = null;
    let lit = false;

    const onMove = (e: PointerEvent) => {
      const tile = (e.target as Element | null)?.closest<HTMLElement>("[data-tile-id]") ?? null;
      if (!tile) {
        hovered = null;
        box = null;
        return;
      }
      if (tile !== hovered) {
        hovered = tile;
        box = tile.getBoundingClientRect();
        // Тот же опт-ин, что у корня, только спрошенный у плитки: `--tile-edge-light`
        // наследуется, поэтому по умолчанию плитка отвечает то же «1», а отказаться может
        // любая — объявив у себя `0` в скине. Читаем РЯДОМ с замером коробки и на вход в
        // плитку: вычисленный стиль стоит браузеру пересчёта, и спрашивать его на каждое
        // движение мыши значило бы вернуть ту самую цену, ради которой коробка кэшируется.
        lit = getComputedStyle(tile).getPropertyValue("--tile-edge-light").trim() === "1";
      }
      // Плитка света не рисует — не пишем ей ничего. ⚠️ Это не экономия, а инвариант:
      // `--tile-dx`/`--tile-dy` НАСЛЕДУЮТСЯ, и запись метит на перерасчёт всё поддерево
      // плитки — на каждое движение мыши. Там, где свет не горит, это чистый убыток, а на
      // WebKit ещё и заново растрирует фоновые картинки внутри (docs/pitfalls.md).
      if (!lit) return;
      const v = box && edgeVector(box, e.clientX, e.clientY);
      if (!v) return;
      tile.style.setProperty("--tile-dx", v.dx.toFixed(3));
      tile.style.setProperty("--tile-dy", v.dy.toFixed(3));
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
    // `wave` в зависимостях: своп волны меняет `--tile-edge-light`, и опт-ин надо перечитать.
  }, [coarse, wave]);

  return null;
}
