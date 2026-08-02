/**
 * Общие для секций админки стили и мелкие чистые хелперы. Отдельным модулем (а не в
 * `page.tsx`), потому что их делят между собой все панели — форма дропа, список, сетка
 * кадров, импорт велобайка. Файл `.ts`, а не `.tsx`: тут только значения, компонентов нет.
 */

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

/**
 * Разделы админки (§5.14, реестр I-64): экран на раздел вместо одной простыни. Порядок тут —
 * порядок кнопок в ряду, добавление раздела = строка в этом списке плюс ветка рендера.
 * Список здесь, а не в компоненте: его делят ряд вкладок и сама страница.
 */
export const ADMIN_TABS = [
  { id: "drops", label: "дропы" },
  { id: "artifacts", label: "артефакты" },
  { id: "rides", label: "велопоездки" },
  { id: "stats", label: "статистика" },
] as const;

export type AdminTabId = (typeof ADMIN_TABS)[number]["id"];

/** Кнопка раздела. Невыбранная — прозрачная: ряд читается строкой надписей, а не полосой плашек. */
export const tabBtnStyle: CSSProperties = {
  border: "1px solid transparent",
  borderRadius: "var(--radius-sm)",
  background: "none",
  color: "var(--text-secondary)",
  padding: "6px 12px",
  fontSize: 14,
  cursor: "pointer",
};

/** Выбранный раздел — заливка акцентом (то же решение, что у главной кнопки формы). */
export const activeTabBtnStyle: CSSProperties = {
  ...tabBtnStyle,
  border: "1px solid var(--accent)",
  background: "var(--accent)",
  color: "var(--bg-base)",
};

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

/**
 * Строка статуса поиска артефактов (§5.12). «Пропущено» тут значит «модель не ответила» —
 * такие кадры остаются непроверенными и подхватятся следующим прогоном, поэтому их видно
 * отдельно от найденного.
 */
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

/**
 * Строка сводки по прогону всего архива (§5.12).
 *
 * Отдельно от [artifactScanLabel] называет **предмет**, ради которого прогон затеян, и
 * **дропы** — на прогоне в двести кадров счётчик кадров движется незаметно, а «дроп 2 из 6»
 * читается сразу.
 *
 * Всё пропущено и ничего не найдено — не «на кадрах пусто», а молчащий провайдер (нет ключа,
 * не тот провайдер в `DANCHUO_LLM_PROVIDER`, рейт-лимит). Разница видна только тут, поэтому
 * строка говорит об этом прямо: иначе прогон выглядит успешным и пустым одновременно.
 */
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

/* Список находок под кадром в админ-сетке (§5.12). Ниже картинки, а не поверх: углы кадра уже
   заняты поворотом, удалением и бейджем «?», а имён может быть несколько. */
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
