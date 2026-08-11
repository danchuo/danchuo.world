import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DaySummary } from "@/lib/api/types";
import { datesInRange, weekWindowAround } from "@/lib/date";
import { Calendar } from "./Calendar";

const TODAY = "2026-06-18";

/** Прошедший день, за который ничего не залилось — дырка в записи (не «ещё не наступил»). */
const GAP = "2026-06-10";

function buildWindow(today: string = TODAY): DaySummary[] {
  const { from, to } = weekWindowAround(today, 2, 1);
  return datesInRange(from, to).map((date) => ({
    date,
    title: date === today ? "сегодня-день" : null,
    hasData: date <= today && date !== GAP,
    steps: date === today ? 8421 : null,
    sleepMinutes: null,
    contributions: null,
    disciplineDone: 0,
    disciplineTotal: 5,
    // Растяжка сделана по чётным числам — материал для линзы.
    disciplineCounts: { stretch: Number(date.slice(8)) % 2 === 0 ? 1 : 0, reading: 2 },
    // Монстра отмечали в каждый день с записью — иначе линза молчала бы всюду.
    monsterReported: date <= today && date !== GAP,
    monster:
      date === "2026-06-20" ? { key: "mango-loco", name: "Mango Loco", accentColor: "#F4A52A" } : null,
  }));
}

const STRETCH_LENS = { key: "stretch", occurrence: 1, label: "растяжка" };
const MONSTER_LENS = { key: "monster", occurrence: 1, label: "монстр" };

/** Пил 16-го, чист 17-го; GAP по-прежнему без ответа — материал для линзы монстра. */
function buildMonsterWindow(): DaySummary[] {
  return buildWindow().map((d) =>
    d.date === "2026-06-16"
      ? { ...d, monster: { key: "mango-loco", name: "Mango Loco", accentColor: "#F4A52A" } }
      : d,
  );
}

describe("Calendar — колонка выходных", () => {
  it("будущий выходной остаётся выходным, а не будущим днём", () => {
    // Приоритет заливки: соседний месяц → выходной → будущее. Окно наполовину состоит из
    // будущего, и без этого правила половина колонки сб/вс красилась бы «будущим» —
    // колонка выходных обрывалась бы на сегодняшнем дне.
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    // 20 и 21 июня 2026 — суббота и воскресенье, обе позже TODAY (18-е, четверг).
    for (const date of ["2026-06-20", "2026-06-21"]) {
      const cell = screen.getByTestId(`day-${date}`).getAttribute("style") ?? "";
      expect(cell).toContain("var(--cal-weekend)");
      expect(cell).not.toContain("var(--bg-surface-muted)");
    }
  });

  it("прошедший выходной красится тем же токеном, что и будущий", () => {
    // Колонка обязана читаться сплошной сверху донизу — иначе «выходной» превращается
    // в оттенок «когда», а это уже занятый канал.
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    const past = screen.getByTestId("day-2026-06-13").getAttribute("style") ?? "";
    const future = screen.getByTestId("day-2026-06-20").getAttribute("style") ?? "";
    expect(past).toContain("var(--cal-weekend)");
    expect(future).toContain("var(--cal-weekend)");
  });
});

