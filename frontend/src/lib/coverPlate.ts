/** Use a permitted Spotify logo/background combination when cover art is unavailable. DESIGN §7.1. */

/** Plate count; colors live in common.css under data-plate. */
export const COVER_PLATES = 5;

/** Stable FNV-1a selection keeps a track's fallback color unchanged across renders and reloads. */
export function coverPlate(seed: string | null): number {
  if (!seed) return 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    // Math.imul preserves 32-bit overflow bits for the FNV prime multiplication.
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h) % COVER_PLATES;
}
