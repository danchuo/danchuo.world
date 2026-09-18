/** Pure 3D wave-object math; browser rendering lives in artifact3dStage.ts. These are not artifacts-slice records. DESIGN §12.5. */

/** Require dotted glTF extensions so /glb/x.png cannot match. */
const MODEL_EXT = [".glb", ".gltf"];

/** Detect glTF from the filename after stripping the query; adding a model needs no component change. DESIGN §12.2, §12.5. */
export function is3dArtifact(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0].toLowerCase();
  return MODEL_EXT.some((ext) => path.endsWith(ext));
}

/** Fit a sphere of radius into vertical fovDeg with padding, independently of model scale. */
export function fitDistance(radius: number, fovDeg: number, padding: number): number {
  const half = (fovDeg * Math.PI) / 360;
  // A zero-size model must not collapse the camera onto its near plane.
  const safe = Math.max(radius, 1e-3);
  return (safe / Math.sin(half)) * padding;
}

/** Clamp frame deltas so returning from a suspended tab cannot jump through many turns. */
const MAX_STEP_MS = 100;

/**
 * Keep an angle inside one turn. Whole turns are indistinguishable in the object's pose, and
 * storing them would make a later rewind unwind revolutions nobody can see. DESIGN §12.5
 */
export function wrapAngle(angle: number): number {
  const wrapped = angle % (2 * Math.PI);
  return wrapped < 0 ? wrapped + 2 * Math.PI : wrapped;
}

/** Advance the angle in radians at rpm for deltaMs, wrapping within one turn. */
export function nextSpin(angle: number, deltaMs: number, rpm: number): number {
  const step = Math.min(deltaMs, MAX_STEP_MS);
  const turns = (rpm * step) / 60_000;
  return wrapAngle(angle + turns * 2 * Math.PI);
}

/** Rewind the visible angle at the forward speed, stopping at zero without replaying completed turns. */
export function rewindSpin(angle: number, deltaMs: number, rpm: number): number {
  const step = Math.min(deltaMs, MAX_STEP_MS);
  const turns = (rpm * step) / 60_000;
  return Math.max(0, angle - turns * 2 * Math.PI);
}

/** Reset only when the frame loop stops; resetting every continuation freezes rotation. */
export interface FrameClock {
  /** Milliseconds since the previous frame; the first frame is zero. */
  step(now: number): number;
  /** Stop the clock so the next run excludes idle time. */
  reset(): void;
}

export function createFrameClock(): FrameClock {
  let prev = 0;
  return {
    step(now) {
      const delta = prev ? now - prev : 0;
      prev = now;
      return delta;
    },
    reset() {
      prev = 0;
    },
  };
}
