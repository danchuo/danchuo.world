"use client";

import { ADMIN_TABS, activeTabBtnStyle, tabBtnStyle } from "./adminUi";
import type { AdminTabId } from "./adminUi";

/**
 * Ряд разделов админки (§5.14, реестр I-64) — горизонтальная линия кнопок под шапкой.
 *
 * Компонент чисто представительный: активный раздел приходит пропом, свой выбор он только
 * сообщает наружу. Состояние живёт в [AdminPage] — там же, где токен и выбранный дроп,
 * которые переживают переключение раздела (фоновые прогоны продолжают поллиться).
 *
 * Роли `tablist`/`tab` — не украшение: подсветка выбранного цветом скринридеру не видна,
 * `aria-selected` остаётся единственным признаком «где я».
 */
export function AdminTabs({
  active,
  onSelect,
}: {
  active: AdminTabId;
  onSelect: (id: AdminTabId) => void;
}) {
  return (
    <nav
      role="tablist"
      aria-label="разделы админки"
      className="mb-6 flex flex-wrap items-center gap-1 pb-3"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {ADMIN_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onSelect(tab.id)}
          style={active === tab.id ? activeTabBtnStyle : tabBtnStyle}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
