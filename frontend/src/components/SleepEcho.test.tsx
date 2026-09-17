import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DayView, SleepNightView } from "@/lib/api/types";

vi.mock("@/lib/api/client", () => ({ getSleepNight: vi.fn() }));

import { getSleepNight } from "@/lib/api/client";
import { SleepTile } from "./SleepTile";

const getSleepNightMock = vi.mocked(getSleepNight);

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

const day = (date: string, over: Partial<DayView["health"]> = {}): DayView =>
  ({
    date,
    title: null,
    hasData: true,
    health: {
      steps: 8000,
      sleepMinutes: 110,
      sleepStages: { rem: 20, deep: 30, light: 60, awake: 10 },
      ...over,
    },
    workouts: [],
    discipline: [],
    monsterDrunk: null,
    monsterCleanStreak: 0,
  }) as DayView;

const night = (date: string): SleepNightView => ({
  date,
  axisStartHour: 18,
  band: {
    onsetMinute: 300,
    wakeMinute: 420,
    asleepMinutes: 110,
    asleepFromMinute: 310,
    parts: [
      { stage: "awake", fromMinute: 300, toMinute: 310 },
      { stage: "light", fromMinute: 310, toMinute: 350 },
      { stage: "deep", fromMinute: 350, toMinute: 380 },
      { stage: "rem", fromMinute: 380, toMinute: 400 },
      { stage: "light", fromMinute: 400, toMinute: 420 },
    ],
  },
});

async function mount(date: string) {
  render(<SleepTile day={day(date)} state="loaded" edition="echo" />);
  await waitFor(() => expect(screen.getAllByTestId("sleep-echo-col").length).toBeGreaterThan(0));
}

const columns = () => screen.getAllByTestId("sleep-echo-col");
const sorted = () => columns().filter((c) => c.getAttribute("style")?.includes("translateX"));

