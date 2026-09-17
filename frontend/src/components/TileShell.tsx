import type { CSSProperties, ReactNode, Ref } from "react";

export type TileState = "loading" | "empty" | "error" | "loaded";

interface TileShellProps {
  state: TileState;
  children?: ReactNode;
  /** Quiet empty context (DESIGN §7): "no data", "nothing playing", a future day. */
  emptyText?: string;
  onRetry?: () => void;
  /** A muted tile (DESIGN §2.4): soft ground, lower in height, with no corner pattern. */
  muted?: boolean;
  /** Peak height (the "Today" tile, DESIGN §2.3 — it lies above the rest). */
  elevated?: boolean;
  /**
   * The height chain inside a tile as FLEX rather than percentages. Needed by tiles whose height
   * comes from their content: there `height: 100%` resolves to "as tall as the content", so a list
   * hitting the ceiling would be clipped instead of shrinking. Flex shrinks in both modes.
   */
  fluid?: boolean;
  /** The corner pixel scatter (DESIGN §2.4), on the "Today" focus tile only. */
  scatter?: boolean;
  /**
   * A slot UNDER the content, a direct child of the tile (DESIGN §10.2). It is needed by layers that
   * have too little room inside the padding — a full-card ground clipped by the tile's own edge. From
   * the content such a layer cannot reach: it lies behind `p-4` and behind the `flex-1` column.
   */
  backdrop?: ReactNode;
  /** Quiet meta caption of the tile (DESIGN §3), giving the board its dashboard structure; not on a
   *  loader. A ReactNode rather than a string: the calendar hangs the active lens name here (PRD §5.3). */
  label?: ReactNode;
  style?: CSSProperties;
  className?: string;
  ariaLabel?: string;
  /** The tile's root `<section>`, for native listeners (the calendar attaches `wheel` here). */
  ref?: Ref<HTMLElement>;
}

/**
 * The bento tile's shell: the wave's signature layer in `.pixel-tile` (CSS owns `:hover`), four
 * independent states, no shared spinner, colours only from tokens. While loading the tile is
 * QUIET — it keeps its cell and shows nothing, then appears filled. DESIGN §7.10
 */
export function TileShell({
  state,
  children,
  emptyText = "нет данных",
  onRetry,
  muted = false,
  elevated = false,
  fluid = false,
  scatter = false,
  backdrop,
  label,
  style,
  className = "",
  ariaLabel,
  ref,
}: TileShellProps) {
  const tileClass = muted ? "muted-tile" : "pixel-tile";

  return (
    <section
      ref={ref}
      aria-label={ariaLabel}
      aria-busy={state === "loading"}
      data-quiet={state === "loading" ? "true" : undefined}
      data-elevated={!muted && elevated ? "true" : undefined}
      className={`tile-shell relative flex flex-col overflow-hidden p-4 ${tileClass} ${className}`}
      style={style}
    >
      {/* The box's lower backing plus the top card's white inner frame (§2.4) as separate elements:
          both of `.pixel-tile`'s pseudo slots are taken by the top card. Flat skins hide them. */}
      {!muted && <span className="pixel-slab" aria-hidden />}
      {!muted && <span className="pixel-lid" aria-hidden />}

      {/* The wave's backdrop (§10.2): it lies between the edge layers and the content, clipped by
          the tile's own `overflow-hidden` — that is, by its own radius and silhouette. */}
      {backdrop}

      {/* The corner's pixel scatter (§2.4) is a separate element over the surface (both pseudo
          slots are taken by the edge silhouette). Only on the focused tile, not a muted one. */}
      {scatter && !muted && <span className="pixel-scatter" aria-hidden />}

      {state !== "loading" && label && <div className="tile-label mb-1">{label}</div>}

      <div className={`relative min-h-0 flex-1${fluid ? " flex flex-col" : ""}`}>
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
