/** Shared admin styles and pure helpers; keep section-independent values outside page.tsx. */

import type { CSSProperties } from "react";
import { AdminApiError } from "@/lib/api/admin";
import type { ArtifactScanRunView, ArtifactScanStatusView, OrientationStatusView } from "@/lib/api/types";

export const TOKEN_KEY = "danchuo_admin_token";

export const mono = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "var(--text-tertiary)",
} satisfies CSSProperties;

export const fieldStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  padding: "8px 10px",
  fontSize: 14,
};

export const btnStyle: CSSProperties = {
  border: "1px solid var(--accent)",
  borderRadius: "var(--radius-sm)",
  background: "var(--accent)",
  color: "var(--bg-base)",
  padding: "8px 14px",
  fontSize: 14,
  cursor: "pointer",
};

/** Secondary action with the primary button's dimensions. */
export const secondaryBtnStyle: CSSProperties = {
  ...btnStyle,
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
};

/* Cover-pick thumbnail button; the isCover outline stays inline. */
export const coverBtnStyle: CSSProperties = {
  display: "block",
  width: "100%",
  aspectRatio: "1 / 1",
  padding: 0,
  cursor: "pointer",
  background: "none",
  borderRadius: "var(--radius-sm)",
  overflow: "hidden",
};

/* Manual-rotate button pinned to the frame corner (B9). */
export const rotateBtnStyle: CSSProperties = {
  position: "absolute",
  right: 4,
  bottom: 4,
  width: 28,
  height: 28,
  display: "grid",
  placeItems: "center",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
};

/* Per-frame delete button pinned to the top-right corner (opposite the rotate ↻ at bottom-right). */
export const deletePhotoBtnStyle: CSSProperties = {
  position: "absolute",
  right: 4,
  top: 4,
  width: 28,
  height: 28,
  display: "grid",
  placeItems: "center",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-surface)",
  color: "var(--accent)",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
};

/* "?" badge on frames the LLM could not orient (B9). */
export const ambiguousBadgeStyle: CSSProperties = {
  position: "absolute",
  left: 4,
  top: 4,
  padding: "1px 6px",
  borderRadius: "var(--radius-sm)",
  background: "var(--accent)",
  color: "var(--bg-base)",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
};

/** Manual artifact annotation. PRD §5.12. */

/** Annotation box appearance; the component supplies fractional coordinates. */
export const markerBoxStyle: CSSProperties = {
  position: "absolute",
  border: "2px solid var(--border)",
  // Translucent fill keeps the box visible on busy photos without hiding the item.
  background: "color-mix(in srgb, var(--accent) 12%, transparent)",
  pointerEvents: "none",
};

/** Only the close button intercepts pointers; dragging must also start through the label. */
export const markerBoxLabelStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  top: -18,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "0 4px",
  background: "var(--bg-surface)",
  color: "var(--text-secondary)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  lineHeight: 1.5,
  whiteSpace: "nowrap",
  pointerEvents: "auto",
};

/** Catalog row in the annotation picker. */
export const markerArtifactBtnStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "6px 8px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontSize: 13,
  textAlign: "left",
  cursor: "pointer",
};

/** Match the admin tabs' selected-state accent. */
export const markerSelectedArtifactBtnStyle: CSSProperties = {
  ...markerArtifactBtnStyle,
  border: "1px solid var(--accent)",
  background: "var(--accent)",
  color: "var(--bg-base)",
};

/** Annotation uses the remaining free photo corner: bottom-left. */
export const markBtnStyle: CSSProperties = {
  position: "absolute",
  left: 4,
  bottom: 4,
  width: 28,
  height: 28,
  display: "grid",
  placeItems: "center",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
};

/** Shared heading size across admin sections. */
export const sectionTitleStyle: CSSProperties = { fontSize: 16, color: "var(--text-primary)" };

