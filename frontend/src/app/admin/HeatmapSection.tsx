"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { AdminApiError, getHeatmap } from "@/lib/api/admin";
import { gridArea, resolveLayout, type TileId } from "@/lib/layout";
import type { HeatCellView, HeatmapView } from "@/lib/api/types";
import { BreakdownRows } from "./BreakdownRows";
import { mono } from "./adminUi";

/** Use the default board layout for the heatmap overlay. */
const LAYOUT = resolveLayout(null);

/* Static part of a heatmap cell; per-tile gridArea and intensity fill stay inline. */
const heatCellStyle: CSSProperties = {
  position: "relative",
  minHeight: 0,
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  padding: 2,
};

/* Label plate: the tile fill and the cloud both live under it, so it carries its own ground. */
const plateStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  lineHeight: 1.1,
  padding: "2px 6px",
  borderRadius: "var(--radius-sm)",
  background: "color-mix(in srgb, var(--bg-surface) 82%, transparent)",
};

/** Authenticated tile-level click heatmap over the period its parent resolved. PRD §5.11 */
export function HeatmapSection({ token, from, to }: { token: string; from: string; to: string }) {
  // Only the public board is exposed in this UI; the API retains its path filter.
  const path = "/";
  const [data, setData] = useState<HeatmapView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (t: string, p: string, f: string, u: string) => {
    setBusy(true);
    setError(null);
    try {
      setData(await getHeatmap(t, p, f, u));
    } catch (e) {
      setError(
        e instanceof AdminApiError
          ? e.status === 401
            ? "неверный/просроченный токен — войди заново"
            : `ошибка ${e.status}`
          : "сеть недоступна",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load(token, path, from, to);
  }, [token, path, from, to, load]);

  const maxClicks = data ? Math.max(1, ...data.tiles.map((t) => t.clicks)) : 1;
  const byTile = new Map(data?.tiles.map((t) => [t.tileId, t]) ?? []);
  const ground = data?.tiles.find((t) => t.tileId === null);

  return (
    <section>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 style={{ fontSize: 16, color: "var(--text-primary)" }}>хитмапа · клики по тайлам</h2>
        <span style={mono}>
          {data ? `всего ${data.totalClicks} кликов` : "загрузка"}
          {busy && " · загрузка…"}
        </span>
      </header>

      {error && <p className="mb-4" style={{ ...mono, color: "var(--accent)" }}>{error}</p>}

      {data && data.totalClicks === 0 && (
        <p className="mb-4" style={mono}>
          за период кликов ещё нет — походи по борду и закрой вкладку (клики уходят батчем на уходе).
        </p>
      )}

      {/* The overlay: the board's real grid, tiles filled by click intensity. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${LAYOUT.cols}, 1fr)`,
          gridTemplateRows: `repeat(${LAYOUT.rows}, minmax(0, 1fr))`,
          gap: 4,
          aspectRatio: `${LAYOUT.cols} / ${LAYOUT.rows}`,
          width: "100%",
        }}
      >
        {(Object.keys(LAYOUT.tiles) as TileId[]).map((id) => {
          const span = LAYOUT.tiles[id];
          if (span.hidden) return null;
          const tile = byTile.get(id);
          const clicks = tile?.clicks ?? 0;
          const ratio = clicks / maxClicks;
          return (
            <div
              key={id}
              title={`${id}: ${clicks} кликов, ${tile?.uniques ?? 0} уников`}
              style={{
                ...heatCellStyle,
                gridArea: gridArea(span),
                // Click share controls accent opacity.
                background: `color-mix(in srgb, var(--accent) ${Math.round(8 + ratio * 84)}%, transparent)`,
              }}
            >
              <ClickCloud cells={tile?.cells ?? []} grid={data?.grid ?? 6} />
              {/* The plate keeps the label readable over the cloud, which is ink on the same tile. */}
              <span style={plateStyle}>
                <span style={{ ...mono, fontSize: 10, color: "var(--text-secondary)" }}>{id}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{clicks}</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-6" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8 }}>
        <BreakdownRows
          title="клики по тайлам"
          dimension="source"
          rows={(data?.tiles ?? [])
            .filter((t) => t.tileId !== null)
            .map((t) => ({ key: t.tileId, visits: t.clicks, uniques: t.uniques, engagedVisits: 0 }))}
          empty="за период кликов нет"
        />
        {ground && (
          <BreakdownRows
            title="мимо плиток"
            dimension="source"
            rows={[{ key: "фон борда", visits: ground.clicks, uniques: ground.uniques, engagedVisits: 0 }]}
          />
        )}
      </div>
    </section>
  );
}

/**
 * Where inside the tile the clicks landed. The fractions have been collected since B2; binned
 * to the server's lattice they draw a cloud without shipping a point per click. PRD §5.11
 */
function ClickCloud({ cells, grid }: { cells: HeatCellView[]; grid: number }) {
  if (cells.length === 0) return null;
  const max = Math.max(...cells.map((c) => c.clicks));
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        gridTemplateColumns: `repeat(${grid}, 1fr)`,
        gridTemplateRows: `repeat(${grid}, 1fr)`,
      }}
    >
      {cells.map((cell) => (
        <span
          key={`${cell.x}-${cell.y}`}
          style={{
            gridColumn: cell.x + 1,
            gridRow: cell.y + 1,
            borderRadius: 2,
            background: `color-mix(in srgb, var(--text-primary) ${Math.round(12 + (cell.clicks / max) * 45)}%, transparent)`,
          }}
        />
      ))}
    </div>
  );
}
