/**
 * Random sampling with a STABLE seed. The drop tile renders twice per load — a cached copy, then
 * the network answer with the same frames in a new array — and drawing lots per array changed the
 * photo twice before the viewer's eyes. The seed is taken once per mount. DESIGN §7.5
 */

/* mulberry32 — a small deterministic generator; more than good enough for drawing lots. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [count] random items of [items] by the seed ∈ [0, 1) (a Fisher–Yates shuffle of a copy). */
export function pickSeeded<T>(items: readonly T[], count: number, seed: number): T[] {
  const rnd = mulberry32(Math.floor(seed * 4294967296));
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, count));
}
