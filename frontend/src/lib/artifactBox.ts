/** Keep pure geometry outside the component module to preserve Fast Refresh state. DESIGN §7.2. */

/** Cross-axis item limit in pixels. */
export const ARTIFACT_SIZE = 40;
/** Along-axis limit prevents a strip-shaped item from filling the tile. */
const ARTIFACT_LONG = 120;
/** Equal-area optical weight; equal height would make wide items dominate. DESIGN §7.2. */
const ARTIFACT_PRESENCE = 48;
/** Minimum long-to-short ratio considered elongated. */
const ELONGATED = 2;

/** Rotation requires permission and an elongated image ratio; transparent canvas margins can hide elongation. PRD §5.8. */
export function laysOnSide(ratio: number, rotatable: boolean, vertical: boolean): boolean {
  // Unmeasured or invalid images use a square ratio.
  const r = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const elongated = r >= ELONGATED || r <= 1 / ELONGATED;
  const longIsWidth = r >= 1;
  return rotatable && elongated && (vertical ? longIsWidth : !longIsWidth);
}

export interface ArtifactBox {
  width: number;
  height: number;
  /** Rotate 90 degrees, placing the long side across the strip. */
  rotate: boolean;
}

/** Size by equal area, constrained by strip limits; rotation requires explicit permission. DESIGN §7.2. */
export function artifactBox(
  ratio: number,
  vertical: boolean,
  rotatable: boolean = false,
  cross: number = ARTIFACT_SIZE,
  long: number = ARTIFACT_LONG,
): ArtifactBox {
  // Unmeasured or invalid images use a square ratio.
  const r = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const rotate = laysOnSide(ratio, rotatable, vertical);
  // Rotation swaps the displayed aspect ratio.
  const eff = rotate ? 1 / r : r;

  // Equal area: w*h = presence squared, w/h = eff.
  let width = ARTIFACT_PRESENCE * Math.sqrt(eff);
  let height = ARTIFACT_PRESENCE / Math.sqrt(eff);
  // Scale both axes together to preserve proportions under the limits.
  const k = Math.min(
    1,
    (vertical ? cross : long) / width,
    (vertical ? long : cross) / height,
  );
  width *= k;
  height *= k;
  return { width, height, rotate };
}
