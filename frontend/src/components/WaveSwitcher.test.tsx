import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { DaySummary } from "@/lib/api/types";
import type { Wave } from "@/lib/waves";
import { WaveProvider } from "./WaveProvider";
import { WaveSwitcher } from "./WaveSwitcher";

/* The switcher takes its row from the wave registry — synthetic waves here, so a change of the
   real palette does not rewrite the chip tests. */
const { waves } = vi.hoisted(() => ({ waves: [] as Wave[] }));
vi.mock("@/lib/waves", () => ({ WAVES: waves }));

function setWaves(next: Wave[]) {
  waves.length = 0;
  waves.push(...next);
}

afterEach(() => {
  vi.clearAllMocks();
  document.cookie = "danchuo_wave=; max-age=0"; // cookie persists across tests in jsdom
});

function wave(over: Partial<Wave> = {}): Wave {
  return {
    key: "wave-01",
    name: "Волна 01",
    tokens: { "bg-page": "#faf1eb", accent: "#e2604c" },
    releasedAt: "2026-01-01",
    ...over,
  };
}

/** A day summary for the ribbon of lived days (only the fields the ribbon reads). */
function summary(date: string, over: Partial<DaySummary> = {}): DaySummary {
  return {
    date,
    title: null,
    hasData: true,
    steps: null,
    sleepMinutes: null,
    contributions: null,
    monsterDrunk: null,
    ...over,
  } as DaySummary;
}

/** The switcher lives inside the wave context — wrap it in a provider with an active wave. */
function withWave(node: ReactNode) {
  return <WaveProvider initialWave={wave()}>{node}</WaveProvider>;
}

