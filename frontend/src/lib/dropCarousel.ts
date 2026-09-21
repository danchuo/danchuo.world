/** Slot appearance depends on distance from the viewport center, never hover. DESIGN §7.5. */
import { toothHeight } from "./dropRoll";

/** Fixed slot height keeps the tile independent of archive size. DESIGN §7.5. */
export const CAROUSEL_SLOT_PX = 84;
/** Match the spacing of other plateless wave strips. */
export const CAROUSEL_GAP_PX = 6;
/** Fade radius keeps adjacent frames recognizable. DESIGN §7.5. */
export const CAROUSEL_RADIUS_PX = (CAROUSEL_SLOT_PX + CAROUSEL_GAP_PX) * 1.5;

/** Far frames remain photographs rather than miniatures. */
export const CAROUSEL_FAR_SCALE = 0.87;
/** Far frames blend into the canvas without disappearing. */
export const CAROUSEL_FAR_OPACITY = 0.45;
/** Blur softens far-frame clipping at the tile edge. DESIGN §7.5. */
export const CAROUSEL_FAR_BLUR_PX = 1.9;
/** Keep the central frame and immediate neighbors sharp. DESIGN §7.5. */
export const CAROUSEL_SHARP_PX = CAROUSEL_SLOT_PX + CAROUSEL_GAP_PX;
/** Per-frame remaining-distance fraction; vertical photos need slower motion. DESIGN §7.5. */
export const CAROUSEL_MOTION_RATE = 0.13;
/** Click-to-open motion is faster than browsing motion. DESIGN §7.5. */
export const CAROUSEL_OPEN_RATE = 0.42;
/** Bound opening delay: end frames may never reach the viewport center due to scroll clamping. */
export const CAROUSEL_OPEN_WAIT_MS = 260;

/** Appearance of a slot at its current strip position. */
export interface SlotLook {
  scale: number;
  opacity: number;
  /** Blur in pixels: zero at the center, capped at CAROUSEL_FAR_BLUR_PX. */
  blur: number;
  zIndex: number;
}

/** Cosine-squared falloff has smooth endpoints; scale by transform so scroll layout stays fixed. DESIGN §7.5. */
export function slotLook(distance: number, radius: number): SlotLook {
  return {
    scale: toothHeight(distance, radius, CAROUSEL_FAR_SCALE, 1),
    opacity: toothHeight(distance, radius, CAROUSEL_FAR_OPACITY, 1),
    // Blur starts beyond the sharp zone, preserving the central frame and both neighbors.
    blur: toothHeight(
      Math.max(0, Math.abs(distance) - CAROUSEL_SHARP_PX),
      CAROUSEL_SHARP_PX,
      CAROUSEL_FAR_BLUR_PX,
      0,
    ),
    // Near frames must stack above far neighbors regardless of DOM order.
    zIndex: Math.round(toothHeight(distance, radius, 0, 100)),
  };
}

/** Start on the second frame to show neighbors in both directions; use zero for fewer than two frames. */
export function startSlotIndex(count: number): number {
  return count > 1 ? 1 : 0;
}