describe("SleepTile — редакция «эхолот»", () => {
  it("сводит ночь к кладке брусков и открывается суммой", async () => {
    getSleepNightMock.mockResolvedValue(night("2026-08-01"));
    await mount("2026-08-01");

    // Not one bar per minute: a minute on this tile is thinner than a pixel (see [soundingGeometry]).
    expect(columns()).toHaveLength(64);
    // The sum is the default state: every bar is moved onto its horizon by a transform.
    expect(sorted()).toHaveLength(64);
    expect(screen.getByRole("button", { pressed: false })).toBeInTheDocument();
  });

  it("переключает режим кликом по ВСЕЙ плитке, а не ссылкой в углу", async () => {
    getSleepNightMock.mockResolvedValue(night("2026-08-02"));
    await mount("2026-08-02");

    const tile = screen.getByRole("button", { pressed: false });
    await userEvent.click(tile);

    expect(screen.getByRole("button", { pressed: true })).toBe(tile);
    // In the chronology a bar stands at its place in the night — it carries no transform at all.
    expect(sorted()).toHaveLength(0);
  });

  it("смена режима — пересортировка тех же минут, а не подмена картинки", async () => {
    getSleepNightMock.mockResolvedValue(night("2026-08-03"));
    await mount("2026-08-03");
    const before = columns().length;

    await userEvent.click(screen.getByRole("button", { pressed: false }));

    // The bar count matches by construction, which is why the area of colour cannot lie.
    expect(columns()).toHaveLength(before);
  });

  it("подписью работает сама ночь: ни ярлыка «сон», ни отдельной легенды", async () => {
    getSleepNightMock.mockResolvedValue(night("2026-08-04"));
    await mount("2026-08-04");

    expect(screen.queryByText("сон")).not.toBeInTheDocument();
    expect(screen.queryByTestId("night-legend")).not.toBeInTheDocument();
    // A phase's name stands at its row's right edge and is called what the chronology legend calls
    // it: diverging, they would name one horizon differently in two modes.
    expect(screen.getByTestId("sleep-name-rem")).toHaveTextContent("REM");
    expect(screen.getByTestId("sleep-name-light")).toHaveTextContent("CORE");
    expect(screen.getByTestId("sleep-name-deep")).toHaveTextContent("DEEP");
    expect(screen.getByTestId("sleep-name-awake")).toHaveTextContent("не спал");
  });

  it("в сумме нет ни долей, ни рамки ночи — они приходят с хронологией", async () => {
    getSleepNightMock.mockResolvedValue(night("2026-08-05"));
    await mount("2026-08-05");

    expect(document.querySelector(".sleep-echo__total")).toHaveTextContent("1 час 50 минут");
    // The sum has no time axis and nothing to name its ends with: the night's frame leaves the tile.
    expect(screen.queryByText("23:00")).not.toBeInTheDocument();
    expect(screen.queryByText("01:00")).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();

    const tile = screen.getByRole("button", { pressed: false });
    await userEvent.click(tile);

    // In the chronology the row labels are gone: the line is freed for the shares alone, while the
    // night's ends name the axis ON the drawing, in its top corners.
    expect(screen.getByText("23:00")).toHaveClass("sleep-echo__edge");
    expect(screen.getByText("01:00")).toHaveClass("sleep-echo__edge");
    expect(screen.queryByText("23:00 → 01:00")).not.toBeInTheDocument();
    expect(screen.getByText("23:00").closest(".sleep-echo__plot")).not.toBeNull();
    expect(screen.getByText("01:00").closest(".sleep-echo__phases")).toBeNull();
    expect(screen.getAllByText(/%$/).map((n) => n.textContent)).toEqual([
      "REM 18%",
      "CORE 55%",
      "DEEP 27%",
    ]);
    expect(screen.getByText("не спал 10м")).toHaveClass("sleep-echo__phase");
    // The sum names the top horizon — there its name stands right by the row.
    expect(screen.getByTestId("sleep-name-awake")).toHaveTextContent("не спал");
  });

  it("полоса начинается луной этой ночи, а кончается переключателем", async () => {
    getSleepNightMock.mockResolvedValue(night("2024-01-18"));
    await mount("2024-01-18");

    // The subject's sign and the switcher stand on ONE line with the duration: the sign left, the
    // pair of thumbnails right, that is in the tile's bottom corner. No corners are assigned to
    // them — they take room from the strip, not the drawing, and cannot reach the row labels.
    const head = document.querySelector(".sleep-echo__head")!;
    expect(head.firstElementChild).toHaveClass("sleep-echo__moon");
    expect(head.lastElementChild).toHaveClass("sleep-echo__modes");
    // The phase is real, from the date. The lit edge is always a semicircle of the sign's radius,
    // while the terminator is an ellipse whose semi-axis follows the disc's projection onto the
    // light: at a quarter it is nearly zero, so the disc is split by almost a straight line.
    const lit = head.querySelector(".sleep-echo__moon-lit")!;
    const terminator = lit.getAttribute("d")!.match(/^M 0 -6 A 6 6 0 0 1 0 6 A ([\d.]+) 6 0 0 0 0 -6 Z$/);
    expect(terminator).not.toBeNull();
    expect(Number(terminator![1])).toBeLessThan(1.5);
    // A waxing moon is drawn unmirrored: the disc's right edge is lit.
    expect(head.querySelector(".sleep-echo__moon-body")).not.toHaveAttribute("transform");
    // Shading, maria and the limb are the sign's other layers; paint comes from gradients whose ids
    // must be unique per instance, so each layer points at THIS copy's defs.
    const mare = head.querySelector(".sleep-echo__moon-mare")!;
    const clip = mare.getAttribute("clip-path")!.replace(/^url\(#/, "").replace(/\)$/, "");
    expect(head.querySelector(`#${clip}`)).not.toBeNull();
    expect(head.querySelector(".sleep-echo__moon-limb")).not.toBeNull();
  });

  it("убывающую луну рисует тот же контур в зеркале", async () => {
    getSleepNightMock.mockResolvedValue(night("2024-02-02"));
    await mount("2024-02-02");

    // The whole BODY mirrors, not the outline alone: shading and maria have to travel with the light.
    expect(document.querySelector(".sleep-echo__moon-body")).toHaveAttribute("transform", "scale(-1 1)");
    expect(document.querySelector(".sleep-echo__moon-lit")).not.toHaveAttribute("transform");
  });

  it("переключатель показывает оба режима миниатюрами, а не называет их словами", async () => {
    getSleepNightMock.mockResolvedValue(night("2026-08-10"));
    await mount("2026-08-10");

    expect(screen.getByTestId("sleep-echo-modes")).toBeInTheDocument();
    expect(screen.queryByText("сумма")).not.toBeInTheDocument();
    expect(screen.queryByText("по часам")).not.toBeInTheDocument();
  });

  it("ночь без сохранённых кусков остаётся суммой и жестом не притворяется", async () => {
    getSleepNightMock.mockResolvedValue({ date: "2026-08-06", axisStartHour: 18, band: null });
    await mount("2026-08-06");

    // Phases from the day's totals can be drawn, a chronology cannot: the switcher disappears with
    // the mode it has nothing to show.
    expect(columns()).toHaveLength(64);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sleep-echo-modes")).not.toBeInTheDocument();
  });

  it("показывает точные минуты каждой фазы и скрывает их в хронологии", async () => {
    getSleepNightMock.mockResolvedValue(night("2026-08-11"));
    await mount("2026-08-11");

    // The short format: the number stands between the row's end and the edge-pinned phase name,
    // and the full spelling ate that gap. The full one stays for the screen reader.
    expect(screen.getByTestId("sleep-duration-awake")).toHaveTextContent("10м");
    expect(screen.getByTestId("sleep-duration-rem")).toHaveTextContent("20м");
    expect(screen.getByTestId("sleep-duration-light")).toHaveTextContent("1ч");
    expect(screen.getByTestId("sleep-duration-deep")).toHaveTextContent("30м");
    expect(screen.getByTestId("sleep-duration-deep")).toHaveAttribute("aria-label", "DEEP: 30 мин");
    const labels = screen.getByTestId("sleep-echo-durations");
    expect(labels).toHaveAttribute("aria-hidden", "false");

    const tile = screen.getByRole("button", { pressed: false });
    tile.focus();
    await userEvent.keyboard("{Enter}");
    expect(tile).toHaveAttribute("aria-pressed", "true");
    expect(labels).toHaveAttribute("aria-hidden", "true");
    await userEvent.keyboard(" ");
    expect(tile).toHaveAttribute("aria-pressed", "false");
    expect(labels).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByTestId("sleep-duration-light")).toHaveTextContent("1ч");
  });

  it("две копии плитки в документе не делят градиенты", async () => {
    getSleepNightMock.mockResolvedValue(night("2026-08-13"));
    render(
      <>
        <SleepTile day={day("2026-08-13")} state="loaded" edition="echo" />
        <SleepTile day={day("2026-08-13")} state="loaded" edition="echo" />
      </>,
    );
    await waitFor(() => expect(columns()).toHaveLength(128));

    // The board keeps both layouts in the DOM at once, so the sleep tile always exists twice. The
    // paint must live in ITS OWN copy: with a shared id `url(#…)` resolves to the first match, in
    // the hidden layout, and the visible copy's bars are drawn with nothing (DESIGN §7.7).
    const svgs = Array.from(document.querySelectorAll("svg.sleep-echo__sounding"));
    expect(svgs).toHaveLength(2);
    const ids = svgs.map((svg) => {
      const fill = svg.querySelector(".sleep-echo__col")!.getAttribute("fill")!;
      const id = fill.replace(/^url\(#/, "").replace(/\)$/, "");
      expect(svg.querySelector(`#${id}`)).not.toBeNull();
      return id;
    });
    expect(new Set(ids).size).toBe(2);
  });

  it("без хронологии подписывает длительность из итогов и пропускает отсутствующие фазы", async () => {
    getSleepNightMock.mockResolvedValue({ date: "2026-08-12", axisStartHour: 18, band: null });
    render(<SleepTile day={day("2026-08-12", {
      sleepMinutes: 717,
      sleepStages: { light: 717, deep: 0, rem: null, awake: 0 },
    })} state="loaded" edition="echo" />);

    expect(await screen.findByTestId("sleep-duration-light")).toHaveTextContent("11ч 57м");
    expect(screen.queryByTestId("sleep-duration-awake")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sleep-duration-rem")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sleep-duration-deep")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("сбой запроса ночи не маскируется суммой без переключателя", async () => {
    getSleepNightMock.mockRejectedValue(new Error("offline"));
    render(<SleepTile day={day("2026-08-07")} state="loaded" edition="echo" />);

    expect(await screen.findByText("не удалось загрузить ночь")).toBeInTheDocument();
    expect(screen.queryByTestId("sleep-echo-durations")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "повторить" })).toBeInTheDocument();
  });

  it("день без сна за ночью не ходит вовсе", () => {
    render(
      <SleepTile
        day={day("2026-08-08", { sleepMinutes: null, sleepStages: null })}
        state="loaded"
        edition="echo"
      />,
    );

    expect(screen.getByTestId("sleep-empty")).toBeInTheDocument();
    expect(getSleepNightMock).not.toHaveBeenCalled();
  });

  it("до ответа сети не рисует ничего — ни мерцалки, ни промера из дневных итогов", async () => {
    let answer: (n: SleepNightView) => void = () => {};
    getSleepNightMock.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    const { container } = render(<SleepTile day={day("2026-08-10")} state="loaded" edition="echo" />);

    // The day's totals are already in hand and would draw a sounding at once — which the real
    // night then moves under a 720ms transition: figures first, picture catching up.
    expect(container.querySelector(".pixel-shimmer")).toBeNull();
    expect(screen.queryAllByTestId("sleep-echo-col")).toHaveLength(0);

    answer(night("2026-08-10"));
    await waitFor(() => expect(columns().length).toBeGreaterThan(0));
    // It arrives whole: the brickwork and the durations beside it, in one paint.
    expect(screen.getByTestId("sleep-echo-durations")).toBeInTheDocument();
  });

  it("режим «по часам» переживает переключение дня на календаре", async () => {
    getSleepNightMock.mockResolvedValueOnce(night("2026-08-06"));
    const { rerender } = render(<SleepTile day={day("2026-08-06")} state="loaded" edition="echo" />);
    await waitFor(() => expect(columns().length).toBeGreaterThan(0));

    await userEvent.click(screen.getByRole("button", { pressed: false }));
    expect(screen.getByRole("button", { pressed: true })).toBeInTheDocument();
    const graph = screen.getByRole("button", { pressed: true });
    const oldFrom = screen.getByText("23:00");

    let answer: (value: SleepNightView) => void = () => {};
    getSleepNightMock.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));

    rerender(<SleepTile day={day("2026-08-07")} state="loaded" edition="echo" />);
    await waitFor(() => expect(getSleepNightMock).toHaveBeenCalledTimes(2));

    // The finished graph stays mounted while the replacement travels: no blank frame and no replay
    // of the 720ms caption entrance merely because the calendar changed.
    expect(screen.getByRole("button", { pressed: true })).toBe(graph);
    expect(screen.getByText("23:00")).toBe(oldFrom);

    const next = night("2026-08-07");
    answer({ ...next, band: { ...next.band!, onsetMinute: 360, wakeMinute: 480 } });
    await screen.findByText("00:00");
    expect(screen.getByText("00:00")).toBe(oldFrom);
    expect(screen.getByText("02:00")).toBeInTheDocument();

    // The calendar changes the night, not the question asked of it.
    expect(sorted()).toHaveLength(0);
  });

  it("незнакомая редакция откатывается к дефолтной вёрстке, а не ломает плитку", () => {
    render(<SleepTile day={day("2026-08-09")} state="loaded" edition="sonar" />);

    expect(screen.queryAllByTestId("sleep-echo-col")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /по часам/i })).toBeInTheDocument();
  });
});
