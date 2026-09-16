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
    // Имя фазы стоит у правого края своего ряда и зовётся так же, как в легенде хронологии:
    // разойдясь, они назвали бы один горизонт в двух режимах по-разному.
    expect(screen.getByTestId("sleep-name-rem")).toHaveTextContent("REM");
    expect(screen.getByTestId("sleep-name-light")).toHaveTextContent("CORE");
    expect(screen.getByTestId("sleep-name-deep")).toHaveTextContent("DEEP");
    expect(screen.getByTestId("sleep-name-awake")).toHaveTextContent("не спал");
  });

  it("в сумме нет ни долей, ни рамки ночи — они приходят с хронологией", async () => {
    getSleepNightMock.mockResolvedValue(night("2026-08-05"));
    await mount("2026-08-05");

    expect(screen.getByText("1 ч 50 мин")).toBeInTheDocument();
    // Оси времени в сумме нет, и называть её концы нечем: рамка ночи уходит с плитки совсем.
    expect(screen.queryByText("23:00")).not.toBeInTheDocument();
    expect(screen.queryByText("01:00")).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();

    const tile = screen.getByRole("button", { pressed: false });
    await userEvent.click(tile);

    // В хронологии подписи с рядов ушли — строка освободилась под доли, а её концы называют
    // начало и конец ночи (стрелки между ними нет).
    expect(screen.getByText("23:00")).toHaveClass("sleep-echo__edge");
    expect(screen.getByText("01:00")).toHaveClass("sleep-echo__edge");
    expect(screen.queryByText("23:00 → 01:00")).not.toBeInTheDocument();
    // Долей ровно три, и «не спал» среди них нет: проценты считаются от сна, а пробуждения
    // не его часть. Минуты в этой строке были пунктом другой размерности и притом самым
    // длинным — из-за него строка переносилась и роняла конец ночи под легенду.
    expect(screen.getAllByText(/%$/).map((n) => n.textContent)).toEqual([
      "REM 18%",
      "CORE 55%",
      "DEEP 27%",
    ]);
    expect(screen.queryByText(/не спал \d/)).not.toBeInTheDocument();
    // Верхний горизонт называет сумма — там его имя стоит у самого ряда.
    expect(screen.getByTestId("sleep-name-awake")).toHaveTextContent("не спал");
  });

  it("полоса начинается луной этой ночи, а кончается переключателем", async () => {
    getSleepNightMock.mockResolvedValue(night("2024-01-18"));
    await mount("2024-01-18");

    // Знак предмета и переключатель стоят в ОДНОЙ строке с длительностью: слева знак, справа
    // пара миниатюр, то есть в нижнем углу плитки. Углы им при этом не назначены — место они
    // отнимают у полосы, а не у рисунка, и наехать на подписи рядов не могут.
    const head = document.querySelector(".sleep-echo__head")!;
    expect(head.firstElementChild).toHaveClass("sleep-echo__moon");
    expect(head.lastElementChild).toHaveClass("sleep-echo__modes");
    // Фаза настоящая, из даты (первая четверть 18 января 2024). Освещённый край — всегда
    // полуокружность радиуса знака, а терминатор — эллипс с полуосью по проекции круга
    // на свет: у четверти она почти нулевая, и диск делится почти прямой.
    const lit = head.querySelector(".sleep-echo__moon-lit")!;
    const terminator = lit.getAttribute("d")!.match(/^M 0 -6 A 6 6 0 0 1 0 6 A ([\d.]+) 6 0 0 0 0 -6 Z$/);
    expect(terminator).not.toBeNull();
    expect(Number(terminator![1])).toBeLessThan(1.5);
    // Растущая Луна рисуется без зеркала: освещён правый край диска.
    expect(lit).not.toHaveAttribute("transform");
  });

  it("убывающую луну рисует тот же контур в зеркале", async () => {
    getSleepNightMock.mockResolvedValue(night("2024-02-02"));
    await mount("2024-02-02");

    expect(document.querySelector(".sleep-echo__moon-lit")).toHaveAttribute("transform", "scale(-1 1)");
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

  it("показывает точные минуты каждой фазы и скрывает их в хронологии", async () => {
    getSleepNightMock.mockResolvedValue(night("2026-08-11"));
    await mount("2026-08-11");

    // Формат короткий: число стоит между концом ряда и прижатым к краю именем фазы, и полная
    // запись съедала этот зазор целиком. Полная остаётся у скринридера и у длительности ночи.
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

    // Борд держит в DOM обе раскладки сразу (бенто и мобильный стек), то есть плитка сна
    // всегда в двух копиях. Краска обязана лежать в СВОЕЙ копии: с общим id `url(#…)` уводит
    // на первое совпадение — в скрытую раскладку, откуда браузер краску не берёт, и бруски
    // видимой копии рисуются нечем (DESIGN §7.7).
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
