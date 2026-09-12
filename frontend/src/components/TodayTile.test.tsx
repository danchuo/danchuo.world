import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DayView } from "@/lib/api/types";
import { TodayTile } from "./TodayTile";

function dayFixture(over: Partial<DayView> = {}): DayView {
  return {
    date: "2026-06-18",
    title: "первый забег",
    hasData: true,
    health: { steps: 8421, sleepMinutes: 437, sleepStages: null },
    workouts: [{ type: "бег", durationMinutes: 31, activeEnergyKcal: 305, distanceMeters: 5100 }],
    discipline: [
      { key: "reading", label: "чтение", icon: null, count: 2, target: 2 },
      { key: "stretch", label: "растяжка", icon: null, count: 0, target: 1 },
    ],
    // Монстра за день отмечали и пил — `null` тут означал бы «не отмечали», а не «не пил».
    monsterDrunk: true,
    ...over,
  };
}

describe("TodayTile", () => {
  it("рендерит дату, имя дня и карту-тропу дисциплины (статы/тренировка переехали, монстр — детур карты)", () => {
    render(<TodayTile day={dayFixture()} today="2026-06-18" state="loaded" />);

    expect(screen.getByTestId("today-date")).toHaveTextContent("18 июня 2026");
    expect(screen.getByTestId("today-title")).toHaveTextContent("первый забег");
    // Шаги, сон и тренировка переехали из «Сегодня» на свои виджеты — здесь их строк больше нет.
    expect(screen.queryByText(/шаги/)).not.toBeInTheDocument();
    expect(screen.queryByText(/сон/)).not.toBeInTheDocument();
    expect(screen.queryByText(/8.421/)).not.toBeInTheDocument();
    expect(screen.queryByText(/тренировка/)).not.toBeInTheDocument();

    // дисциплина — карта-тропа (QuestMap): чтение закрыто на обеих остановках, растяжка нет
    expect(screen.getByTestId("quest-map")).toBeInTheDocument();
    expect(screen.getByTestId("quest-stop-reading-1")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("quest-stop-reading-2")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("quest-stop-stretch-1")).toHaveAttribute("data-done", "false");
    // выбран вкус ⇒ детур монстра закрыт; отдельного блока монстра внизу плитки нет
    expect(screen.getByTestId("quest-stop-monster")).toHaveAttribute("data-done", "true");
    expect(screen.queryByText("Mango Loco")).not.toBeInTheDocument();
    // Итоговой дроби «N/7» в плитке нет — прогресс виден остановками тропы.
    expect(screen.queryByTestId("quest-total")).not.toBeInTheDocument();
  });

  it("дата подсказывает номер дня жизни своим тултипом, а не системным", () => {
    render(<TodayTile day={dayFixture()} today="2026-06-18" state="loaded" />);

    // 2002-06-06 (день №1) → 2026-06-18.
    expect(screen.getByRole("tooltip")).toHaveTextContent("8779-й день жизни");
    // Системного тултипа на дате нет — вместе с ним ушёл и курсор-подсказка.
    const date = screen.getByTestId("today-date");
    expect(date).not.toHaveAttribute("title");
    expect(date.className).not.toContain("cursor-help");
    expect(date.querySelector(".cursor-help")).toBeNull();
  });

  it("до рождения владельца подсказки на дате нет вовсе", () => {
    render(
      <TodayTile day={dayFixture({ date: "2002-06-05" })} today="2002-06-05" state="loaded" />,
    );

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("пустой день: null → «нет данных», детур монстра не закрыт, пометки «не пил» нет", () => {
    const empty = dayFixture({
      title: null,
      hasData: false,
      health: { steps: null, sleepMinutes: null, sleepStages: null },
      workouts: [],
      monsterDrunk: null,
    });
    render(<TodayTile day={empty} today="2026-06-18" state="loaded" />);

    expect(screen.queryByTestId("today-title")).not.toBeInTheDocument();
    // Без тренировки и без статов — только шапка + карта; строки статов в плитке нет.
    expect(screen.queryByText(/шаги/)).not.toBeInTheDocument();
    expect(screen.queryByText(/тренировка/)).not.toBeInTheDocument();
    expect(screen.getByTestId("quest-map")).toBeInTheDocument();
    expect(screen.getByTestId("quest-stop-monster")).toHaveAttribute("data-done", "false");
    // Ни «не пил», ни «пил» — за пустой день монстра никто не отмечал.
    expect(screen.getByTestId("quest-stop-monster")).toHaveAttribute("data-tone", "unknown");
    expect(screen.queryByTestId("quest-monster-verb")).toBeNull();
    expect(screen.queryByTestId("monster-none")).not.toBeInTheDocument();
  });

  it("длинное имя дня переносится на вторую строку, а не ужимается в одну", () => {
    const long = "очень длинное имя дня про всё на свете"; // 38 символов
    render(<TodayTile day={dayFixture({ title: long })} today="2026-06-18" state="loaded" />);

    const title = screen.getByTestId("today-title");
    // Перенос разрешён — именно он и даёт крупный кегль вместо ужимания в одну строку.
    expect(title.className).not.toContain("whitespace-nowrap");
    expect(title.className).toContain("w-3/5"); // имя дня получает 3/5 строки
    // Ёмкость считается на ДВЕ строки: 192/38 ≈ 5.05cqw, потолок 4cqw побеждает.
    expect(title.style.fontSize).toBe("clamp(max(2.2cqw, 11px), 5.05cqw, min(4cqw, 40px))");
  });

  it("очень длинное имя дня остаётся читаемым: вдвое крупнее прежнего и не ниже пола", () => {
    // Реальное имя дня с прода (2026-09-01), 74 символа — на нём владелец и заметил «слишком мелко».
    const long =
      "тройной пресс на работе еще и люстру не починили а она и не ломалась кстати";
    expect(long).toHaveLength(75);
    render(<TodayTile day={dayFixture({ title: long })} today="2026-06-18" state="loaded" />);

    // Было 96/75 ≈ 1.28cqw одной строкой; стало 192/75 = 2.56cqw двумя — ровно вдвое крупнее.
    expect(screen.getByTestId("today-title").style.fontSize).toBe(
      "clamp(max(2.2cqw, 11px), 2.56cqw, min(4cqw, 40px))",
    );
  });

  it("имя дня длиннее двух строк упирается в пол кегля, а не тает дальше", () => {
    const huge = "и".repeat(200);
    render(<TodayTile day={dayFixture({ title: huge })} today="2026-06-18" state="loaded" />);

    // 192/200 = 0.96cqw — ниже пола: clamp отдаёт max(2.2cqw, 11px), имя занимает больше строк.
    expect(screen.getByTestId("today-title").style.fontSize).toBe(
      "clamp(max(2.2cqw, 11px), 0.96cqw, min(4cqw, 40px))",
    );
  });

  it("короткое имя дня держит общий кегль со строкой даты (пол/потолок не мешают)", () => {
    render(<TodayTile day={dayFixture()} today="2026-06-18" state="loaded" />);
    // «первый забег» — 12 символов: 192/12 = 16cqw > 4cqw, размер остаётся 4cqw и одной строкой
    expect(screen.getByTestId("today-title").style.fontSize).toBe(
      "clamp(max(2.2cqw, 11px), 16.00cqw, min(4cqw, 40px))",
    );
  });

  it("подпись плитки относительна выбранной дате (а не всегда «сегодня»)", () => {
    // Выбран 17-е при сегодня 18-м → «вчера».
    render(<TodayTile day={dayFixture({ date: "2026-06-17" })} today="2026-06-18" state="loaded" />);
    expect(screen.getByText("вчера")).toBeInTheDocument();
    expect(screen.queryByText("сегодня")).not.toBeInTheDocument();
  });

  it("в состоянии loading показывает шиммер, а не контент", () => {
    render(<TodayTile day={null} today="2026-06-18" state="loading" />);
    expect(screen.getByTestId("tile-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("today-date")).not.toBeInTheDocument();
  });

  // --- Выходной: сцена отдыха вместо карты-тропы (§5.6) ---------------------------------------

  it("выходной с волной-сценой: карта уступает место сцене отдыха, чеклист монстра ✓ (не пил)", () => {
    // 2026-06-21 — воскресенье; монстр не пит ⇒ чеклист-галочка, без стриков.
    render(
      <TodayTile
        day={dayFixture({ date: "2026-06-21", monsterDrunk: false })}
        today="2026-06-21"
        state="loaded"
        wave="wave-01"
      />,
    );
    expect(screen.getByTestId("weekend-scene")).toBeInTheDocument();
    expect(screen.queryByTestId("quest-map")).not.toBeInTheDocument();
    expect(screen.getByTestId("weekend-monster")).toHaveAttribute("data-done", "false");
    expect(screen.getByTestId("weekend-monster")).toHaveTextContent("монстр — не пил");
  });

  it("выходной, монстр пил: чеклист монстра словами", () => {
    // dayFixture по умолчанию ставит вкус mango-loco ⇒ монстр пил.
    render(
      <TodayTile day={dayFixture({ date: "2026-06-21" })} today="2026-06-21" state="loaded" wave="wave-01" />,
    );
    expect(screen.getByTestId("weekend-monster")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("weekend-monster-mark")).toHaveTextContent(/^пил$/);
  });

  it("«пил» и «не пил» красятся РАЗНЫМИ токенами, а не оттенками тревоги", () => {
    // Регрессионный якорь: раньше «не пил» шёл --accent, а на волне 01 это #e2604c —
    // почти тот же тон, что --danger #d2553f. Состояния различались одним словом,
    // а цвет в обоих случаях говорил «плохо».
    const mark = (drunk: boolean) => {
      const { unmount } = render(
        <TodayTile
          day={dayFixture({ date: "2026-06-21", monsterDrunk: drunk })}
          today="2026-06-21"
          state="loaded"
          wave="wave-01"
        />,
      );
      const style = screen.getByTestId("weekend-monster-mark").getAttribute("style") ?? "";
      unmount();
      return style;
    };

    expect(mark(false)).toContain("--accent-clean");
    expect(mark(true)).toContain("--danger");
    // И зелёный не одолжен у чужой роли: --accent-code это канал вкладов GitHub.
    expect(mark(false)).not.toContain("--accent-code");
  });

  it("день без записи: монстр серый и молчит — отсутствие данных не выдаём за чистый день", () => {
    // Будущий день / дырка в истории: за него никто не отмечал, и вердикта нет.
    render(
      <TodayTile
        day={dayFixture({ date: "2026-06-18", hasData: false, monsterDrunk: null })}
        today="2026-06-18"
        state="loaded"
      />,
    );
    expect(screen.getByTestId("quest-stop-monster")).toHaveAttribute("data-tone", "unknown");
    expect(screen.queryByTestId("quest-monster-verb")).toBeNull();
    expect(screen.getByTestId("quest-monster-verdict")).toHaveTextContent(/^монстр$/);
  });

  it("запись за день есть, монстр пустой — честное «не пил» (шорткат прислал пустого монстра)", () => {
    render(
      <TodayTile
        day={dayFixture({ date: "2026-06-18", hasData: true, monsterDrunk: false })}
        today="2026-06-18"
        state="loaded"
      />,
    );
    expect(screen.getByTestId("quest-stop-monster")).toHaveAttribute("data-tone", "clean");
    expect(screen.getByTestId("quest-monster-verb")).toHaveTextContent("не пил");
  });

  it("выходной без записи: сцена не утверждает «не пил», а говорит «нет данных»", () => {
    render(
      <TodayTile
        day={dayFixture({ date: "2026-06-21", hasData: false, monsterDrunk: null })}
        today="2026-06-21"
        state="loaded"
        wave="wave-01"
      />,
    );
    expect(screen.getByTestId("weekend-monster")).toHaveAttribute("data-tone", "unknown");
    expect(screen.getByTestId("weekend-monster-mark")).toHaveTextContent("нет данных");
  });

  it("будний день держит карту-тропу даже на волне со сценой", () => {
    render(
      <TodayTile day={dayFixture({ date: "2026-06-18" })} today="2026-06-18" state="loaded" wave="wave-01" />,
    );
    expect(screen.getByTestId("quest-map")).toBeInTheDocument();
    expect(screen.queryByTestId("weekend-scene")).not.toBeInTheDocument();
  });

  it("выходной без волны-сцены: сцены нет, остаётся карта (грациозный фолбэк)", () => {
    render(
      <TodayTile day={dayFixture({ date: "2026-06-21" })} today="2026-06-21" state="loaded" wave="wave-02" />,
    );
    expect(screen.getByTestId("quest-map")).toBeInTheDocument();
    expect(screen.queryByTestId("weekend-scene")).not.toBeInTheDocument();
  });
});
