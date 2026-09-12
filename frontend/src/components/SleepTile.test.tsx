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

/** Переключить плитку в режим полосы. */
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
    // Четыре куска ночи, включая пробуждение — оно часть ночи, а не дырка
    expect(screen.getAllByTestId("night-band-part")).toHaveLength(4);
  });

  it("переключатель не помечен мета-подписью — скин волны прячет их целиком", async () => {
    getSleepNightMock.mockResolvedValue(night);
    render(<SleepTile day={day()} state="loaded" />);

    // Волна 02 скрывает `.tile-label` (это параметр волны). Управление и цифры не подписи:
    // попав в этот класс, переключатель исчезал с борда вместе с ними.
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

    // Одной подписью «23:20–07:20»: вертикаль плитки уходит полосе, а не тексту.
    await waitFor(() => expect(screen.getByText("23:20–07:20")).toBeInTheDocument());
  });

  it("подписывает дорожки фаз — они же и есть вечная легенда", async () => {
    getSleepNightMock.mockResolvedValue(night);
    render(<SleepTile day={day()} state="loaded" />);
    await openBand();

    const band = await screen.findByTestId("night-band");
    // Подпись дорожки — та же, что в «Здоровье» (Core / базовый), а не общепринятый «лёгкий».
    ["не спал", "REM", "базовый", "глубокий"].forEach((label) => {
      expect(within(band).getByText(label)).toBeInTheDocument();
    });
    expect(within(band).queryByText("лёгкий")).not.toBeInTheDocument();
    // Отдельной строки-легенды больше нет: её высота отдана графику.
    expect(screen.queryByTestId("night-legend")).not.toBeInTheDocument();
  });

  it("кладёт фазу на свою дорожку: глубокий сон ниже, чем пробуждение", async () => {
    getSleepNightMock.mockResolvedValue(night);
    render(<SleepTile day={day()} state="loaded" />);
    await openBand();

    const parts = await screen.findAllByTestId("night-band-part");
    // Верх куска задан как `calc(25% + 2px)` — берём долю, зазор дорожек тут не важен.
    const top = (i: number) => Number(/top:\s*calc\((-?[\d.]+)%/.exec(parts[i].getAttribute("style")!)![1]);
    // Порядок кусков в фикстуре: light, deep, awake, rem.
    expect(top(2)).toBeLessThan(top(3)); // не спал выше REM
    expect(top(3)).toBeLessThan(top(0)); // REM выше базового
    expect(top(0)).toBeLessThan(top(1)); // базовый выше глубокого
  });

  it("сравнения со средней ночью не показывает — среднее уже есть в «активности»", async () => {
    getSleepNightMock.mockResolvedValue(night);
    render(<SleepTile day={day()} state="loaded" />);
    await openBand();

    const band = await screen.findByTestId("night-band");
    // Привычное окно рисуется полоской и подписано одним словом: цифр времени рядом с ним нет.
    expect(within(band).queryByText(/обычно\s*\d/i)).not.toBeInTheDocument();
    expect(within(band).queryByText(/\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}/)).not.toBeInTheDocument();
  });

  it("ночь без сохранённых кусков показывает ту же пустоту, что и день без сна", async () => {
    getSleepNightMock.mockResolvedValue({ ...night, band: null });
    render(<SleepTile day={day()} state="loaded" />);
    await openBand();

    // Для зрителя это один и тот же случай «показать нечего» — картинка одна на оба.
    await waitFor(() =>
      expect(screen.getByTestId("sleep-empty")).toBeInTheDocument(),
    );
    expect(screen.getByText("нет данных о сне")).toBeInTheDocument();
    expect(screen.queryByText(/не записана по минутам/i)).not.toBeInTheDocument();
  });

  it("не повторяет в шапке, какой день выбран — это уже сказано в «Сегодня»", () => {
    render(<SleepTile day={day({ date: "2026-07-21" })} state="loaded" />);

    // Выбор дня общий для борда: подпись живёт в плитке дня и в календаре, а не в каждой плитке.
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
    expect(screen.getByText("нет данных о сне")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /по часам/i }),
    ).not.toBeInTheDocument();
  });
});

describe("SleepTile — подсказки к фазам сна", () => {
  it("у каждой подписи фазы своя подсказка волны, а не нативный title", async () => {
    // «REM/DEEP/CORE» ничего не говорят тому, кто в фазах не разбирался; минуты и доля
    // рядом отвечают на другой вопрос. Подсказка — тот же HoverTip, что у огонька-стрика
    // и у номера дня жизни: один язык подсказок на весь борд (§7.7).
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
      // ГЛАВНОЕ: подсказка живёт ВНЕ плитки. Плитка режет содержимое, и пока подсказка была
      // её ребёнком, у длинного текста не было видно конца — сначала снизу, потом справа.
      // Подгонять ширину и направление под края бессмысленно: край всегда найдётся.
      expect(t.closest(".pixel-tile")).toBeNull();
    }
    expect(new Set(tips.map((t) => t.textContent)).size).toBe(3);
  });
});