/** Shared section registry; order defines the tab row. PRD §5.14. */
export const ADMIN_TABS = [
  { id: "drops", label: "дропы" },
  { id: "artifacts", label: "артефакты" },
  { id: "rides", label: "велопоездки" },
  { id: "stats", label: "статистика" },
] as const;

export type AdminTabId = (typeof ADMIN_TABS)[number]["id"];

/** Inactive tabs stay transparent so the row reads as navigation. */
export const tabBtnStyle: CSSProperties = {
  border: "1px solid transparent",
  borderRadius: "var(--radius-sm)",
  background: "none",
  color: "var(--text-secondary)",
  padding: "6px 12px",
  fontSize: 14,
  cursor: "pointer",
};

/** Match the primary form button's selected-state accent. */
export const activeTabBtnStyle: CSSProperties = {
  ...tabBtnStyle,
  border: "1px solid var(--accent)",
  background: "var(--accent)",
  color: "var(--bg-base)",
};

/** Local date for input[type=date], yyyy-MM-dd. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Human-readable admin API error. */
export function describe(e: unknown): string {
  return e instanceof AdminApiError
    ? e.status === 401
      ? "неверный токен"
      : `ошибка ${e.status}${e.errorCode ? ` (${e.errorCode})` : ""}`
    : "сеть недоступна";
}

/** Orientation status below the photo grid heading. */
export function orientationLabel(s: OrientationStatusView): string {
  switch (s.state) {
    case "running":
      return `проверка… ${s.checked + s.skipped}/${s.total}, повёрнуто ${s.rotated}`;
    case "done":
      return `проверено ${s.checked}/${s.total}, повёрнуто ${s.rotated}${s.skipped ? `, пропущено ${s.skipped}` : ""}`;
    case "failed":
      return "проверка упала — смотри логи бэка";
    default:
      return s.total > 0 ? `проверено кадров: ${s.checked}/${s.total}` : "";
  }
}

/** Skipped means no model response; those photos remain eligible for another scan. PRD §5.12. */
export function artifactScanLabel(s: ArtifactScanStatusView): string {
  switch (s.state) {
    case "running":
      return `ищу… ${s.checked + s.skipped}/${s.total}, найдено ${s.found}`;
    case "done":
      return `проверено ${s.checked}/${s.total}, найдено ${s.found}${s.skipped ? `, пропущено ${s.skipped}` : ""}`;
    case "failed":
      return "поиск упал — смотри логи бэка";
    default:
      return s.total > 0 ? `проверено кадров: ${s.checked}/${s.total}, найдено ${s.found}` : "";
  }
}

/** Archive scan summary; distinguish an unresponsive provider from a completed scan with no matches. PRD §5.12. */
export function artifactRunLabel(r: ArtifactScanRunView): string {
  const scope = r.artifactName ? `«${r.artifactName}»` : "все предметы";
  const done = r.checked + r.skipped;
  switch (r.state) {
    case "running":
      return `ищу ${scope}: дроп ${Math.min(r.dropsDone + 1, r.drops)} из ${r.drops}, кадров ${done}/${r.total}, найдено ${r.found}`;
    case "cancelled":
      return `прогон остановлен на ${done}/${r.total}, найдено ${r.found}`;
    case "failed":
      return "прогон упал — смотри логи бэка";
    case "done":
      return r.skipped > 0 && r.found === 0
        ? `прогон кончился, но все ${r.skipped} кадров пропущены — модель не отвечала: проверь ключ и DANCHUO_LLM_PROVIDER`
        : `прогон кончился: проверено ${r.checked}/${r.total}, найдено ${r.found}${r.skipped ? `, пропущено ${r.skipped}` : ""}`;
    default:
      return "";
  }
}

/** Detection chips sit below the photo because all photo corners contain controls. PRD §5.12. */
export const artifactChipListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 3,
  listStyle: "none",
  margin: "3px 0 0",
  padding: 0,
};

export const artifactChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  maxWidth: "100%",
  padding: "1px 5px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-surface)",
  color: "var(--text-secondary)",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  lineHeight: 1.6,
  cursor: "pointer",
};
