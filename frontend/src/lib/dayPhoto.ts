/** The day photo's card in the sheet's row, in fractions of its slot `--sheet-slot`. DESIGN §4.3 */

export interface PhotoFrame {
  width: number;
  height: number;
}

/** Past 2:1 a panorama stops widening and only gets lower, or it would take the row over. */
const MAX_WIDTH = 2;

/** Any photo stands the slot's full height and takes the width its ratio asks for. */
export function photoFrame(width: number, height: number): PhotoFrame {
  if (!(width > 0 && height > 0)) return { width: 1, height: 1 };
  const ratio = width / height;
  const w = Math.min(ratio, MAX_WIDTH);
  return { width: w, height: w / ratio };
}
