"use client";

import type { CSSProperties } from "react";
import { formatCount } from "@/lib/analyticsFormat";
import type { AnalyticsDayView } from "@/lib/api/types";
import { mono } from "./adminUi";

/**
 * Visits per day, with uniques NESTED inside each bar rather than beside it: uniques are a part
 * of visits, and two bars side by side would read as two independent series. One hue in two
 * steps, so identity never rests on colour alone — the nesting carries it.
 */
export function DailyChart({ days }: { days: AnalyticsDayView[] }) {
  const max = Math.max(1, ...days.map((d) => d.visits));

  return (
    <figure style={frameStyle}>
      <figcaption style={legendStyle}>
        <span style={legendItemStyle}>
          <i style={{ ...swatchStyle, background: "color-mix(in srgb, var(--accent) 28%, transparent)" }} />
          визиты
        </span>
        <span style={legendItemStyle}>
          <i style={{ ...swatchStyle, background: "var(--accent)" }} />
          уники
        </span>
        <span style={{ ...mono, marginLeft: "auto" }}>пик за день — {formatCount(max)}</span>
      </figcaption>

      {days.length === 0 ? (
        <p style={{ ...mono, padding: "24px 0" }}>за период заходов нет</p>
      ) : (
        <div style={plotStyle}>
          {days.map((day) => (
            <div
              key={day.date}
              title={`${day.date}: ${day.visits} визитов, ${day.uniques} уников, ${day.engagedVisits} вовлечённых`}
              style={columnStyle}
            >
              <div style={{ ...visitsBarStyle, height: `${(day.visits / max) * 100}%` }}>
                {/* The unique share grows from the same baseline, inside its own visit bar. */}
                <div
                  style={{
                    ...uniquesBarStyle,
                    height: day.visits === 0 ? "0%" : `${(day.uniques / day.visits) * 100}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...mono, display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span>{days.at(0)?.date ?? ""}</span>
        <span>{days.at(-1)?.date ?? ""}</span>
      </div>
    </figure>
  );
}

const frameStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-surface)",
  padding: 12,
};

const legendStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  fontSize: 12,
  color: "var(--text-secondary)",
  marginBottom: 10,
};

const legendItemStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6 };

const swatchStyle: CSSProperties = { width: 10, height: 10, borderRadius: 2, display: "inline-block" };

const plotStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: 2,
  height: 140,
  borderBottom: "1px solid var(--border)",
};

const columnStyle: CSSProperties = {
  flex: 1,
  minWidth: 2,
  height: "100%",
  display: "flex",
  alignItems: "flex-end",
};

const visitsBarStyle: CSSProperties = {
  width: "100%",
  minHeight: 1,
  display: "flex",
  alignItems: "flex-end",
  borderRadius: "4px 4px 0 0",
  background: "color-mix(in srgb, var(--accent) 28%, transparent)",
};

const uniquesBarStyle: CSSProperties = {
  width: "100%",
  borderRadius: "4px 4px 0 0",
  background: "var(--accent)",
};
