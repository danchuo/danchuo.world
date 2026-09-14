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
 * Контекст активной волны (DESIGN §10): держит **разрешённый layout** борда и умеет свопать
 * волну вживую (токены в `:root` + layout) без перезагрузки. Источник правды на первый рендер —
 * SSR-пропсы (`initialLayout`/`initialActiveKey` активной волны из БД), поэтому борд рисуется
 * сразу в правильной раскладке (без вспышки/реflow). Переключатель волн вызывает [applyWave].
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

/** Волна, применённая к борду: раскладка, ключ скина и токены (у SSR-волны их нет). */
interface Applied {
  layout: ResolvedLayout;
  key: string | null;
  tokens: ThemeView["tokens"] | null;
}

const WaveContext = createContext<WaveContextValue | null>(null);

/* `useLayoutEffect` шумит предупреждением при серверном рендере клиентского компонента —
   на сервере берём обычный эффект (тот же приём, что в [ArtifactMarquee]). */
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
  // Мержим layout волны поверх дефолта один раз на старте; дальше — на каждый своп волны.
  // Скин и раскладка держатся ОДНИМ состоянием намеренно — см. врез у эффекта ниже.
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
   * Скин волны — в разметку, но **в том же кадре, что и раскладка**.
   *
   * ⚠️ Писать `data-wave` и токены прямо из обработчика нельзя. Разметка правится сразу,
   * а раскладка едет через состояние React, то есть доезжает следующим коммитом — и между
   * ними успевает пройти отрисовка. Борд в этот момент стоит в СТАРЫХ редакциях под НОВЫМ
   * скином: на свопе в PRIME карточка велобайка волны 01 успевала мелькнуть на стекле
   * (замер: ~80–120мс, поймано владельцем). Эффект раскладки (до отрисовки, после коммита)
   * склеивает оба изменения в один кадр.
   */
  useIsomorphicLayoutEffect(() => {
    if (!wave.key || typeof document === "undefined") return;
    // Токены есть только у пришедшей волны: на старте они уже стоят в `:root` от SSR.
    if (wave.tokens) applyThemeTokens(wave.tokens);
    // data-wave на <html> переключает СКИН волны (рамки/фон/декор/шрифт) — CSS под
    // `[data-wave="…"]` в globals.css (DESIGN §10.2). Это и есть «разные стили под разные волны».
    document.documentElement.setAttribute("data-wave", wave.key);
  }, [wave]);

  const value = useMemo<WaveContextValue>(
    () => ({ layout: wave.layout, activeKey: wave.key, applyWave }),
    [wave, applyWave],
  );

  return <WaveContext.Provider value={value}>{children}</WaveContext.Provider>;
}
