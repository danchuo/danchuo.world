"use client";

import { useCallback, useEffect, type CSSProperties } from "react";
import { getThemes } from "@/lib/api/client";
import type { ThemeView } from "@/lib/api/types";
import { readWaveCookie } from "@/lib/waveCookie";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";
import { useWave } from "./WaveProvider";

interface WaveSwitcherProps {
  style?: CSSProperties;
  className?: string;
}

/**
 * Переключатель волн (W) — PRD §5.9, DESIGN §2.6. Ряд квадратных пиксель-свотчей выпущенных
 * волн (свотч = `bg-page` волны); активная — в пиксель-рамке. Клик меняет отображаемую волну
 * **клиентским свопом** через [useWave]: токены едут в `:root`, layout — в состояние борда
 * (без перезагрузки) — компоненты не трогаются. Только реально выпущенные волны — без
 * слотов-заглушек под будущие (DESIGN §2.6).
 */
export function WaveSwitcher({ style, className }: WaveSwitcherProps) {
  const { phase, data, retry } = useTileData<ThemeView[]>(
    useCallback((signal) => getThemes({ signal }), []),
    "themes",
  );
  const themes = data ?? [];
  // Активная волна и своп — из контекста (SSR-дефолт = активная волна владельца). Своп
  // меняет и токены, и раскладку борда разом.
  const { activeKey, applyWave } = useWave();

  // Self-heal after a degraded SSR: backend down/rate-limited at render time ⇒ the page came
  // without a resolved wave (activeKey=null, default skin). Once the released-waves list is
  // here (network or stale cache), apply the visitor's cookie pick — or the owner's active
  // wave — so skin/tokens/layout and the pressed swatch recover without another reload.
  // `remember: false`: healing is not a pick, it must not (re)write the cookie.
  useEffect(() => {
    if (activeKey !== null || themes.length === 0) return;
    const preferred = readWaveCookie();
    const target = themes.find((t) => t.key === preferred) ?? themes.find((t) => t.active);
    if (target) applyWave(target, { remember: false });
  }, [activeKey, themes, applyWave]);

  const isEmpty = phase === "loaded" && themes.length === 0;

  return (
    <TileShell
      state={isEmpty ? "empty" : phase}
      emptyText="нет волн"
      onRetry={retry}
      label="волны"
      ariaLabel="Переключатель волн"
      style={style}
      className={className}
    >
      {phase === "loaded" && !isEmpty && (
        <div className="flex h-full flex-wrap content-center items-center gap-2">
          {themes.map((t) => {
            const isActive = t.key === activeKey;
            return (
              <button
                key={t.key}
                type="button"
                className="tap-target"
                aria-pressed={isActive}
                aria-label={`Волна: ${t.name}`}
                title={t.name}
                onClick={() => applyWave(t)}
                style={{
                  width: 18,
                  height: 18,
                  cursor: "pointer",
                  background: t.tokens["bg-page"] ?? "var(--bg-surface-muted)",
                  border: isActive ? "2px solid var(--border-pixel)" : "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                }}
              />
            );
          })}
        </div>
      )}
    </TileShell>
  );
}
