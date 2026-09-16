"use client";

import { Icon } from "@/components/Icon";
import type { AdminDropView } from "@/lib/api/types";
import { mono, sectionTitleStyle } from "./adminUi";

interface DropListProps {
  drops: AdminDropView[];
  selectedId: number | null;
  onSelect: (drop: AdminDropView) => void;
  onDelete: (drop: AdminDropView) => void;
}

/** Parent-owned drop selection and deletion. */
export function DropList({ drops, selectedId, onSelect, onDelete }: DropListProps) {
  return (
    <section className="md:w-1/3">
      <h2 className="mb-3" style={sectionTitleStyle}>дропы</h2>
      {drops.length === 0 ? (
        <p style={mono}>пока нет дропов</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {drops.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onSelect(d)}
                className="flex-1 text-left"
                style={{
                  background: selectedId === d.id ? "var(--bg-surface-muted)" : "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "6px 8px",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <span style={{ fontSize: 14, color: "var(--text-primary)" }}>{d.title}</span>
                <span style={{ ...mono, marginLeft: 8 }}>{d.droppedOn} · {d.photoCount}</span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(d)}
                aria-label={`Удалить ${d.title}`}
                style={{ ...mono, background: "none", border: "none", cursor: "pointer", color: "var(--accent)", display: "inline-flex" }}
              >
                <Icon name="close" size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
