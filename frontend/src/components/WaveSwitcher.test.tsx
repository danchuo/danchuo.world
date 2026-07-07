import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { ThemeView } from "@/lib/api/types";
import { WaveProvider } from "./WaveProvider";
import { WaveSwitcher } from "./WaveSwitcher";

vi.mock("@/lib/api/client", () => ({ getThemes: vi.fn() }));
import { getThemes } from "@/lib/api/client";
const getThemesMock = vi.mocked(getThemes);

afterEach(() => {
  vi.clearAllMocks();
  document.cookie = "danchuo_wave=; max-age=0"; // cookie persists across tests in jsdom
});

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

  it("клик по свотчу запоминает волну в cookie (переживает перезагрузку)", async () => {
    getThemesMock.mockResolvedValue([
      theme(),
      theme({ key: "wave-02", name: "Волна 02", active: false }),
    ]);
    render(withWave(<WaveSwitcher />));

    fireEvent.click(await screen.findByLabelText("Волна: Волна 02"));

    await waitFor(() => expect(document.cookie).toContain("danchuo_wave=wave-02"));
  });

  // SSR деградировал (бэк недоступен/рейтлимит) ⇒ провайдер стартует без activeKey. Свитчер
  // самовосстанавливается по списку волн: cookie посетителя → его волна, иначе — активная.
  it("лечит деградированный SSR: применяет волну из cookie без её перезаписи", async () => {
    document.cookie = "danchuo_wave=wave-02; path=/";
    const setProp = vi.spyOn(document.documentElement.style, "setProperty");
    getThemesMock.mockResolvedValue([
      theme(),
      theme({ key: "wave-02", name: "Волна 02", active: false, tokens: { "bg-page": "#101010" } }),
    ]);
    render(<WaveProvider>{<WaveSwitcher />}</WaveProvider>);

    const second = await screen.findByLabelText("Волна: Волна 02");
    await waitFor(() => expect(second).toHaveAttribute("aria-pressed", "true"));
    expect(setProp).toHaveBeenCalledWith("--bg-page", "#101010");
  });

  it("лечит деградированный SSR без cookie: активная волна, cookie не появляется", async () => {
    getThemesMock.mockResolvedValue([
      theme(),
      theme({ key: "wave-02", name: "Волна 02", active: false }),
    ]);
    render(<WaveProvider>{<WaveSwitcher />}</WaveProvider>);

    const first = await screen.findByLabelText("Волна: Волна 01");
    await waitFor(() => expect(first).toHaveAttribute("aria-pressed", "true"));
    expect(document.cookie).not.toContain("danchuo_wave");
  });
});
