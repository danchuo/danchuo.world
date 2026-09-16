"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ThemeView } from "@/lib/api/types";
import { resolveLayout, type ResolvedLayout, type WaveLayout } from "@/lib/layout";
import { applyThemeTokens } from "@/lib/theme";
import { rememberWave } from "@/lib/waveCookie";

/**
 * The active wave's context: it holds the RESOLVED board layout and can swap waves live, tokens
 * and layout together, with no reload. The first render's truth comes from SSR props, so the board
 * draws in the right layout immediately, with no flash or reflow. DESIGN §10
 */
interface WaveContextValue {
  layout: ResolvedLayout;
  activeKey: string | null;
  /**
   * `remember: false` — apply without persisting to the cookie: used by the switcher's
   * self-heal after a degraded SSR, so a visitor who never picked a wave doesn't get
   * pinned to whatever was active at heal time.
   */
  applyWave: (theme: ThemeView, opts?: { remember?: boolean }) => void;
}

/** The wave applied to the board: layout, skin key and tokens (the SSR wave has none). */
interface Applied {
  layout: ResolvedLayout;
  key: string | null;
  tokens: ThemeView["tokens"] | null;
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

export function WaveProvider({
  initialLayout,
  initialActiveKey,
  children,
}: {
  initialLayout?: WaveLayout | null;
  initialActiveKey?: string | null;
  children: ReactNode;
}) {
  // The wave's layout is merged over the default once at start, and then on every wave swap. Skin and
  // layout are held in ONE state deliberately — see the note at the effect below.
  const [wave, setWave] = useState<Applied>(() => ({
    layout: resolveLayout(initialLayout),
    key: initialActiveKey ?? null,
    tokens: null,
  }));

  const applyWave = useCallback((theme: ThemeView, opts?: { remember?: boolean }) => {
    setWave({ layout: resolveLayout(theme.layout), key: theme.key, tokens: theme.tokens });
    // Persist the pick so a reload re-renders the same wave via SSR (see waveCookie.ts).
    if (opts?.remember !== false) rememberWave(theme.key);
  }, []);

  /**
   * The wave's skin goes into the markup IN THE SAME FRAME as the layout. Writing `data-wave` from
   * the handler is impossible: markup changes at once while layout travels through React state, and
   * a paint slips between — the board stands in OLD editions under the NEW skin for ~100ms.
   */
  useIsomorphicLayoutEffect(() => {
    if (!wave.key || typeof document === "undefined") return;
    // Only an arrived wave has tokens: at start they already stand in `:root` from SSR.
    if (wave.tokens) applyThemeTokens(wave.tokens);
    // `data-wave` on <html> switches the wave's SKIN (borders, ground, decor, font) — the CSS under
    // `[data-wave="…"]` in globals.css (DESIGN §10.2). That is what "different styles per wave" means.
    document.documentElement.setAttribute("data-wave", wave.key);
  }, [wave]);

  const value = useMemo<WaveContextValue>(
    () => ({ layout: wave.layout, activeKey: wave.key, applyWave }),
    [wave, applyWave],
  );

  return <WaveContext.Provider value={value}>{children}</WaveContext.Provider>;
}
