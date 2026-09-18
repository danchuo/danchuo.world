/** Depth of an artifact in the shaft, measured in STEPS from the front. DESIGN §7.2 */

import type { ArtifactView } from "./api/types";

/** An artifact the shaft can actually stand up: one that brought its own model. */
export type ShaftArtifact = ArtifactView & { model3dUrl: string };

/**
 * Only things with their own model belong in the shaft. A flat ribbon can stand in for an item
 * with a picture; a shaft cannot — it would be a row of identical stand-ins. DESIGN §7.2
 */
export function shaftArtifacts(all: ArtifactView[]): ShaftArtifact[] {
  return all.filter((a): a is ShaftArtifact => !!a.model3dUrl);
}

/** How many objects wait behind the front one; further back they are not mounted at all. */
export const SHAFT_DEPTH = 3;
/** How far in front of the slot an object travels while leaving, before it is gone. */
export const SHAFT_LEAD = 0.7;
/** Perspective: a step back divides the size by `1 + d * SHAFT_FALLOFF`. */
export const SHAFT_FALLOFF = 0.46;
/** The far end blurs into the tile's own glass rather than ending at a line. */
export const SHAFT_FAR_BLUR_PX = 3.4;
/** Far objects stay recognizable as objects, not as smudges. */
export const SHAFT_FAR_DIM = 0.28;
/** The shaft climbs towards a vanishing point above the front slot, as a fraction of tile height. */
export const SHAFT_RISE = 0.052;
/**
 * Sideways drift per step, as a fraction of tile width. Without it a line of IDENTICAL objects on
 * one axis hides itself: the front one covers every other exactly, and the depth reads as a single
 * object. The shaft therefore recedes diagonally, and each one stays partly its own silhouette.
 */
export const SHAFT_DRIFT = 0.085;
/** Front object's height as a fraction of the tile — the rest follow from the falloff. */
export const SHAFT_FRONT_HEIGHT = 0.8;

export interface ShaftLook {
  /** 1 at the front slot, smaller going back, larger while leaving towards the viewer. */
  scale: number;
  /** Fades at both ends: into the glass at the back, out of frame at the front. */
  opacity: number;
  /** Zero at the front slot, capped at SHAFT_FAR_BLUR_PX. */
  blur: number;
  /** Fraction of tile height to lift by; the shaft recedes upward. */
  rise: number;
  /** Fraction of tile width to shift by; the shaft recedes sideways (see [SHAFT_DRIFT]). */
  drift: number;
  /** Nearer objects cover further ones. */
  zIndex: number;
}

/**
 * Appearance at distance `d` steps behind the front slot; negative means leaving towards the
 * viewer. `null` is "not in the shaft" — the caller mounts nothing, so a long collection costs
 * the same as a short one.
 */
export function shaftLook(d: number): ShaftLook | null {
  if (d < -SHAFT_LEAD || d > SHAFT_DEPTH) return null;

  const scale = 1 / (1 + Math.max(0, d) * SHAFT_FALLOFF) + Math.max(0, -d) * 0.55;

  // Two independent fades meeting at the front slot: the back one is depth, the front one is exit.
  const back = 1 - (Math.max(0, d) / SHAFT_DEPTH) * (1 - SHAFT_FAR_DIM);
  const front = d >= 0 ? 1 : 1 - Math.min(1, -d / SHAFT_LEAD);

  return {
    scale,
    opacity: back * front,
    // The front slot and its immediate neighbour stay sharp; blur starts past them.
    blur: Math.min(SHAFT_FAR_BLUR_PX, Math.max(0, d - 0.5) * (SHAFT_FAR_BLUR_PX / (SHAFT_DEPTH - 0.5))),
    rise: Math.max(0, d) * SHAFT_RISE,
    drift: Math.max(0, d) * SHAFT_DRIFT,
    zIndex: Math.round(1000 - d * 100),
  };
}

/**
 * Step the shaft by whole artifacts and stop at the ends. The collection does not wrap: it is a
 * finite set of things owned, and a loop would claim there are more.
 */
export function stepShaft(position: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  const next = Math.round(position) + delta;
  return Math.max(0, Math.min(count - 1, next));
}

/** Indices currently worth mounting, nearest first, so the front object loads before the depth. */
export function shaftWindow(position: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    if (shaftLook(i - position)) out.push(i);
  }
  return out.sort((a, b) => Math.abs(a - position) - Math.abs(b - position));
}
