"use client";

import type { CSSProperties } from "react";
import { breakdownLabel, formatCount, type BreakdownKey } from "@/lib/analyticsFormat";
import type { BreakdownRowView } from "@/lib/api/types";
import { mono } from "./adminUi";

/**
 * One dimension of the dashboard as rows with a bar behind them. The bar is the row's own
 * background rather than a column of its own: the label stays readable at any share. PRD §5.11
 */
export function BreakdownRows({
  title,
  dimension,
  rows,
  hint,
  empty = "за период пусто",
}: {
  title: string;
  dimension: BreakdownKey;
  rows: BreakdownRowView[];
  /** What the dimension means; a hinted heading is underlined, or nobody hovers it. */
  hint?: string;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.visits));

  return (
    <section style={cardStyle}>
      <h3 style={{ ...mono, color: "var(--text-secondary)", marginBottom: 8 }}>
        {hint ? (
          <span title={hint} style={hintedStyle}>
            {title}
          </span>
        ) : (
          title
        )}
      </h3>
      {rows.length === 0 ? (
        <p style={mono}>{empty}</p>
      ) : (
        <ol style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {rows.map((row) => (
            <li
              key={row.key ?? "(none)"}
              title={`${breakdownLabel(dimension, row.key)}: ${row.visits} визитов, ${row.uniques} уников`}
              style={{
                ...rowStyle,
                // Share of the leader drives the fill width; the text sits on top of it.
                backgroundImage: `linear-gradient(to right, color-mix(in srgb, var(--accent) 22%, transparent) ${(row.visits / max) * 100}%, transparent 0)`,
              }}
            >
              <span style={labelStyle}>{breakdownLabel(dimension, row.key)}</span>
              <span style={{ ...mono, color: "var(--text-tertiary)" }}>{formatCount(row.uniques)}</span>
              <span style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 13 }}>
                {formatCount(row.visits)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** A label that hides an explanation says so: dotted underline plus the help cursor. */
export const hintedStyle: CSSProperties = {
  textDecoration: "underline dotted",
  textUnderlineOffset: 3,
  textDecorationColor: "var(--text-tertiary)",
  cursor: "help",
};

const cardStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-surface)",
  padding: 12,
};

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto auto",
  alignItems: "baseline",
  gap: 10,
  padding: "5px 8px",
  borderRadius: "var(--radius-sm)",
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  color: "var(--text-primary)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
