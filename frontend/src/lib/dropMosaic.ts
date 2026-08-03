/**
 * Раскладка кадров в модалке фото-дропа (DESIGN §7.5) — чистый расчёт, отдельно от компонента:
 * `PhotoDropModal.tsx` должен экспортировать только компоненты, иначе Fast Refresh не сохраняет
 * состояние при правке файла.
 *
 * Кадр занимает целое число клеток базовой сетки: лежачий 3×2, стоячий 2×3. Шесть клеток у обоих —
 * отсюда равный вес ориентаций, которого не давали ни прежние CSS-колонки (там ширина кадра равна
 * ширине колонки при любой ориентации), ни justified-ряды (те равняют высоту, а при равной высоте
 * площадь идёт за пропорцией: замер на живом дропе — лежачий крупнее стоячего в 2.53 раза).
 *
 * **Порядок — по колонкам сверху вниз, как в прежних CSS-колонках** (решение владельца): первый
 * кадр сверху слева, второй под ним. Поэтому место каждому кадру считается тут и задаётся явно —
 * автопоток грида укладывает построчно, и плёнка читалась бы поперёк.
 *
 * **Дырку занимает следующий подходящий кадр.** Стоячий кадр уже лежачего на клетку, поэтому
 * рядом с ним остаётся щель; если такие щели складываются, в мозаике появляется пустая колонка.
 * Укладчик ищет кадру **первое свободное место в порядке чтения** (левее и выше — раньше), а не
 * пришивает его к концу колонки, — поэтому щель занимает ближайший кадр, которому она подходит,
 * а пустота уезжает дальше по раскладке. Наложений при этом не бывает по построению: место
 * считается по занятости клеток, и кадр встаёт только туда, где свободны все его клетки.
 */

/** Клеток по ширине сетки: 12 = четыре лежачих кадра в ряд, узкая 6 = два. */
export const MOSAIC_UNITS = 12;
export const MOSAIC_UNITS_NARROW = 6;
/** Ниже этой ширины окна четыре кадра в ряд дают кадр мельче тач-таргета. */
export const MOSAIC_NARROW_PX = 520;

/** Лежачий кадр 3×2, стоячий 2×3 — оба по шесть клеток. */
const LAND = { w: 3, h: 2 };
const PORT = { w: 2, h: 3 };

export interface MosaicCell {
  /** Клетка левого верхнего угла, от нуля. */
  col: number;
  row: number;
  w: number;
  h: number;
}

/**
 * Разложить кадры по сетке шириной [units] клеток. [portraits] — ориентация каждого кадра в
 * порядке съёмки (`true` — стоячий); порядок сохраняется, раскладка кадры не переставляет —
 * меняется только место, куда каждый из них садится.
 */
export function columnMajorMosaic(portraits: boolean[], units: number): MosaicCell[] {
  if (portraits.length === 0 || units < LAND.w) return [];

  // Идеальная высота: столько клеток заняли бы кадры, лёгши без единой щели. Раскладка стартует
  // с неё и растёт по клетке, только когда очередному кадру места не нашлось нигде, — так
  // мозаика не вытягивается в длинную колонку и не оставляет заведомо лишних рядов.
  let limit = Math.ceil((portraits.length * LAND.w * LAND.h) / units);
  const taken: boolean[][] = [];

  const rowOf = (row: number): boolean[] => {
    while (taken.length <= row) taken.push(new Array<boolean>(units).fill(false));
    return taken[row];
  };
  const free = (col: number, row: number, w: number, h: number): boolean => {
    for (let r = row; r < row + h; r++) {
      const line = rowOf(r);
      for (let c = col; c < col + w; c++) if (line[c]) return false;
    }
    return true;
  };
  const occupy = (col: number, row: number, w: number, h: number): void => {
    for (let r = row; r < row + h; r++) {
      const line = rowOf(r);
      for (let c = col; c < col + w; c++) line[c] = true;
    }
  };

  const cells: MosaicCell[] = [];
  for (const portrait of portraits) {
    const { w, h } = portrait ? PORT : LAND;
    let placed: MosaicCell | null = null;
    // Порядок поиска — порядок чтения: сперва левее, потом выше. Отсюда и «второй кадр под
    // первым»: соседняя колонка идёт в дело, только когда в текущей места не осталось.
    while (!placed) {
      for (let col = 0; col + w <= units && !placed; col++) {
        for (let row = 0; row + h <= limit; row++) {
          if (free(col, row, w, h)) {
            placed = { col, row, w, h };
            break;
          }
        }
      }
      if (!placed) limit += 1;
    }
    occupy(placed.col, placed.row, placed.w, placed.h);
    cells.push(placed);
  }
  return cells;
}
