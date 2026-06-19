import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { ThemeView } from "@/lib/api/types";
import { WaveProvider } from "./WaveProvider";
import { WaveSwitcher } from "./WaveSwitcher";

vi.mock("@/lib/api/client", () => ({ getThemes: vi.fn() }));
import { getThemes } from "@/lib/api/client";
const getThemesMock = vi.mocked(getThemes);

afterEach(() => vi.clearAllMocks());

function theme(over: Partial<ThemeView> = {}): ThemeView {
  return {
    key: "wave-01",
    name: "Волна 01",
    tokens: { "bg-page": "#faf1eb", accent: "#e2604c" },
    layout: null,
    active: true,
    releasedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

/** Переключатель живёт внутри контекста волны — оборачиваем в провайдер с активной волной. */
function withWave(node: ReactNode) {
  return <WaveProvider initialActiveKey="wave-01">{node}</WaveProvider>;
}

describe("WaveSwitcher", () => {
  it("рендерит свотч активной волны", async () => {
    getThemesMock.mockResolvedValue([theme()]);
    render(withWave(<WaveSwitcher placeholderSlots={2} />));
    expect(await screen.findByLabelText("Волна: Волна 01")).toBeInTheDocument();
  });

  it("клик по свотчу свопит токены в :root", async () => {
    const setProp = vi.spyOn(document.documentElement.style, "setProperty");
    getThemesMock.mockResolvedValue([
      theme(),
      theme({ key: "wave-02", name: "Волна 02", active: false, tokens: { "bg-page": "#101010", accent: "#33ff99" } }),
    ]);
    render(withWave(<WaveSwitcher />));

    const second = await screen.findByLabelText("Волна: Волна 02");
    fireEvent.click(second);

    await waitFor(() => expect(setProp).toHaveBeenCalledWith("--bg-page", "#101010"));
    expect(setProp).toHaveBeenCalledWith("--accent", "#33ff99");
  });
});
