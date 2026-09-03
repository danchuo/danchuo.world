/**
 * Кромка, ловящая свет (DESIGN §10.2) — чистая часть ховера волны 03 «PRIME».
 *
 * Здесь только геометрия: точка указателя внутри коробки плитки → вектор от её центра
 * в диапазоне `[-1, 1]` по обеим осям. Что с этим вектором делать, решает **скин волны**:
 * PRIME кладёт его в смещение `inset`-тени, и светящийся торец перетекает на ближнюю
 * к курсору сторону. Слушателя и запись переменных держит [TileEdgeLight].
 *
 * Разделение не ради красоты: геометрия проверяема без DOM, а всё остальное в этом
 * эффекте — это один слушатель и две строчки `style.setProperty`.
 */

/** Прямоугольник плитки — ровно то подмножество `DOMRect`, что нужно расчёту. */
export interface TileBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Вектор от центра плитки к указателю, по каждой оси в `[-1, 1]`. */
export interface EdgeVector {
  dx: number;
  dy: number;
}

/**
 * `null` — у плитки нет коробки (скрыта волной, ещё не смонтирована): делить не на что,
 * и писать переменные некуда.
 */
export function edgeVector(box: TileBox, clientX: number, clientY: number): EdgeVector | null {
  if (box.width <= 0 || box.height <= 0) return null;
  return {
    dx: clamp((clientX - box.left) / box.width * 2 - 1),
    dy: clamp((clientY - box.top) / box.height * 2 - 1),
  };
}

/** Указатель успевает уйти за край между кадрами rAF — без зажима блик оторвался бы от кромки. */
function clamp(v: number): number {
  return Math.min(1, Math.max(-1, v));
}
