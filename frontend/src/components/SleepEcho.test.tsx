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

    // Не по столбу на минуту: минута на этой плитке тоньше пикселя (см. [soundingGeometry]).
    expect(columns()).toHaveLength(64);
    // Сумма — состояние по умолчанию, как и в дефолтной вёрстке виджета: все бруски
    // переставлены трансформом на свои горизонты.
    expect(sorted()).toHaveLength(64);
    expect(screen.getByRole("button", { pressed: false })).toBeInTheDocument();
  });

  it("переключает режим кликом по ВСЕЙ плитке, а не ссылкой в углу", async () => {
    getSleepNightMock.mockResolvedValue(night("2026-08-02"));
    await mount("2026-08-02");

    const tile = screen.getByRole("button", { pressed: false });
    await userEvent.click(tile);

    expect(screen.getByRole("button", { pressed: true })).toBe(tile);
    // В хронологии брусок стоит на своём месте в ночи — трансформа на нём нет вовсе.
    expect(sorted()).toHaveLength(0);
  });

  it("смена режима — пересортировка тех же минут, а не подмена картинки", async () => {
    getSleepNightMock.mockResolvedValue(night("2026-08-03"));
    await mount("2026-08-03");
    const before = columns().length;

    await userEvent.click(screen.getByRole("button", { pressed: false }));

    // Число брусков совпадает по построению — именно поэтому площадь цвета не может соврать.
    expect(columns()).toHaveLength(before);
  });

  it("подписью работает сама ночь: ни ярлыка «сон», ни отдельной легенды", async () => {
    getSleepNightMock.mockResolvedValue(night("2026-08-04"));
    await mount("2026-08-04");

    expect(screen.queryByText("сон")).not.toBeInTheDocument();
    expect(screen.queryByTestId("night-legend")).not.toBeInTheDocument();
    // Доли фаз и есть легенда — цвет подписи совпадает с цветом горизонта.
    expect(screen.getByText(/REM/)).toBeInTheDocument();
    expect(screen.getByText(/CORE/)).toBeInTheDocument();
    expect(screen.getByText(/DEEP/)).toBeInTheDocument();
  });

  it("показывает длительность ночи и когда она началась и кончилась", async () => {
    getSleepNightMock.mockResolvedValue(night("2026-08-05"));
    await mount("2026-08-05");

    expect(screen.getByText("1 ч 50 мин")).toBeInTheDocument();
    expect(screen.getByText("23:00 → 01:00")).toBeInTheDocument();
    // Пробуждения — четвёртый пункт легенды, а не сноска в углу: верхний горизонт нарисован
    // и обязан быть назван, как три остальных.
    expect(screen.getByText("не спал 10м")).toHaveClass("sleep-echo__phase");
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

    // Фазы из итогов дня нарисовать можно, а хронологию — нет: переключатель пропадает вместе
    // с режимом, который ему нечем показать.
    expect(columns()).toHaveLength(64);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sleep-echo-modes")).not.toBeInTheDocument();
  });

  it("сбой запроса ночи не гасит плитку — сумма приезжает из итогов дня", async () => {
    getSleepNightMock.mockRejectedValue(new Error("offline"));
    await mount("2026-08-07");

    expect(columns()).toHaveLength(64);
    expect(screen.getByText("1 ч 50 мин")).toBeInTheDocument();
    expect(screen.queryByTestId("sleep-empty")).not.toBeInTheDocument();
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

  it("незнакомая редакция откатывается к дефолтной вёрстке, а не ломает плитку", () => {
    render(<SleepTile day={day("2026-08-09")} state="loaded" edition="sonar" />);

    expect(screen.queryAllByTestId("sleep-echo-col")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /по часам/i })).toBeInTheDocument();
  });
});
