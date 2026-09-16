"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { AdminApiError, getHeatmap } from "@/lib/api/admin";
import { gridArea, resolveLayout, type TileId } from "@/lib/layout";
import type { HeatmapView } from "@/lib/api/types";

const mono = { fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" } satisfies CSSProperties;

/** Use the default board layout for the heatmap overlay. */
const LAYOUT = resolveLayout(null);

/* Static part of a heatmap cell; per-tile gridArea and intensity fill stay inline. */
const heatCellStyle: CSSProperties = {
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

/** Authenticated tile-level click heatmap. PRD §5.11. */
export function HeatmapSection({ token }: { token: string }) {
  // Only the public board is exposed in this UI; the API retains its path filter.
  const path = "/";
  const [data, setData] = useState<HeatmapView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (t: string, p: string) => {
    setBusy(true);
    setError(null);
    try {
      setData(await getHeatmap(t, p));
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
    load(token, path);
  }, [token, path, load]);

  const maxClicks = data ? Math.max(1, ...data.tiles.map((t) => t.clicks)) : 1;
  const clicksByTile = new Map<string, number>();
  data?.tiles.forEach((t) => {
    if (t.tileId) clicksByTile.set(t.tileId, t.clicks);
  });
  const offBoard = data?.tiles.find((t) => t.tileId === null);

  return (
    <section>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 style={{ fontSize: 16, color: "var(--text-primary)" }}>хитмапа · клики по тайлам</h2>
        <span style={mono}>
          {data
            ? `последние 7 дней (${data.from} → ${data.to}) · всего ${data.totalClicks} кликов`
            : "последние 7 дней"}
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
          const clicks = clicksByTile.get(id) ?? 0;
          const ratio = clicks / maxClicks;
          return (
            <div
              key={id}
              title={`${id}: ${clicks}`}
              style={{
                ...heatCellStyle,
                gridArea: gridArea(span),
                // Click share controls accent opacity.
                background: `color-mix(in srgb, var(--accent) ${Math.round(8 + ratio * 84)}%, transparent)`,
              }}
            >
              <span style={{ ...mono, fontSize: 10, color: ratio > 0.5 ? "var(--bg-page)" : "var(--text-secondary)" }}>{id}</span>
              <span style={{ fontSize: 13, color: ratio > 0.5 ? "var(--bg-page)" : "var(--text-primary)", fontWeight: 600 }}>{clicks}</span>
            </div>
          );
        })}
      </div>

      {data && data.tiles.length > 0 && (
        <table className="mt-6 w-full" style={{ borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-tertiary)" }}>
              <th style={{ padding: "4px 8px" }}>тайл</th>
              <th style={{ padding: "4px 8px" }}>клики</th>
              <th style={{ padding: "4px 8px" }}>уники</th>
            </tr>
          </thead>
          <tbody>
            {data.tiles
              .filter((t) => t.tileId !== null)
              .map((t) => (
                <tr key={t.tileId} style={{ borderTop: "1px solid var(--border)", color: "var(--text-primary)" }}>
                  <td style={{ padding: "4px 8px" }}>{t.tileId}</td>
                  <td style={{ padding: "4px 8px" }}>{t.clicks}</td>
                  <td style={{ padding: "4px 8px" }}>{t.uniques}</td>
                </tr>
              ))}
            {offBoard && (
              <tr style={{ borderTop: "1px solid var(--border)", color: "var(--text-tertiary)" }}>
                <td style={{ padding: "4px 8px" }}>мимо плиток</td>
                <td style={{ padding: "4px 8px" }}>{offBoard.clicks}</td>
                <td style={{ padding: "4px 8px" }}>{offBoard.uniques}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
