import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AdminTabs } from "./AdminTabs";
import { ADMIN_TABS } from "./adminUi";

describe("AdminTabs — ряд разделов админки (§5.14, I-64)", () => {
  it("показывает все разделы в порядке реестра", () => {
    render(<AdminTabs active="drops" onSelect={() => {}} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["дропы", "артефакты", "велопоездки", "статистика"]);
    expect(ADMIN_TABS).toHaveLength(tabs.length);
  });

  it("выбранный раздел помечен для скринридера, остальные — нет", () => {
    // Единственный признак «где я» на этом ряду: подсветка кнопки цветом скринридеру не видна.
    render(<AdminTabs active="artifacts" onSelect={() => {}} />);
    expect(screen.getByRole("tab", { name: "артефакты" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "дропы" })).toHaveAttribute("aria-selected", "false");
  });

  it("клик по разделу отдаёт его ключ", () => {
    const onSelect = vi.fn();
    render(<AdminTabs active="drops" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("tab", { name: "велопоездки" }));
    expect(onSelect).toHaveBeenCalledWith("rides");
  });

  it("ряд объявлен списком вкладок", () => {
    // Роль tablist связывает кнопки в одну группу — иначе это просто четыре кнопки подряд.
    render(<AdminTabs active="drops" onSelect={() => {}} />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });
});
