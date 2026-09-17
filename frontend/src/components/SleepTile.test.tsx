import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DayView, SleepNightView } from "@/lib/api/types";

vi.mock("@/lib/api/client", () => ({ getSleepNight: vi.fn() }));

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
    workouts: [],
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

describe("SleepTile — ночь как она была (I-23)", () => {
  it("по умолчанию показывает сумму и за полосой не ходит", () => {
    render(<SleepTile day={day()} state="loaded" />);

    expect(screen.getByText("7ч 40м")).toBeInTheDocument();
    expect(getSleepNightMock).not.toHaveBeenCalled();
  });

  it("по переключателю показывает полосу ночи и запрашивает её один раз", async () => {
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

  it("переключатель не помечен мета-подписью — скин волны прячет их целиком", async () => {
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

  it("во сколько лёг и встал — в шапке, а не отдельной строкой под полосой", async () => {
    getSleepNightMock.mockResolvedValue(night);
    render(<SleepTile day={day()} state="loaded" />);
    await openBand();

    // One caption, "23:20–07:20": the tile's vertical space goes to the band, not to text.
    await waitFor(() => expect(screen.getByText("23:20–07:20")).toBeInTheDocument());
  });

  it("подписывает дорожки фаз — они же и есть вечная легенда", async () => {
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

  it("кладёт фазу на свою дорожку: глубокий сон ниже, чем пробуждение", async () => {
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

  it("сравнения со средней ночью не показывает — среднее уже есть в «активности»", async () => {
    getSleepNightMock.mockResolvedValue(night);
    render(<SleepTile day={day()} state="loaded" />);
    await openBand();

    const band = await screen.findByTestId("night-band");
    // The usual window is drawn as a stripe and labelled with one word: no clock figures beside it.
    expect(within(band).queryByText(/обычно\s*\d/i)).not.toBeInTheDocument();
    expect(within(band).queryByText(/\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}/)).not.toBeInTheDocument();
  });

  it("ночь без сохранённых кусков показывает ту же пустоту, что и день без сна", async () => {
    getSleepNightMock.mockResolvedValue({ ...night, band: null });
    render(<SleepTile day={day()} state="loaded" />);
    await openBand();

    // To a viewer this is the same "nothing to show", so one picture serves both.
    await waitFor(() =>
      expect(screen.getByTestId("sleep-empty")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("sleep-moon")).toBeInTheDocument();
    expect(screen.queryByText("нет данных о сне")).not.toBeInTheDocument();
    expect(screen.queryByText(/не записана по минутам/i)).not.toBeInTheDocument();
  });

  it("не повторяет в шапке, какой день выбран — это уже сказано в «Сегодня»", () => {
    render(<SleepTile day={day({ date: "2026-07-21" })} state="loaded" />);

    // The chosen day is shared by the board: its caption lives in the day tile and the calendar,
    // not in every tile.
    expect(screen.queryByText(/сегодня|вчера|позавчера|^в (прошл|следующ)|назад$/i)).not.toBeInTheDocument();
  });

  it("возврат к сумме не требует нового запроса", async () => {
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

  it("день без сна переключателя не предлагает — разворачивать нечего", () => {
    render(
      <SleepTile
        day={day({
          health: { steps: 100, sleepMinutes: null, sleepStages: null },
        })}
        state="loaded"
      />,
    );

    expect(screen.getByTestId("sleep-empty")).toBeInTheDocument();
    expect(screen.getByTestId("sleep-moon")).toBeInTheDocument();
    expect(screen.queryByText("нет данных о сне")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /по часам/i }),
    ).not.toBeInTheDocument();
  });
});

describe("SleepTile — подсказки к фазам сна", () => {
  it("у каждой подписи фазы своя подсказка волны, а не нативный title", async () => {
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
