/**
 * Общие для секций админки стили и мелкие чистые хелперы. Отдельным модулем (а не в
 * `page.tsx`), потому что их делят между собой все панели — форма дропа, список, сетка
 * кадров, импорт велобайка. Файл `.ts`, а не `.tsx`: тут только значения, компонентов нет.
 */

import type { CSSProperties } from "react";
import { AdminApiError } from "@/lib/api/admin";
import type { OrientationStatusView } from "@/lib/api/types";

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

/** Вторичная кнопка — тот же габарит, но поверхностью и рамкой вместо заливки акцентом. */
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

/** Заголовок панели — один кегль на все секции админки. */
export const sectionTitleStyle: CSSProperties = { fontSize: 16, color: "var(--text-primary)" };

/** Сегодняшняя дата в формате input[type=date] (`yyyy-MM-dd`), локальная. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Человекочитаемая ошибка админ-API. Чистая (без состояния) — на уровне модуля, не пересоздаётся. */
export function describe(e: unknown): string {
  return e instanceof AdminApiError
    ? e.status === 401
      ? "неверный токен"
      : `ошибка ${e.status}${e.errorCode ? ` (${e.errorCode})` : ""}`
    : "сеть недоступна";
}

/** Строка статуса проверки поворота под заголовком сетки кадров. Чистая — на уровне модуля. */
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