describe("Calendar (окно целыми неделями)", () => {
  it("рисует непрерывную сетку из 4 целых недель = 28 ячеек с числами дней", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.getAllByRole("gridcell")).toHaveLength(28);
    expect(screen.getByTestId(`day-${TODAY}`)).toHaveTextContent("18");
  });

  it("помечает сегодня (aria-current) и день с именем", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.getByTestId(`day-${TODAY}`)).toHaveAttribute("aria-current", "date");
    expect(screen.getByTestId(`day-${TODAY}`)).toHaveAttribute("data-today", "true");
    expect(screen.getByTestId("day-2026-06-20")).toHaveAttribute("data-future", "true");
    expect(screen.getByTestId("name-mark-2026-06-18")).toBeInTheDocument();
  });

  it("монстр не показывается в ячейке: ни пикселя цвета, ни строки в ховер-сводке", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    const cell = screen.getByTestId("day-2026-06-20");
    // Ни пикселя-акцента, ни accentColor в инлайновых стилях ячейки и её детей.
    expect(screen.queryByTestId("monster-pixel-2026-06-20")).not.toBeInTheDocument();
    expect(cell.outerHTML).not.toContain("#F4A52A");
    // Ховер-сводка и подпись для скринридера — без вкуса.
    expect(cell.getAttribute("title")).not.toContain("Mango Loco");
    expect(cell.getAttribute("title")).not.toContain("монстр");
    expect(cell.getAttribute("aria-label")).not.toContain("монстр");
    // Сама сводка при этом жива.
    expect(cell.getAttribute("title")).toContain("шаги");
  });

  it("размечает выходные и дни соседнего месяца", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    // 2026-06-13 — суббота; 2026-06-14 — воскресенье (сегодня 18-е = четверг).
    expect(screen.getByTestId("day-2026-06-13")).toHaveAttribute("data-weekend", "true");
    expect(screen.getByTestId("day-2026-06-14")).toHaveAttribute("data-weekend", "true");
    // 2026-06-18 — будний → метки выходного нет.
    expect(screen.getByTestId("day-2026-06-18")).not.toHaveAttribute("data-weekend");
  });

  it("отличает дырку в записи от будущего дня", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    // Прошедший день без данных — пропуск: его видно пунктиром.
    expect(screen.getByTestId(`day-${GAP}`)).toHaveAttribute("data-gap", "true");
    // Прошедший с данными и будущий (там данных и быть не может) — не пропуски.
    expect(screen.getByTestId("day-2026-06-11")).not.toHaveAttribute("data-gap");
    expect(screen.getByTestId("day-2026-06-25")).not.toHaveAttribute("data-gap");
    // Сегодня ещё идёт — незаполненность не дырка, и своя рамка сильнее.
    expect(screen.getByTestId(`day-${TODAY}`)).not.toHaveAttribute("data-gap");
  });

  it("месяц не метится заливкой вовсе — ни у своих дней, ни у чужих", () => {
    // Заливка «чужого месяца» снята (§5.3): она зависела от того, где стоит окно, поэтому
    // на листании целое полотно инвертировалось разом. Месяц метит граница, а не тон.
    const stride = "2026-07-02"; // окно 15.06 → 12.07 — стык месяцев
    render(
      <Calendar
        days={buildWindow(stride)}
        selected={stride}
        today={stride}
        onSelect={() => {}}
        state="loaded"
      />,
    );
    for (const date of ["2026-06-15", "2026-06-20", "2026-06-22", "2026-07-02"]) {
      expect(screen.getByTestId(`day-${date}`).getAttribute("style") ?? "").not.toContain(
        "othermonth",
      );
    }
  });

  it("цифра чужого месяца не приглушается — это тот же сигнал, что и снятая заливка", () => {
    const stride = "2026-07-02";
    render(
      <Calendar
        days={buildWindow(stride)}
        selected={stride}
        today={stride}
        onSelect={() => {}}
        state="loaded"
      />,
    );
    const june = screen.getByTestId("day-2026-06-22").getAttribute("style") ?? "";
    const july = screen.getByTestId("day-2026-07-01").getAttribute("style") ?? "";
    expect(june).toContain("var(--text-primary)");
    expect(july).toContain("var(--text-primary)");
  });

  it("выходной остаётся выходным в любом месяце окна", () => {
    // Регрессионный якорь: снятие заливки месяца не должно задеть колонку сб/вс, которая
    // раньше внутри чужого месяца обрывалась и ради которой заводился отдельный токен.
    const stride = "2026-07-02";
    render(
      <Calendar
        days={buildWindow(stride)}
        selected={stride}
        today={stride}
        onSelect={() => {}}
        state="loaded"
      />,
    );
    for (const date of ["2026-06-20", "2026-06-21", "2026-07-04"]) {
      expect(screen.getByTestId(`day-${date}`).getAttribute("style") ?? "").toContain(
        "var(--cal-weekend)",
      );
    }
  });

  it("граница месяца рисуется отрезками в своём слое, а не кусками внутри клеток", () => {
    // Окно 15.06 → 12.07, 1 июля — среда (колонка 2 ряда 2). Ступенька: вертикаль слева от
    // 1-го, горизонталь по хвосту ряда 2 (ср…вс) и по началу ряда 3 (пн…вт).
    // Куски внутри клеток лезли в жёлоб внахлёст и зависели от толщины рамки клетки —
    // отсюда и линия, читавшаяся толще у выходных, и её просадка над выбранным днём.
    // `today` в августе: значит июль — прошлый месяц, и его стык метится (см. кейс ниже).
    const stride = "2026-07-02";
    render(
      <Calendar
        days={buildWindow(stride)}
        selected={stride}
        today="2026-08-04"
        anchor={stride}
        onSelect={() => {}}
        state="loaded"
      />,
    );
    expect(screen.getByTestId("month-edge-h-2-2-7")).toBeInTheDocument();
    expect(screen.getByTestId("month-edge-h-3-0-2")).toBeInTheDocument();
    expect(screen.getByTestId("month-edge-v-2-2")).toBeInTheDocument();
    // Ровно три отрезка — прогон не рассыпан по клеткам.
    expect(document.querySelectorAll(".cal-month-edge")).toHaveLength(3);
    // Внутри клеток границы нет вовсе.
    expect(screen.getByTestId("day-2026-07-01").querySelector(".cal-month-edge")).toBeNull();
  });

  it("слой границ не перехватывает клики по дням", () => {
    // Слой накрывает всю сетку, поэтому без `pointer-events: none` он съел бы всю навигацию.
    const stride = "2026-07-02";
    render(
      <Calendar
        days={buildWindow(stride)}
        selected={stride}
        today={stride}
        onSelect={() => {}}
        state="loaded"
      />,
    );
    const layer = document.querySelector(".cal-month-edges");
    expect(layer).toHaveAttribute("aria-hidden");
    expect(layer?.className).toContain("cal-month-edges");
  });

  it("первое число месяца названо словом — граница говорит «где», подпись «какой»", () => {
    const stride = "2026-07-02";
    render(
      <Calendar
        days={buildWindow(stride)}
        selected={stride}
        today="2026-08-04"
        anchor={stride}
        onSelect={() => {}}
        state="loaded"
      />,
    );
    expect(screen.getByTestId("month-mark-2026-07-01")).toHaveTextContent(/июл/i);
    // У обычного дня подписи нет — иначе сетка превратилась бы в перечисление месяцев.
    expect(screen.queryByTestId("month-mark-2026-07-02")).toBeNull();
  });

  it("стык с ТЕКУЩИМ месяцем молчит — ни линии, ни подписи", () => {
    // Решение владельца: в домашнем окне граница была бы постоянным шумом — месяц и так
    // назван плиткой «Сегодня». Метка набирает смысл в истории, где месяцы сливаются.
    // Окно 20.07 → 16.08 при «сегодня» 4 августа: стык 01.08 — начало текущего месяца.
    const stride = "2026-08-04";
    render(
      <Calendar
        days={buildWindow(stride)}
        selected={stride}
        today={stride}
        onSelect={() => {}}
        state="loaded"
      />,
    );
    expect(document.querySelectorAll(".cal-month-edge")).toHaveLength(0);
    expect(screen.queryByTestId("month-mark-2026-08-01")).toBeNull();
  });

  it("верхний край окна границей не метится — там не стык месяцев, а обрез выборки", () => {
    // Окно 15.06 → 12.07: первая строка начинается 15 июня, над ней ничего нет.
    const stride = "2026-07-02";
    render(
      <Calendar
        days={buildWindow(stride)}
        selected={stride}
        today="2026-08-04"
        anchor={stride}
        onSelect={() => {}}
        state="loaded"
      />,
    );
    // Стык июля при этом нарисован — значит проверка про первый ряд не вырождена.
    expect(screen.getByTestId("month-edge-v-2-2")).toBeInTheDocument();
    expect(document.querySelector('[data-testid^="month-edge-h-0-"]')).toBeNull();
  });

  it("клик по дню перефокусирует (onSelect с датой)", async () => {
    const onSelect = vi.fn();
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={onSelect} state="loaded" />,
    );
    await userEvent.click(screen.getByTestId("day-2026-06-21"));
    expect(onSelect).toHaveBeenCalledWith("2026-06-21");
  });

  it("без линзы ячейки не размечены её ответом (календарь прежний)", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.getByTestId("day-2026-06-16")).not.toHaveAttribute("data-lens");
    expect(screen.getByText("календарь")).toBeInTheDocument();
  });

  it("линза размечает дни: совпал / не совпал / нет ответа", () => {
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={STRETCH_LENS}
      />,
    );
    // прошедший день с данными, растяжка была
    expect(screen.getByTestId("day-2026-06-16")).toHaveAttribute("data-lens", "yes");
    // прошедший день с данными, растяжки не было
    expect(screen.getByTestId("day-2026-06-17")).toHaveAttribute("data-lens", "no");
    // дырка в записи и будущий день ответа не дают — «не сделал» им не приписываем
    expect(screen.getByTestId(`day-${GAP}`)).toHaveAttribute("data-lens", "unknown");
    expect(screen.getByTestId("day-2026-06-20")).toHaveAttribute("data-lens", "unknown");
  });

  it("совпавший день несёт рамку-отметку, заливка ячейки при этом не трогается", () => {
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={STRETCH_LENS}
      />,
    );
    expect(screen.getByTestId("lens-frame-2026-06-16")).toBeInTheDocument();
    // не совпал / нет ответа — рамки нет
    expect(screen.queryByTestId("lens-frame-2026-06-17")).toBeNull();
    expect(screen.queryByTestId(`lens-frame-${GAP}`)).toBeNull();
    // заливка выходного осталась своей: линза её не подменяет (вопрос «когда» неприкосновенен)
    const weekend = screen.getByTestId("day-2026-06-13");
    expect(weekend.getAttribute("style")).toContain("var(--cal-weekend)");
    expect(weekend.getAttribute("style")).not.toContain("color-mix");
  });

  it("линза не отбирает у ячейки её собственные состояния (пропуск/выходной/сегодня)", () => {
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={STRETCH_LENS}
      />,
    );
    expect(screen.getByTestId(`day-${GAP}`)).toHaveAttribute("data-gap", "true");
    expect(screen.getByTestId("day-2026-06-13")).toHaveAttribute("data-weekend", "true");
    expect(screen.getByTestId(`day-${TODAY}`)).toHaveAttribute("data-today", "true");
  });

  it("ответ линзы едет в ховер-сводку и подпись для скринридера", () => {
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={STRETCH_LENS}
      />,
    );
    expect(screen.getByTestId("day-2026-06-16").getAttribute("title")).toContain("растяжка: сделано");
    expect(screen.getByTestId("day-2026-06-17").getAttribute("aria-label")).toContain(
      "растяжка: не сделано",
    );
    // дню без данных линза ничего не приписывает
    expect(screen.getByTestId(`day-${GAP}`).getAttribute("title")).not.toContain("растяжка");
  });

  it("ярлык плитки называет линзу и даёт снять её крестиком", async () => {
    const onLensChange = vi.fn();
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={STRETCH_LENS}
        onLensChange={onLensChange}
      />,
    );
    expect(screen.getByTestId("calendar-lens-label")).toHaveTextContent("растяжка");
    await userEvent.click(screen.getByTestId("calendar-lens-reset"));
    expect(onLensChange).toHaveBeenCalledWith(null);
  });

  it("ярлык линзы монстра называет предмет линзы: полярность теперь несут сами ячейки", () => {
    // Разворот «не пил монстр» был костылём под одностороннюю отметку — см. `lensTitle`.
    render(
      <Calendar
        days={buildMonsterWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={MONSTER_LENS}
      />,
    );
    expect(screen.getByTestId("calendar-lens-label")).toHaveTextContent("календарь — монстр");
  });

  it("линза монстра метит ТОЛЬКО «пил» — чистые дни остаются обычными ячейками", () => {
    render(
      <Calendar
        days={buildMonsterWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={MONSTER_LENS}
      />,
    );
    // 16-е — пил: тревожная отметка. Раньше день просто гас, и «пил» было неотличимо от
    // «не читал» у любой другой линзы — именно этого сигнала на сетке и не хватало.
    const drunk = screen.getByTestId("lens-frame-2026-06-16");
    expect(drunk.getAttribute("class")).toContain("cal-lens-digit--drunk");
    // 17-е — чист: отметки НЕТ. Зелёная рамка на чистых днях пробовалась и снята — их
    // подавляющее большинство, и сетка заливалась зелёным сплошь (решение владельца).
    expect(screen.queryByTestId("lens-frame-2026-06-17")).toBeNull();
    // Дырка в записи ответа не даёт тем более.
    expect(screen.queryByTestId(`lens-frame-${GAP}`)).toBeNull();
  });

  it("день без запуска шортката не считается чистым: ни отметки, ни строки «не пил»", () => {
    // Запись за день есть (её создаёт health-ingest), монстра никто не отмечал.
    const days = buildWindow().map((d) =>
      d.date === "2026-06-17" ? { ...d, monsterReported: false } : d,
    );
    render(
      <Calendar
        days={days}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={MONSTER_LENS}
      />,
    );
    const cell = screen.getByTestId("day-2026-06-17");
    expect(cell).toHaveAttribute("data-lens", "unknown");
    expect(cell.getAttribute("title")).not.toContain("не пил");
  });

  it("отмеченный «пил» не гаснет заодно: приглушение и отметка — взаимоисключающие каналы", () => {
    render(
      <Calendar
        days={buildMonsterWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={MONSTER_LENS}
      />,
    );
    // У обычной линзы «не совпал» гасит цифру — это отсутствие. У монстра это событие,
    // и гасить его, одновременно отмечая, значило бы говорить о нём двумя голосами сразу.
    expect(screen.getByTestId("day-2026-06-16").getAttribute("style")).toContain(
      "var(--text-primary)",
    );
  });

  it("ховер-сводка монстра говорит тем же вердиктом, что карта-тропа", () => {
    render(
      <Calendar
        days={buildMonsterWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        lens={MONSTER_LENS}
      />,
    );
    expect(screen.getByTestId("day-2026-06-16").getAttribute("title")).toContain("пил монстр");
    expect(screen.getByTestId("day-2026-06-17").getAttribute("title")).toContain("не пил монстр");
  });

  it("сетка несёт собственную пропорцию — в мобильном стеке высоты ей никто не даёт", () => {
    // DESIGN §8: в бенто высота приходит от прибитого к вьюпорту борда, а в стеке её нет
    // вовсе — блок, выведенный из родителя (`flex-1` + строки `1fr`), схлопнулся бы в полоску
    // цифр. Пропорция считается от числа недель окна, а не зашита: окно — параметр борда.
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.getByRole("grid").style.aspectRatio).toBe("7 / 4");
  });

  it("в состоянии error показывает тихий ретрай", async () => {
    const onRetry = vi.fn();
    render(
      <Calendar days={[]} selected={TODAY} today={TODAY} onSelect={() => {}} state="error" onRetry={onRetry} />,
    );
    await userEvent.click(screen.getByText("повторить"));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("Calendar — листание прошлых недель (§5.3)", () => {
  /** Окно вокруг [anchor] при живущем отдельно «сегодня» — материал для сдвинутого окна. */
  function windowAround(anchor: string, today: string): DaySummary[] {
    const { from, to } = weekWindowAround(anchor, 2, 1);
    return datesInRange(from, to).map((date) => ({
      date,
      title: null,
      hasData: date <= today,
      steps: null,
      sleepMinutes: null,
      contributions: null,
      disciplineDone: 0,
      disciplineTotal: 5,
      disciplineCounts: { stretch: 0, reading: 0 },
      monster: null,
    }));
  }

  it("без обработчика листания в календаре нет ни одной стрелки", () => {
    // Регрессионный якорь: домашняя плитка не обросла хромом там, где листать нечем.
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.queryByTestId("calendar-prev")).toBeNull();
    expect(screen.queryByTestId("calendar-next")).toBeNull();
  });

  it("в домашнем положении видна только стрелка назад", () => {
    // Вперёд от сегодня идти некуда, и возвращаться неоткуда — обе кнопки были бы мёртвыми.
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={() => {}}
        onResetWindow={() => {}}
      />,
    );
    expect(screen.getByTestId("calendar-prev")).toBeInTheDocument();
    expect(screen.queryByTestId("calendar-next")).toBeNull();
    expect(screen.queryByTestId("calendar-home")).toBeNull();
  });

  it("стрелка назад листает ровно на неделю", async () => {
    const onShiftWeeks = vi.fn();
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={onShiftWeeks}
      />,
    );
    await userEvent.click(screen.getByTestId("calendar-prev"));
    expect(onShiftWeeks).toHaveBeenCalledWith(-1);
  });

  it("сдвинутое окно даёт шаг вперёд и возврат к сегодня", async () => {
    const onShiftWeeks = vi.fn();
    const onResetWindow = vi.fn();
    const anchor = "2026-06-11";
    render(
      <Calendar
        days={windowAround(anchor, "2026-07-02")}
        selected={"2026-07-02"}
        today="2026-07-02"
        anchor={anchor}
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={onShiftWeeks}
        onResetWindow={onResetWindow}
      />,
    );
    await userEvent.click(screen.getByTestId("calendar-next"));
    expect(onShiftWeeks).toHaveBeenCalledWith(1);
    await userEvent.click(screen.getByTestId("calendar-home"));
    expect(onResetWindow).toHaveBeenCalledOnce();
  });

  it("на границе генезиса стрелки назад нет", () => {
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={() => {}}
        canGoBack={false}
      />,
    );
    expect(screen.queryByTestId("calendar-prev")).toBeNull();
  });

  it("сдвинутое окно называет свой месяц, а не «сегодня»", () => {
    render(
      <Calendar
        days={windowAround("2026-06-11", "2026-07-02")}
        selected="2026-07-02"
        today="2026-07-02"
        anchor="2026-06-11"
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={() => {}}
      />,
    );
    expect(screen.getByTestId("calendar-window-month")).toHaveTextContent("июнь");
  });

  it("месяц чужого года назван вместе с годом", () => {
    render(
      <Calendar
        days={windowAround("2025-12-10", "2026-07-02")}
        selected="2026-07-02"
        today="2026-07-02"
        anchor="2025-12-10"
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={() => {}}
      />,
    );
    expect(screen.getByTestId("calendar-window-month")).toHaveTextContent("декабрь 2025");
  });

  it("вид дня не зависит от положения окна — листание ничего не перекрашивает", () => {
    // Главный контракт этой правки. Пока месяц метился заливкой «свой/чужой», опора двигала
    // тон КАЖДОЙ клетки: раз в 4–5 кликов она пересекала границу месяца, и полотно
    // инвертировалось разом — движения на неделю не читалось, читалось перелистывание.
    const days = windowAround("2026-06-25", "2026-07-02");
    const first = render(
      <Calendar
        days={days}
        selected="2026-07-02"
        today="2026-07-02"
        anchor="2026-06-25"
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={() => {}}
      />,
    );
    const before = screen.getByTestId("day-2026-06-15").getAttribute("style");
    first.unmount();

    // То же окно, но опора уехала в другой месяц — клетка обязана выглядеть ровно так же.
    render(
      <Calendar
        days={days}
        selected="2026-07-02"
        today="2026-07-02"
        anchor="2026-07-02"
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={() => {}}
      />,
    );
    expect(screen.getByTestId("day-2026-06-15").getAttribute("style")).toBe(before);
  });

  it("«сегодня» и «будущее» остаются привязанными к настоящей дате, а не к якорю", () => {
    // Якорь двигает только окно и опору месяца. Рамка сегодня, приглушение будущего и
    // пропуск в записи считаются от настоящего дня — иначе отлистанное окно начало бы врать.
    // Якорь на неделю назад: окно 08.06 → 05.07, «сегодня» (2 июля) ещё в кадре.
    render(
      <Calendar
        days={windowAround("2026-06-25", "2026-07-02")}
        selected="2026-07-02"
        today="2026-07-02"
        anchor="2026-06-25"
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={() => {}}
      />,
    );
    expect(screen.getByTestId("day-2026-07-02")).toHaveAttribute("data-today", "true");
    expect(screen.getByTestId("day-2026-07-03")).toHaveAttribute("data-future", "true");
    expect(screen.getByTestId("day-2026-06-15")).not.toHaveAttribute("data-future");
  });
});
