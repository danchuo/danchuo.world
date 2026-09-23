"use client";

import {
  createContext,
  startTransition,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { resolveLayout, type ResolvedLayout } from "@/lib/layout";
import { rememberWave } from "@/lib/waveCookie";
import type { Wave } from "@/lib/waves";
import { applyThemeTokens } from "@/lib/waves/tokens";

/**
 * The active wave's context: it holds the RESOLVED board layout and can swap waves live, tokens
 * and layout together, with no reload. The first render's truth comes from SSR props, so the board
 * draws in the right layout immediately, with no flash or reflow. DESIGN §10
 */
interface WaveContextValue {
  layout: ResolvedLayout;
  activeKey: string;
  applyWave: (wave: Wave) => void;
}

const WaveContext = createContext<WaveContextValue | null>(null);

/* `useLayoutEffect` warns during server rendering of a client component, so on the server a plain
   effect is used (the same device as in [ArtifactMarquee]). */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function useWave(): WaveContextValue {
  const ctx = use(WaveContext);
  if (!ctx) throw new Error("useWave должен вызываться внутри <WaveProvider>");
  return ctx;
}

export function WaveProvider({ initialWave, children }: { initialWave: Wave; children: ReactNode }) {
  const [wave, setWave] = useState<Wave>(initialWave);
  const layout = useMemo(() => resolveLayout(wave.layout), [wave]);

  const applyWave = useCallback((next: Wave) => {
    // A swap re-renders the whole board: as a transition it renders in slices instead of one long
    // task, and the skin still lands with the layout in a single commit (the layout effect below).
    startTransition(() => setWave(next));
    // Persist the pick so a reload re-renders the same wave via SSR (see waveCookie.ts).
    rememberWave(next.key);
  }, []);

  /* The SSR wave's tokens already stand in `:root` as a <style> block, so the first commit writes
     none; every later wave does. */
  const ssrTokensStand = useRef(true);

  /**
   * The wave's skin goes into the markup IN THE SAME FRAME as the layout. Writing `data-wave` from
   * the handler is impossible: markup changes at once while layout travels through React state, and
   * a paint slips between — the board stands in OLD editions under the NEW skin for ~100ms.
   */
  useIsomorphicLayoutEffect(() => {
    if (typeof document === "undefined") return;
    if (ssrTokensStand.current) ssrTokensStand.current = false;
    else applyThemeTokens(wave.tokens);
    // `data-wave` on <html> switches the wave's SKIN (borders, ground, decor, font) — the CSS under
    // `[data-wave="…"]` in globals.css (DESIGN §10.2). That is what "different styles per wave" means.
    document.documentElement.setAttribute("data-wave", wave.key);
  }, [wave]);

  const value = useMemo<WaveContextValue>(
    () => ({ layout, activeKey: wave.key, applyWave }),
    [layout, wave.key, applyWave],
  );

  return <WaveContext.Provider value={value}>{children}</WaveContext.Provider>;
}
