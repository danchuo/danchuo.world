"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ThemeView } from "@/lib/api/types";
import { resolveLayout, type ResolvedLayout, type WaveLayout } from "@/lib/layout";
import { applyThemeTokens } from "@/lib/theme";

/**
 * Контекст активной волны (DESIGN §10): держит **разрешённый layout** борда и умеет свопать
 * волну вживую (токены в `:root` + layout) без перезагрузки. Источник правды на первый рендер —
 * SSR-пропсы (`initialLayout`/`initialActiveKey` активной волны из БД), поэтому борд рисуется
 * сразу в правильной раскладке (без вспышки/реflow). Переключатель волн вызывает [applyWave].
 */
interface WaveContextValue {
  layout: ResolvedLayout;
  activeKey: string | null;
  applyWave: (theme: ThemeView) => void;
}

const WaveContext = createContext<WaveContextValue | null>(null);

export function useWave(): WaveContextValue {
  const ctx = useContext(WaveContext);
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
  // Мержим layout волны поверх дефолта один раз на старте; дальше — на каждый своп волны.
  const [layout, setLayout] = useState<ResolvedLayout>(() => resolveLayout(initialLayout));
  const [activeKey, setActiveKey] = useState<string | null>(initialActiveKey ?? null);

  const applyWave = useCallback((theme: ThemeView) => {
    applyThemeTokens(theme.tokens); // визуал — в :root (без перезагрузки)
    setLayout(resolveLayout(theme.layout)); // раскладка — в состояние борда
    setActiveKey(theme.key);
  }, []);

  const value = useMemo<WaveContextValue>(
    () => ({ layout, activeKey, applyWave }),
    [layout, activeKey, applyWave],
  );

  return <WaveContext.Provider value={value}>{children}</WaveContext.Provider>;
}
