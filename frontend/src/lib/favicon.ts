/**
 * The tab icon: a spinning Earth, per wave. A tab cannot be animated by an image — only Firefox
 * plays an animated GIF there — so frames travel as a SPRITE sheet that [FaviconSpinner] slices on
 * a canvas. A wave may bring its own; without one it gets the default. DESIGN §10.3
 */

export interface FaviconSprite {
  /** Sprite strip: `frames` cells of `cell`×`cell` in a row. */
  src: string;
  frames: number;
  cell: number;
  /** How long one frame is held. A full turn is `frames * frameMs`. */
  frameMs: number;
}

/** The default Earth, for every wave without one of its own (48 frames, a 3.84s turn). */
const EARTH_SPIN: FaviconSprite = {
  src: "/assets/favicon/earth-spin.png",
  frames: 48,
  cell: 32,
  frameMs: 80,
};

/** Wave icons: wave key → sprite. A wave absent here gets [EARTH_SPIN]. */
export const FAVICON_SPRITES: Record<string, FaviconSprite> = {
  // Wave 02 "Obscura" — an 8-bit planet matching its pixel font and clouds. Only 8 frames, hence the
  // longer step: a 1.28s turn, or the planet judders.
  "wave-02": { src: "/assets/favicon/earth-pixel.png", frames: 8, cell: 32, frameMs: 160 },
  // Wave 03 "PRIME" — a blue wireframe globe (the owner's source). 36 frames at 100ms, the tempo taken
  // from the strip itself for a 3.6s turn. The source's white field was removed by a fill from the
  // corners, and the dithering along the contour by a circular mask, it being a sphere.
  "wave-03": { src: "/assets/favicon/earth-prime.png", frames: 36, cell: 32, frameMs: 100 },
};

/** The sprite for a wave; an unknown, empty or future wave quietly gets the default (as all of §10). */
export function resolveFavicon(wave?: string | null): FaviconSprite {
  return (wave && FAVICON_SPRITES[wave]) || EARTH_SPIN;
}

/** One full turn of the planet. */
export function faviconLoopMs(sprite: FaviconSprite): number {
  return sprite.frames * sprite.frameMs;
}

/**
 * The frame by elapsed time rather than by a tick counter: a background tab throttles timers, so a
 * counter would fall behind real time and the planet would reel in the turn on return.
 */
export function faviconFrameAt(elapsedMs: number, sprite: FaviconSprite): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.floor(elapsedMs / sprite.frameMs) % sprite.frames;
}
