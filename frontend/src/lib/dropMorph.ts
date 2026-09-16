/** Pure FLIP geometry from source tile to gallery frame; DOM orchestration lives in useDropMorph. DESIGN §7.5. */

/** Viewport rectangle, as returned by getBoundingClientRect. */
export interface MorphBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Round pixels to hundredths and scales to ten-thousandths. */
const px = (v: number) => Math.round(v * 100) / 100;
const scale = (v: number) => Math.round(v * 1e4) / 1e4;

/** Map target to source around their centers with uniform cover scaling; independent axes distort photos. Null for degenerate boxes. DESIGN §7.5. */
export function morphTransform(from: MorphBox, to: MorphBox): string | null {
  if (from.width <= 0 || from.height <= 0 || to.width <= 0 || to.height <= 0) return null;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const s = morphScale(from, to);
  return `translate(${px(dx)}px, ${px(dy)}px) scale(${scale(s)})`;
}

/** Uniform cover scale: choose the larger axis ratio to avoid letterboxing. */
export function morphScale(from: MorphBox, to: MorphBox): number {
  return Math.max(from.width / to.width, from.height / to.height);
}

/** Clip overflow in pre-transform frame coordinates, preserving the corner radius; null for degenerate boxes. DESIGN §7.5. */
export function morphClip(from: MorphBox, to: MorphBox, radius: number): string | null {
  if (from.width <= 0 || from.height <= 0 || to.width <= 0 || to.height <= 0) return null;
  const s = morphScale(from, to);
  const insetX = Math.max(0, (to.width - from.width / s) / 2);
  const insetY = Math.max(0, (to.height - from.height / s) / 2);
  const r = radius > 0 ? ` round ${px(radius / s)}px` : "";
  return `inset(${px(insetY)}px ${px(insetX)}px${r})`;
}

/** Divide the tile radius by uniform scale so corners match after transformation; null for invalid boxes or negative radius. */
export function morphRadius(from: MorphBox, to: MorphBox, radius: number): string | null {
  if (from.width <= 0 || from.height <= 0 || to.width <= 0 || to.height <= 0 || radius < 0) return null;
  return `${px(radius / morphScale(from, to))}px`;
}

/** Accept ms and s only; a unitless CSS number is not a duration. */
const DURATION = /^(\d+\.?\d*|\.\d+)(ms|s)$/;

/** Parse CSS duration units, including minified .32s; null means absent, zero or invalid. See docs/pitfalls.md. */
export function cssDurationMs(value: string): number | null {
  const m = DURATION.exec(value.trim());
  if (!m) return null;
  const ms = Number.parseFloat(m[1]) * (m[2] === "s" ? 1000 : 1);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}
