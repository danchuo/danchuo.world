import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DayView, SleepNightView } from "@/lib/api/types";

vi.mock("@/lib/api/client", () => ({ getSleepNight: vi.fn() }));
// The Moon of the empty night is a real body; the scene behind it is a browser thing, tested apart.
vi.mock("@/lib/artifact3dStage", () => ({ mountArtifact: vi.fn() }));
import { mountArtifact } from "@/lib/artifact3dStage";

import { getSleepNight } from "@/lib/api/client";
import { SleepTile } from "./SleepTile";

const getSleepNightMock = vi.mocked(getSleepNight);

afterEach(() => vi.clearAllMocks());

const day = (over: Partial<DayView> = {}): DayView =>
  ({
    date: "2026-07-28",
    title: null,
    hasData: true,
    health: {
      steps: 8000,
      sleepMinutes: 460,
      sleepStages: { rem: 60, deep: 110, light: 290, awake: 20 },
    },
    discipline: [],
    monsterDrunk: null,
    monsterCleanStreak: 0,
    ...over,
  }) as DayView;

const night: SleepNightView = {
  date: "2026-07-28",
  axisStartHour: 18,
  band: {
    onsetMinute: 320,
    wakeMinute: 800,
    asleepMinutes: 460,
    asleepFromMinute: 320,
    parts: [
      { stage: "light", fromMinute: 320, toMinute: 440 },
      { stage: "deep", fromMinute: 440, toMinute: 720 },
      { stage: "awake", fromMinute: 720, toMinute: 740 },
      { stage: "rem", fromMinute: 740, toMinute: 800 },
    ],
  },
};

/** Switch the tile into band mode. */
async function openBand() {
  await userEvent.click(screen.getByRole("button", { name: /по часам/i }));
}