describe("WaveSwitcher", () => {
  it("рендерит только свотчи выпущенных волн, без слотов-заглушек", async () => {
    setWaves([wave()]);
    render(withWave(<WaveSwitcher />));
    expect(await screen.findByLabelText("Волна: Волна 01")).toBeInTheDocument();
    // exactly one element per wave — no placeholders for future waves
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("клик по свотчу свопит токены в :root", async () => {
    const setProp = vi.spyOn(document.documentElement.style, "setProperty");
    setWaves([
      wave(),
      wave({ key: "wave-02", name: "Волна 02", tokens: { "bg-page": "#101010", accent: "#33ff99" } }),
    ]);
    render(withWave(<WaveSwitcher />));

    const second = await screen.findByLabelText("Волна: Волна 02");
    fireEvent.click(second);

    await waitFor(() => expect(setProp).toHaveBeenCalledWith("--bg-page", "#101010"));
    expect(setProp).toHaveBeenCalledWith("--accent", "#33ff99");
  });

  it("клик по свотчу запоминает волну в cookie (переживает перезагрузку)", async () => {
    setWaves([
      wave(),
      wave({ key: "wave-02", name: "Волна 02" }),
    ]);
    render(withWave(<WaveSwitcher />));

    fireEvent.click(await screen.findByLabelText("Волна: Волна 02"));

    await waitFor(() => expect(document.cookie).toContain("danchuo_wave=wave-02"));
  });

  // Waves travel with the frontend, so a chip row cannot depend on the backend being up: the
  // switcher renders without a single request. Previously the list arrived over the network and
  // the component carried a self-heal for a degraded SSR.
  it("рисует чипы, не ходя в сеть", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    setWaves([wave(), wave({ key: "wave-02", name: "Волна 02" })]);
    render(withWave(<WaveSwitcher />));

    expect(await screen.findByLabelText("Волна: Волна 02")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  // ── A chip is a mini tile of ITS OWN wave (DESIGN §2.6) ────────────────────────────
  // It is drawn in the palette and edge of the wave it offers, not the active one, so the colours
  // travel as inline --chip-* variables from that wave's tokens and its key hangs as an attribute.
  it("рисует чип палитрой своей волны, а не активной", async () => {
    setWaves([
      wave(),
      wave({
        key: "wave-02",
        name: "Волна 02",
        tokens: { "bg-page": "#e3f1fe", accent: "#ff5e24", "border-tile": "#9dc3e6" },
      }),
    ]);
    render(withWave(<WaveSwitcher />));

    const second = await screen.findByLabelText("Волна: Волна 02");
    expect(second.style.getPropertyValue("--chip-bg")).toBe("#e3f1fe");
    expect(second.style.getPropertyValue("--chip-accent")).toBe("#ff5e24");
    expect(second.style.getPropertyValue("--chip-line")).toBe("#9dc3e6");
    // the wave key is the skin's hook: wave 02 draws its own chip round while lying on board 01
    expect(second).toHaveAttribute("data-chip-wave", "wave-02");
  });

  // A chip's edge silhouette is NOT the tile's `pixel-corners` token: that is set in absolute px
  // for a large card and degenerates into a cross at chip scale (see the note in common.css).
  // CSS draws the step at thumbnail scale; a wave may send its own as a separate token.
  it("не тащит на чип полигон плитки, но уважает собственный токен чипа", async () => {
    setWaves([
      wave({ tokens: { "pixel-corners": "polygon(0 10px)" } }),
      wave({ key: "wave-02", name: "Волна 02", tokens: { "chip-corners": "polygon(0 0)" } }),
    ]);
    render(withWave(<WaveSwitcher />));

    const first = await screen.findByLabelText("Волна: Волна 01");
    expect(first.style.getPropertyValue("--chip-corners")).toBe("");
    expect(screen.getByLabelText("Волна: Волна 02").style.getPropertyValue("--chip-corners")).toBe(
      "polygon(0 0)",
    );
  });

  // A wave missing some tokens (or a newcomer with a trimmed set) must not tear the chip — what
  // is missing is picked up from the board's tokens.
  it("не падает на волне с неполным набором токенов", async () => {
    setWaves([wave({ tokens: {} })]);
    render(withWave(<WaveSwitcher />));

    const chip = await screen.findByLabelText("Волна: Волна 01");
    expect(chip.style.getPropertyValue("--chip-bg")).toBe("var(--bg-surface-muted)");
  });

  // The active wave reads by more than a frame: the chip is raised on its box (wave 01's idiom).
  it("помечает активный чип для скина и скринридера", async () => {
    setWaves([
      wave(),
      wave({ key: "wave-02", name: "Волна 02" }),
    ]);
    render(withWave(<WaveSwitcher />));

    const first = await screen.findByLabelText("Волна: Волна 01");
    const second = screen.getByLabelText("Волна: Волна 02");
    expect(first).toHaveAttribute("data-active", "true");
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(second).toHaveAttribute("data-active", "false");
  });

  // The row's direction is a layout capability (as for projects, photoDrops and marquee): the wave
  // sets it in the layout and the component does not decide for itself. The default is horizontal.
  it("кладёт чипы в ряд по умолчанию и в столбец по ориентации волны", async () => {
    setWaves([wave()]);
    const { rerender } = render(withWave(<WaveSwitcher />));
    const row = (await screen.findByLabelText("Волна: Волна 01")).parentElement!;
    expect(row.className).toContain("flex-row");
    expect(row.className).not.toContain("flex-col");

    rerender(withWave(<WaveSwitcher orientation="vertical" />));
    await waitFor(() =>
      expect(screen.getByLabelText("Волна: Волна 01").parentElement!.className).toContain(
        "flex-col",
      ),
    );
  });

  // Zoom shrinks the CSS viewport while the §8.1 damper shrinks a chip half as fast, so at 110%
  // two chips stop fitting. Wrapping is not the answer: a horizontal row must stay a row and the
  // chips squeeze.
  it("не переносит чипы на вторую строку в горизонтальном ряду", async () => {
    setWaves([
      wave(),
      wave({ key: "wave-02", name: "Волна 02" }),
    ]);
    render(withWave(<WaveSwitcher />));

    const row = (await screen.findByLabelText("Волна: Волна 01")).parentElement!;
    expect(row.className).toContain("flex-nowrap");
  });

  it("не пишет cookie, пока посетитель не выбрал волну", async () => {
    setWaves([wave(), wave({ key: "wave-02", name: "Волна 02" })]);
    render(withWave(<WaveSwitcher />));

    await screen.findByLabelText("Волна: Волна 01");
    expect(document.cookie).not.toContain("danchuo_wave");
  });
  // ── The card's material: the ribbon of lived days (DESIGN §2.6, §10.2) ─────────────
  // A wave card shows not an emblem but A PIECE OF ITS OWN CANVAS, and one wave's canvas is the
  // data itself. So the switcher carries the same seam as the board's backdrop, off by default.
  it("кладёт в карту ленту прожитых дней", async () => {
    setWaves([wave()]);
    const { container } = render(
      withWave(
        <WaveSwitcher
          summaries={[summary("2026-06-20", { title: "тихий день", steps: 8340 })]}
          today="2026-06-21"
        />,
      ),
    );
    await screen.findByLabelText("Волна: Волна 01");

    const ribbon = container.querySelector(".wave-chip__ribbon");
    expect(ribbon).not.toBeNull();
    expect(ribbon!.textContent).toContain("тихий день");
    expect(ribbon!.textContent).toContain("шаги");
  });

  // The ribbon is material, not a label: it is not read aloud and does not affect the choice.
  it("прячет ленту от скринридера", async () => {
    setWaves([wave()]);
    const { container } = render(
      withWave(<WaveSwitcher summaries={[summary("2026-06-20", { steps: 1 })]} today="2026-06-21" />),
    );
    await screen.findByLabelText("Волна: Волна 01");

    expect(container.querySelector(".wave-chip__ribbon")).toHaveAttribute("aria-hidden", "true");
  });

  // With no data yet (the board is loading) or a wave that draws no backdrop, the card must stay a
  // whole surface rather than an empty layer with padding. The same trade as WaveBackdrop's.
  it("не рисует слой ленты, когда борду нечего сказать", async () => {
    setWaves([wave()]);
    const { container } = render(withWave(<WaveSwitcher />));
    await screen.findByLabelText("Волна: Волна 01");

    expect(container.querySelector(".wave-chip__ribbon")).toBeNull();
  });

  // Future days do not reach the ribbon (the same "today" anchor as the board's canvas): an
  // unlived day would print on equal terms with a lived one.
  it("не пускает в ленту дни после сегодня", async () => {
    setWaves([wave()]);
    const { container } = render(
      withWave(
        <WaveSwitcher
          summaries={[
            summary("2026-06-21", { title: "прожитый" }),
            summary("2026-06-22", { title: "завтрашний" }),
          ]}
          today="2026-06-21"
        />,
      ),
    );
    await screen.findByLabelText("Волна: Волна 01");

    const ribbon = container.querySelector(".wave-chip__ribbon")!;
    expect(ribbon.textContent).toContain("прожитый");
    expect(ribbon.textContent).not.toContain("завтрашний");
  });
});
