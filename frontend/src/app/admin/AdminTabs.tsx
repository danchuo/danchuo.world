"use client";

import { ADMIN_TABS, activeTabBtnStyle, tabBtnStyle } from "./adminUi";
import type { AdminTabId } from "./adminUi";

/** Parent-owned selection preserves shared state and polling; aria-selected exposes the active tab. PRD §5.14. */
export function AdminTabs({
  active,
  onSelect,
}: {
  active: AdminTabId;
  onSelect: (id: AdminTabId) => void;
}) {
  return (
    // The shared page header owns spacing and borders.
    <nav role="tablist" aria-label="разделы админки" className="flex flex-wrap items-center gap-1">
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
