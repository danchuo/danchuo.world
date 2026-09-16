/**
 * The moon phase over a night, from a date alone with no external source. Counted from a reference
 * new moon by the synodic month, with an error of about half a day — far below what the eye can
 * tell on a glyph this small. The axis is the waking date. DESIGN §7.7
 */

const SYNODIC_DAYS = 29.530588853;

/** The new moon of 6 January 2000, 18:14 UTC — the epoch. */
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14);

export interface MoonPhase {
  /** The fraction of the synodic cycle: 0 is new, 0.5 is full. */
  cycle: number;
  /** The lit fraction of the disc: 0 is dark, 1 the whole disc. */
  lit: number;
  /** The moon is waxing, so the disc's right edge is lit (northern hemisphere). */
  waxing: boolean;
}

export function moonPhase(date: string): MoonPhase | null {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  const cycles = (ms - NEW_MOON_EPOCH) / 86_400_000 / SYNODIC_DAYS;
  const cycle = ((cycles % 1) + 1) % 1;
  return { cycle, lit: (1 - Math.cos(2 * Math.PI * cycle)) / 2, waxing: cycle < 0.5 };
}

/**
 * Outline of the lit part of a disc, for a waxing moon; a waning one is the same path mirrored.
 * The lit edge is always a semicircle while the terminator is an ellipse whose semi-axis is the
 * circle's projection. The sweep flag tells the two apart, or a full moon draws as an empty path.
 */
export function moonLitPath(cycle: number, r: number): string {
  const cos = Math.cos(2 * Math.PI * cycle);
  // The semi-axis is rounded: at the quarters the cosine gives not zero but its floating
  // remainder, and a value like `4.2862637970157e-16` would go into the markup.
  const rx = Math.round(Math.abs(cos) * r * 100) / 100;
  const sweep = cos > 0 ? 0 : 1;
  return `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${rx} ${r} 0 0 ${sweep} 0 ${-r} Z`;
}
