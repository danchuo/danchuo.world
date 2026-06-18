import type { CSSProperties, ReactNode } from "react";

export type TileState = "loading" | "empty" | "error" | "loaded";

interface TileShellProps {
  state: TileState;
  children?: ReactNode;
  /** Тихий контекст пустоты (§7 Empty): «нет данных», «ничего не играет», будущий день. */
  emptyText?: string;
  onRetry?: () => void;
  /** Приглушённая плитка (§2.4): муженый фон, ниже по высоте, без узора. */
  muted?: boolean;
  /** Пик высоты (плитка «Сегодня», §2.3 — лежит выше остальных). */
  elevated?: boolean;
  style?: CSSProperties;
  className?: string;
  ariaLabel?: string;
}

/**
 * Оболочка плитки bento: парящая пиксель-рамка (§2.4) + четыре независимых состояния
 * (§7 — loading/empty/error/loaded, без общего спиннера). Колорит/глубина — только из
 * токенов волны (var(--…)), ни одного хардкод-цвета (DESIGN §2.5).
 */
export function TileShell({
  state,
  children,
  emptyText = "нет данных",
  onRetry,
  muted = false,
  elevated = false,
  style,
  className = "",
  ariaLabel,
}: TileShellProps) {
  const surface = muted ? "var(--bg-surface-muted)" : "var(--bg-surface)";
  const elevation = elevated ? "var(--elev-3)" : muted ? "var(--elev-1)" : "var(--elev-2)";

  return (
    <section
      aria-label={ariaLabel}
      aria-busy={state === "loading"}
      className={`relative overflow-hidden p-4 ${className}`}
      style={{
        background: surface,
        border: `2px solid var(--border-pixel)`,
        boxShadow: elevation,
        // Ступенчатый угол вместо радиуса у заполненных плиток (§2.3).
        borderRadius: muted ? "var(--radius-md)" : "var(--radius-sm)",
        ...style,
      }}
    >
      {state === "loading" && (
        <div
          data-testid="tile-loading"
          className="pixel-shimmer absolute inset-0"
          aria-hidden
        />
      )}

      {state === "error" && (
        <div className="flex h-full flex-col items-start justify-center gap-2">
          <p style={{ color: "var(--text-secondary)" }}>не удалось загрузить</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="cursor-pointer underline"
              style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}
            >
              повторить
            </button>
          )}
        </div>
      )}

      {state === "empty" && (
        <div className="flex h-full items-center justify-center text-center">
          <p style={{ color: "var(--text-tertiary)" }}>{emptyText}</p>
        </div>
      )}

      {state === "loaded" && children}
    </section>
  );
}