describe("SleepTile — the night as it was (I-23)", () => {
  it("by default shows the sum and does not fetch the bar", () => {
    render(<SleepTile day={day()} state="loaded" />);

    expect(screen.getByText("7ч 40м")).toBeInTheDocument();
    expect(getSleepNightMock).not.toHaveBeenCalled();
  });

  it("the switcher shows the night bar and requests it once", async () => {
    getSleepNightMock.mockResolvedValue(night);
    render(<SleepTile day={day()} state="loaded" />);

    await openBand();

    await waitFor(() =>
      expect(screen.getByTestId("night-band")).toBeInTheDocument(),
    );
    expect(getSleepNightMock).toHaveBeenCalledWith(
      "2026-07-28",
      expect.anything(),
    );
    // Four chunks of the night, the waking included — it is part of the night, not a hole
    expect(screen.getAllByTestId("night-band-part")).toHaveLength(4);
  });

  it("the switcher carries no meta caption — the wave's skin hides those entirely", async () => {
    getSleepNightMock.mockResolvedValue(night);
    render(<SleepTile day={day()} state="loaded" />);

    // A wave may hide `.tile-label` (that is the wave's parameter). Controls and figures are not
    // labels: caught in that class, the switcher vanished from the board along with them.
    const toggle = screen.getByRole("button", { name: /по часам/i });
    expect(toggle).not.toHaveClass("tile-label");

    await openBand();
    await waitFor(() => expect(screen.getByText("23:20–07:20")).toBeInTheDocument());
    expect(screen.getByText("23:20–07:20")).not.toHaveClass("tile-label");
  });

  it("bedtime and wake time are in the header, not a separate line under the bar", async () => {
    getSleepNightMock.mockResolvedValue(night);
    render(<SleepTile day={day()} state="loaded" />);
    await openBand();

    // One caption, "23:20–07:20": the tile's vertical space goes to the band, not to text.
    await waitFor(() => expect(screen.getByText("23:20–07:20")).toBeInTheDocument());
  });

  it("labels the phase lanes — they are the permanent legend", async () => {
    getSleepNightMock.mockResolvedValue(night);
    render(<SleepTile day={day()} state="loaded" />);
    await openBand();

    const band = await screen.findByTestId("night-band");
    // A lane's label matches Apple Health's naming (Core), not the common "light".
    ["не спал", "REM", "базовый", "глубокий"].forEach((label) => {
      expect(within(band).getByText(label)).toBeInTheDocument();
    });
    expect(within(band).queryByText("лёгкий")).not.toBeInTheDocument();
    // There is no separate legend row any more: its height went to the chart.
    expect(screen.queryByTestId("night-legend")).not.toBeInTheDocument();
  });

  it("puts a phase on its own lane: deep sleep lower than waking", async () => {
    getSleepNightMock.mockResolvedValue(night);
    render(<SleepTile day={day()} state="loaded" />);
    await openBand();

    const parts = await screen.findAllByTestId("night-band-part");
    // A chunk's top is set as `calc(25% + 2px)` — take the fraction; the lane gap does not matter.
    const top = (i: number) => Number(/top:\s*calc\((-?[\d.]+)%/.exec(parts[i].getAttribute("style")!)![1]);
    // The fixture's chunk order: light, deep, awake, rem.
    expect(top(2)).toBeLessThan(top(3)); // awake sits above REM
    expect(top(3)).toBeLessThan(top(0)); // REM above the base
    expect(top(0)).toBeLessThan(top(1)); // the base above deep
  });

  it("no comparison with the average night — the average is already in \"activity\"", async () => {
    getSleepNightMock.mockResolvedValue(night);
    render(<SleepTile day={day()} state="loaded" />);
    await openBand();

    const band = await screen.findByTestId("night-band");
    // The usual window is drawn as a stripe and labelled with one word: no clock figures beside it.
    expect(within(band).queryByText(/обычно\s*\d/i)).not.toBeInTheDocument();
    expect(within(band).queryByText(/\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}/)).not.toBeInTheDocument();
  });

  it("a night without saved chunks shows the same emptiness as a day without sleep", async () => {
    getSleepNightMock.mockResolvedValue({ ...night, band: null });
    render(<SleepTile day={day()} state="loaded" />);
    await openBand();

    // To a viewer this is the same "nothing to show", so one picture serves both.
    await waitFor(() =>
      expect(screen.getByTestId("sleep-empty")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("sleep-moon")).toBeInTheDocument();
    expect(screen.queryByTestId("sleep-moon-photo")).not.toBeInTheDocument();
    expect(screen.queryByText("нет данных о сне")).not.toBeInTheDocument();
    expect(screen.queryByText(/не записана по минутам/i)).not.toBeInTheDocument();
  });

  it("does not repeat in the header which day is selected — \"today\" already says so", () => {
    render(<SleepTile day={day({ date: "2026-07-21" })} state="loaded" />);

    // The chosen day is shared by the board: its caption lives in the day tile and the calendar,
    // not in every tile.
    expect(screen.queryByText(/сегодня|вчера|позавчера|^в (прошл|следующ)|назад$/i)).not.toBeInTheDocument();
  });

  it("returning to the sum needs no new request", async () => {
    getSleepNightMock.mockResolvedValue(night);
    render(<SleepTile day={day()} state="loaded" />);
    await openBand();
    await waitFor(() =>
      expect(screen.getByTestId("night-band")).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: /сумма/i }));
    expect(screen.getByText("7ч 40м")).toBeInTheDocument();
    expect(screen.queryByTestId("night-band")).not.toBeInTheDocument();
  });

  it("a day without sleep offers no switcher — there is nothing to unfold", () => {
    render(
      <SleepTile
        day={day({
          health: { steps: 100, sleepMinutes: null, sleepStages: null },
        })}
        state="loaded"
      />,
    );

    expect(screen.getByTestId("sleep-empty")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /по часам/i }),
    ).not.toBeInTheDocument();
  });

  it("an empty night in the default edition — a bed with a caption, not the moon", () => {
    // The moon is the `echo` edition's mark: a wave dresses the tile through its edition, and one
    // edition's sign must not turn up in another's (DESIGN §7.7, §10.1).
    render(
      <SleepTile
        day={day({ health: { steps: 100, sleepMinutes: null, sleepStages: null } })}
        state="loaded"
      />,
    );

    expect(screen.getByText("нет данных о сне")).toBeInTheDocument();
    expect(screen.queryByTestId("sleep-moon")).not.toBeInTheDocument();
  });

  it("an empty night in the \"echo sounder\" edition — a 3D moon, no bed and no words", () => {
    vi.mocked(mountArtifact).mockResolvedValue({
      setSpinning: vi.fn(), turn: vi.fn(), setLight: vi.fn(), resize: vi.fn(), dispose: vi.fn(),
    });
    render(
      <SleepTile
        day={day({ health: { steps: 100, sleepMinutes: null, sleepStages: null } })}
        state="loaded"
        edition="echo"
      />,
    );

    expect(screen.getByTestId("sleep-moon-model")).toBeInTheDocument();
    expect(screen.queryByTestId("sleep-moon")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Сон")).toHaveClass("sleep-card--empty");
    expect(screen.queryByText("нет данных о сне")).not.toBeInTheDocument();
  });

  it("between empty days it turns the light without rebuilding the moon", async () => {
    const artifact = {
      setSpinning: vi.fn(), turn: vi.fn(), setLight: vi.fn(), resize: vi.fn(), dispose: vi.fn(),
    };
    vi.mocked(mountArtifact).mockResolvedValue(artifact);
    const empty = { steps: 100, sleepMinutes: null, sleepStages: null };
    const { rerender } = render(
      <SleepTile day={day({ date: "2026-07-28", health: empty })} state="loaded" edition="echo" />,
    );
    await waitFor(() => expect(mountArtifact).toHaveBeenCalledTimes(1));

    rerender(<SleepTile day={day({ date: "2026-07-29", health: empty })} state="loaded" edition="echo" />);

    expect(mountArtifact).toHaveBeenCalledTimes(1);
    expect(artifact.dispose).not.toHaveBeenCalled();
    expect(artifact.setLight).toHaveBeenCalled();
  });

  it("the scene did not come up — the photo stays in the moon's place, not a hole", async () => {
    vi.mocked(mountArtifact).mockRejectedValue(new Error("нет WebGL"));
    render(
      <SleepTile
        day={day({ health: { steps: 100, sleepMinutes: null, sleepStages: null } })}
        state="loaded"
        edition="echo"
      />,
    );

    expect(await screen.findByTestId("sleep-moon-photo")).toBeInTheDocument();
  });
});

describe("SleepTile — sleep phase hints", () => {
  it("each phase caption has its own wave hint, not a native title", async () => {
    // "REM/DEEP/CORE" mean nothing to someone who never looked into sleep phases, and the minutes
    // and share beside them answer a different question. The hint is the same HoverTip as the
    // streak flame's and the life-day number's: one hint language across the board (§7.7).
    render(
      <SleepTile
        day={day()}
        state="loaded"
      />,
    );

    const tips = screen.getAllByRole("tooltip");
    expect(tips).toHaveLength(3);
    for (const t of tips) {
      expect(t.textContent!.length).toBeGreaterThan(0);
      expect(t.className).toContain("hover-tip--phrase");
      // THE POINT: the hint lives OUTSIDE the tile. A tile clips its content, and while the hint
      // was its child a long text had no visible end — first below, then to the right. Tuning its
      // width and direction to the edges is futile: there is always another edge.
      expect(t.closest(".pixel-tile")).toBeNull();
    }
    expect(new Set(tips.map((t) => t.textContent)).size).toBe(3);
  });
});
