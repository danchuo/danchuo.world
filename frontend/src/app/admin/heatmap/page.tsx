"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { AdminApiError, getHeatmap } from "@/lib/api/admin";
import { gridArea, resolveLayout, type TileId } from "@/lib/layout";
import type { HeatmapView } from "@/lib/api/types";

const TOKEN_KEY = "danchuo_admin_token"; // тот же ключ, что логин /admin

const mono = { fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" } satisfies CSSProperties;

/** Дефолтная раскладка борда (волна 01) — на ней рисуем оверлей-хитмапу. */
const LAYOUT = resolveLayout(null);

/**
 * Хитмапа кликов (B2, PRD §5.11) — приватный экран владельца под /admin (noindex, тот же bearer).
 * **Потайловая**, не пиксельная: рисуем сам bento борда и заливаем каждый тайл интенсивностью по
 * доле кликов — честная картина «куда смотрят/тыкают», стабильная через вьюпорты и волны.
 * Куки не ставит; данные cookieless, боты исключены, вклад одного посетителя в тайл ограничен.
 */
export default function HeatmapPage() {
  const [token, setToken] = useState<string | null>(null);
  // Публичная страница одна — `/`; фильтр по path остаётся в API (forward-compat), но в UI не нужен.
  const path = "/";
  const [data, setData] = useState<HeatmapView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY));
  }, []);

  const load = useCallback(
    async (t: string, p: string) => {
      setBusy(true);
      setError(null);
      try {
        setData(await getHeatmap(t, p));
      } catch (e) {
        setError(
          e instanceof AdminApiError
            ? e.status === 401
              ? "неверный/просроченный токен — войди заново на /admin"
              : `ошибка ${e.status}`
            : "сеть недоступна",
        );
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (token) load(token, path);
  }, [token, path, load]);

  if (token === null) {
    return (
      <main className="mx-auto min-h-screen max-w-md p-6">
        <h1 className="mb-4" style={{ fontSize: 22, color: "var(--text-primary)" }}>хитмапа</h1>
        <p style={mono}>
          сначала войди на <Link href="/admin" style={{ color: "var(--accent)" }}>/admin</Link> — токен берётся оттуда.
        </p>
      </main>
    );
  }

  const maxClicks = data ? Math.max(1, ...data.tiles.map((t) => t.clicks)) : 1;
  const clicksByTile = new Map<string, number>();
  data?.tiles.forEach((t) => {
    if (t.tileId) clicksByTile.set(t.tileId, t.clicks);
  });
  const offBoard = data?.tiles.find((t) => t.tileId === null);

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-6">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h1 style={{ fontSize: 22, color: "var(--text-primary)" }}>хитмапа · клики по тайлам</h1>
        <Link href="/admin" style={{ ...mono, color: "var(--accent)" }}>← дропы</Link>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {data ? (
          <span style={mono}>
            последние 7 дней ({data.from} → {data.to}) · всего {data.totalClicks} кликов
          </span>
        ) : (
          <span style={mono}>последние 7 дней</span>
        )}
        {busy && <span style={mono}>загрузка…</span>}
      </div>

      {error && <p className="mb-4" style={{ ...mono, color: "var(--accent)" }}>{error}</p>}

      {data && data.totalClicks === 0 && (
        <p style={mono}>за период кликов ещё нет — походи по борду и закрой вкладку (клики уходят батчем на уходе).</p>
      )}

      {/* Оверлей: реальная сетка борда, тайлы залиты интенсивностью кликов. */}
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
                gridArea: gridArea(span),
                minHeight: 0,
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                // Заливка акцентом по интенсивности (прозрачность растёт с долей кликов).
                background: `color-mix(in srgb, var(--accent) ${Math.round(8 + ratio * 84)}%, transparent)`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                padding: 2,
              }}
            >
              <span style={{ ...mono, fontSize: 10, color: "var(--text-secondary)" }}>{id}</span>
              <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>{clicks}</span>
            </div>
          );
        })}
      </div>

      {/* Таблица-легенда: тайлы по убыванию кликов + клики мимо плиток. */}
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
    </main>
  );
}
