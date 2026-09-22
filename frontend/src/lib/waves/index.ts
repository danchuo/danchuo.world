/**
 * The wave registry: each wave's palette and board delta, in code beside its skin
 * (`app/styles/waves/wave-NN.css`). A wave is visual code — typed, reviewed and shipped with the
 * frontend, not a database row an owner could edit but never had an editor for. DESIGN §10.1
 */

import type { WaveLayout } from "@/lib/layout";
import { WAVE_01 } from "./wave-01";
import { WAVE_02 } from "./wave-02";
import { WAVE_03 } from "./wave-03";

export interface Wave {
  /** Stable machine key: the `data-wave` attribute, the cookie value and the skin's CSS hook. */
  key: string;
  name: string;
  /** Release date, shown nowhere — it records WHEN, while the switcher's order is [WAVES]. */
  releasedAt: string;
  /** Design tokens WITHOUT the `--` prefix; the frontend injects them into `:root`. */
  tokens: Record<string, string>;
  /** The wave's delta over the default bento; absent ⇒ the plain `layout.ts` map. DESIGN §10.1 */
  layout?: WaveLayout;
}

/** Every released wave in the switcher's chip order: the display default first. DESIGN §10.2 */
export const WAVES: readonly Wave[] = [WAVE_03, WAVE_01, WAVE_02];

/** The owner's display default: what a visitor who has picked nothing sees. DESIGN §10.2 */
export const ACTIVE_WAVE_KEY = "wave-03";

export const ACTIVE_WAVE: Wave = WAVES.find((w) => w.key === ACTIVE_WAVE_KEY) ?? WAVES[0];

/**
 * The wave to render for a request: the visitor's cookie pick on top of the owner's default. An
 * unknown or stale key falls back silently — a cookie outlives the wave it names. DESIGN §10
 */
export function resolveDisplayWave(preferredKey: string | null): Wave {
  if (!preferredKey) return ACTIVE_WAVE;
  return WAVES.find((w) => w.key === preferredKey) ?? ACTIVE_WAVE;
}
