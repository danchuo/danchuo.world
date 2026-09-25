import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AdminTabs } from "./AdminTabs";
import { ADMIN_TABS } from "./adminUi";

describe("AdminTabs — the admin section row (§5.14, I-64)", () => {
  it("shows all sections in registry order", () => {
    render(<AdminTabs active="drops" onSelect={() => {}} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "дропы",
      "артефакты",
      "велопоездки",
      "статистика",
      "обратная связь",
      "тирлисты",
    ]);
    expect(ADMIN_TABS).toHaveLength(tabs.length);
  });

  it("the selected section is marked for screen readers, the others are not", () => {
    // The only "where am I" signal on this row: the highlight colour is invisible to a screen reader.
    render(<AdminTabs active="artifacts" onSelect={() => {}} />);
    expect(screen.getByRole("tab", { name: "артефакты" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "дропы" })).toHaveAttribute("aria-selected", "false");
  });

  it("a click on a section returns its key", () => {
    const onSelect = vi.fn();
    render(<AdminTabs active="drops" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("tab", { name: "велопоездки" }));
    expect(onSelect).toHaveBeenCalledWith("rides");
  });

  it("the row is declared a tab list", () => {
    // The tablist role binds the buttons into one group — otherwise they are four buttons in a row.
    render(<AdminTabs active="drops" onSelect={() => {}} />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });
});
