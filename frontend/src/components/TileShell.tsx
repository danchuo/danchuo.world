import type { CSSProperties, ReactNode } from "react";

export type TileState = "loading" | "empty" | "error" | "loaded";

interface TileShellProps {
  state: TileState;
  children?: ReactNode;
  /** Тихий контекст пустоты (§7 Empty): «нет данных», «ничего не играет», будущий день. */
  emptyText?: string;
  onRetry?: () => void;
  /** Приглушённая плитка (§2.4): мягкий фон, ниже по высоте, без углового узора. */
  muted?: boolean;
  /** Пик высоты (плитка «Сегодня», §2.3 — лежит выше остальных). */
  elevated?: boolean;
  /** Тихая мета-подпись плитки (§3): даёт дашбордную структуру; не на лоадере. */
  label?: string;
  style?: CSSProperties;
  className?: string;
  ariaLabel?: string;
}

/**
 * Оболочка плитки bento. Заполненная плитка несёт фирменный слой волны 01 (§2.4):
 * ступенчатую пиксель-рамку (`clip-path`), тёплый перелив поверхности и парящую
 * drop-shadow-тень с hover-lift — всё в классе `.pixel-tile` (CSS, ради `:hover`).
 * Приглушённая — мягкий `.muted-tile`. Четыре независимых состояния (§7, без общего
 * спиннера). Колорит/глубина — только из токенов волны, ни одного хардкода (§2.5).
 */
export function TileShell({
  state,
  children,
  emptyText = "нет данных",
  onRetry,
  muted = false,
  elevated = false,
  label,
  style,
  className = "",
  ariaLabel,
}: TileShellProps) {
  const tileClass = muted ? "muted-tile" : "pixel-tile";

  return (
    <section
      aria-label={ariaLabel}
      aria-busy={state === "loading"}
      data-elevated={!muted && elevated ? "true" : undefined}
      className={`relative flex flex-col overflow-hidden p-4 ${tileClass} ${className}`}
      style={style}
    >
      {state === "loading" && (
        <div
          data-testid="tile-loading"
          className="pixel-shimmer absolute inset-0"
          aria-hidden
        />
      )}

      {state !== "loading" && label && <div className="tile-label mb-1">{label}</div>}

      <div className="relative min-h-0 flex-1">
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
      </div>
    </section>
  );
}
