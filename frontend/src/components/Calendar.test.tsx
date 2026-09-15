import { fireEvent, render, screen } from "@testing-library/react";
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
    // Растяжка сделана по чётным числам — материал для линзы.
    disciplineCounts: { stretch: Number(date.slice(8)) % 2 === 0 ? 1 : 0, reading: 2 },
    // Монстра отмечали в каждый день с записью — иначе линза молчала бы всюду.
    monsterDrunk: date <= today && date !== GAP ? false : null,
  }));
}

const STRETCH_LENS = { key: "stretch", occurrence: 1, label: "растяжка" };
const MONSTER_LENS = { key: "monster", occurrence: 1, label: "монстр" };

/** Пил 16-го, чист 17-го; GAP по-прежнему без ответа — материал для линзы монстра. */
function buildMonsterWindow(): DaySummary[] {
  return buildWindow().map((d) =>
    d.date === "2026-06-16"
      ? { ...d, monsterDrunk: true }
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

  it("монстр не показывается в ячейке: ни метки, ни строки в ховер-сводке", () => {
    // День, за который монстр ВЫПИТ, — и без линзы ячейка об этом молчит (§6).
    render(
      <Calendar days={buildMonsterWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    const cell = screen.getByTestId("day-2026-06-16");
    expect(screen.queryByTestId("monster-pixel-2026-06-16")).not.toBeInTheDocument();
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
    // 17-е — чист: отметки НЕТ. Зелёная рамка на чистых днях отклонена (DESIGN §5.1).
    expect(screen.queryByTestId("lens-frame-2026-06-17")).toBeNull();
    // Дырка в записи ответа не даёт тем более.
    expect(screen.queryByTestId(`lens-frame-${GAP}`)).toBeNull();
  });

  it("день без запуска шортката не считается чистым: ни отметки, ни строки «не пил»", () => {
    // Запись за день есть (её создаёт health-ingest), монстра никто не отмечал.
    const days = buildWindow().map((d) =>
      d.date === "2026-06-17" ? { ...d, monsterDrunk: null } : d,
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

  it("пропорции нечем задать ШИРИНУ сетки — иначе календарь выезжает за плитку", () => {
    // Приём §8 работает только полной тройкой (эталон — `.quest-map`). Без `width: 100%`
    // пропорция вольна считать не высоту, а ширину: Safari так и делал, и седьмая колонка
    // («вс») уезжала за край плитки. Без `flex: 1 1 auto` (tailwind-`flex-1` даёт basis `0%`)
    // высоту тоже забирает пропорция — сетка выходит ниже места, и под ней остаётся полоса
    // голой поверхности карточки. Обе шалости — одна причина, поэтому и замок один.
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    const grid = screen.getByRole("grid");
    expect(grid.style.width).toBe("100%");
    expect(grid.style.flex).toBe("1 1 auto");
    // Tailwind-класс с basis 0% не должен вернуться следом за инлайновым flex.
    expect(grid.className).not.toMatch(/flex-1/);
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
      disciplineCounts: { stretch: 0, reading: 0 },
      monsterDrunk: null,
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

  it("колесо вверх листает назад, а страницу при этом не прокручивает", () => {
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
    const tile = screen.getByLabelText("Календарь");
    const consumed = !fireEvent.wheel(tile, { deltaY: -100 });
    expect(onShiftWeeks).toHaveBeenCalledWith(-1);
    expect(consumed).toBe(true);
  });

  it("дома колесо вниз не листает и не перехватывает прокрутку страницы", () => {
    // Вперёд от сегодня идти некуда — жест обязан уйти странице, как если бы плитки не было.
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
    const consumed = !fireEvent.wheel(screen.getByLabelText("Календарь"), { deltaY: 100 });
    expect(onShiftWeeks).not.toHaveBeenCalled();
    expect(consumed).toBe(false);
  });

  it("у генезиса колесо вверх молчит: листать назад уже некуда", () => {
    const onShiftWeeks = vi.fn();
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={onShiftWeeks}
        canGoBack={false}
      />,
    );
    fireEvent.wheel(screen.getByLabelText("Календарь"), { deltaY: -100 });
    expect(onShiftWeeks).not.toHaveBeenCalled();
  });

  it("в сдвинутом окне колесо вниз листает вперёд", () => {
    const onShiftWeeks = vi.fn();
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
      />,
    );
    fireEvent.wheel(screen.getByLabelText("Календарь"), { deltaY: 100 });
    expect(onShiftWeeks).toHaveBeenCalledWith(1);
  });

  it("мелкие дельты тачпада складываются в один шаг, а инерция после него глотается", () => {
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
    const tile = screen.getByLabelText("Календарь");
    for (let i = 0; i < 8; i++) fireEvent.wheel(tile, { deltaY: -20 });
    expect(onShiftWeeks).toHaveBeenCalledTimes(1);
  });

  it("без обработчика листания колесо ничего не перехватывает", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    const consumed = !fireEvent.wheel(screen.getByLabelText("Календарь"), { deltaY: -100 });
    expect(consumed).toBe(false);
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

describe("Calendar — редакция «поле» (§5.2)", () => {
  function renderField(days = buildWindow(), extra: Record<string, unknown> = {}) {
    return render(
      <Calendar
        days={days}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        edition="field"
        {...extra}
      />,
    );
  }

  it("базовая редакция поля не заводит — незнакомая волна не должна получить его случайно", () => {
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" edition="таблица" />,
    );
    expect(document.querySelector(".cal-grid--field")).toBeNull();
    // Рамка и заливка остаются инлайном, как в базе.
    expect(screen.getByTestId(`day-${TODAY}`).getAttribute("style")).toContain("border");
  });

  it("в поле клетка не несёт ни рамки, ни заливки — вид целиком за скином", () => {
    renderField();
    expect(document.querySelector(".cal-grid--field")).not.toBeNull();
    const style = screen.getByTestId(`day-${TODAY}`).getAttribute("style") ?? "";
    expect(style).not.toContain("border:");
    expect(style).not.toContain("background:");
  });

  it("клетка несёт вес дня переменной, а не готовым цветом", () => {
    renderField();
    // У «сегодня» доехали два канала из четырёх: шаги (8421 из 10000) и дисциплина
    // (оба пункта закрыты). Сна и вкладов нет — они честно тянут вес вниз.
    const today = screen.getByTestId(`day-${TODAY}`).getAttribute("style") ?? "";
    expect(today).toMatch(/--day-weight:\s*0\.461/);
  });

  it("у будущего дня и у пропуска вес нулевой", () => {
    renderField();
    for (const date of ["2026-06-20", GAP]) {
      const style = screen.getByTestId(`day-${date}`).getAttribute("style") ?? "";
      expect(style).toMatch(/--day-weight:\s*0\.000/);
    }
  });

  it("включённая линза гасит поле: свет и отметка не спорят за один тон", () => {
    renderField(buildWindow(), { lens: STRETCH_LENS, onLensChange: () => {} });
    expect(document.querySelector(".cal-grid--field[data-lens]")).not.toBeNull();
  });

  it("без линзы гасить нечего", () => {
    renderField();
    expect(document.querySelector(".cal-grid--field[data-lens]")).toBeNull();
  });

  it("точки «есть имя» в поле нет — на «доехал ли день» отвечает свет клетки", () => {
    renderField();
    expect(screen.queryByTestId(`name-mark-${TODAY}`)).toBeNull();
    // В базовой редакции точка остаётся: там свет не считается вовсе.
    render(
      <Calendar days={buildWindow()} selected={TODAY} today={TODAY} onSelect={() => {}} state="loaded" />,
    );
    expect(screen.getByTestId(`name-mark-${TODAY}`)).toBeInTheDocument();
  });

  it("нативной подсказки в поле нет, а сводка дня остаётся скринридеру", () => {
    renderField();
    const cell = screen.getByTestId(`day-${TODAY}`);
    expect(cell).not.toHaveAttribute("title");
    expect(cell.getAttribute("aria-label")).toContain("шаги");
  });
})

describe("Calendar — кромка вместо стрелок (§5.2)", () => {
  /** Окно на неделю шире сетки с каждого края — ровно то, что борд шлёт редакции «поле». */
  function buildWideWindow(today: string = TODAY): DaySummary[] {
    const { from, to } = weekWindowAround(today, 3, 2);
    return datesInRange(from, to).map((date) => ({
      date,
      title: null,
      hasData: date <= today && date !== GAP,
      steps: date <= today ? 5000 : null,
      sleepMinutes: null,
      contributions: null,
      disciplineCounts: { stretch: 1, reading: 0 },
      monsterDrunk: null,
    }));
  }

  function renderEdge(extra: Record<string, unknown> = {}) {
    const onShiftWeeks = vi.fn();
    const onSelect = vi.fn();
    const onFocusDay = vi.fn();
    render(
      <Calendar
        days={buildWideWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={onSelect}
        onFocusDay={onFocusDay}
        state="loaded"
        edition="field"
        edgeWeeks={1}
        onShiftWeeks={onShiftWeeks}
        onResetWindow={() => {}}
        {...extra}
      />,
    );
    return { onShiftWeeks, onSelect, onFocusDay };
  }

  it("клик по дню кромки забирает его в сетку, а не листает вслепую", async () => {
    const { onShiftWeeks, onFocusDay } = renderEdge();
    const cell = screen.getByTestId("calendar-edge-prev").querySelectorAll("button")[3];
    const date = cell.getAttribute("data-testid")?.replace("edge-day-", "");
    await userEvent.click(cell);
    expect(onFocusDay).toHaveBeenCalledWith(date);
    // Шаг на неделю такой гарантии не даёт: перенос месяца съедает ряд, и день остаётся
    // за краем сетки — ровно то, ради чего у жеста своя опора, а не листание.
    expect(onShiftWeeks).not.toHaveBeenCalled();
  });

  it("без обработчика «забрать в сетку» клик по кромке просто выбирает день", async () => {
    const { onSelect } = renderEdge({ onFocusDay: undefined });
    const cell = screen.getByTestId("calendar-edge-prev").querySelectorAll("button")[0];
    const date = cell.getAttribute("data-testid")?.replace("edge-day-", "");
    await userEvent.click(cell);
    expect(onSelect).toHaveBeenCalledWith(date);
  });

  it("нативной подсказки с диапазоном недели у кромки нет", () => {
    renderEdge();
    const edge = screen.getByTestId("calendar-edge-prev");
    expect(edge).not.toHaveAttribute("title");
    expect([...edge.querySelectorAll("button")].some((b) => b.hasAttribute("title"))).toBe(false);
  });

  it("недели кромок не попадают в сетку — высота сетки не зависит от них", () => {
    renderEdge();
    // Окно 42 дня: неделя уходит в хвостовую кромку, ещё две не влезают в потолок высоты
    // (§5.2) — в сетке остаются три ряда, две прошлые недели и текущая.
    expect(screen.getAllByRole("gridcell")).toHaveLength(21);
  });

  it("у каждого дня кромки своя кнопка: действия у них разные", () => {
    renderEdge();
    const edge = screen.getByTestId("calendar-edge-prev");
    expect(edge.tagName).not.toBe("BUTTON");
    expect(edge.querySelectorAll("button.cal-edge-cell")).toHaveLength(7);
  });

  it("клетки кромки несут вес дня — полоска светится, а не просто нумерует", () => {
    renderEdge();
    const cells = screen.getByTestId("calendar-edge-prev").querySelectorAll(".cal-edge-cell");
    const lit = [...cells].filter((c) =>
      /--day-weight:\s*0\.[1-9]/.test(c.getAttribute("style") ?? ""),
    );
    expect(lit.length).toBeGreaterThan(0);
  });

  it("в поле стрелок нет: шаг несёт кромка, глиф сказал бы то же дважды", () => {
    renderEdge({ anchor: "2026-06-04" });
    expect(screen.queryByTestId("calendar-prev")).toBeNull();
    expect(screen.queryByTestId("calendar-next")).toBeNull();
  });

  it("дома строка листания не рисуется вовсе — пустой ряд читался бы дырой", () => {
    renderEdge();
    expect(document.querySelector(".cal-nav")).toBeNull();
    expect(screen.queryByTestId("calendar-edge-next")).toBeNull();
  });

  it("у сдвинутого окна появляются кромка вперёд и возврат «сегодня»", async () => {
    const { onFocusDay } = renderEdge({ anchor: "2026-06-04" });
    expect(screen.getByTestId("calendar-home")).toBeTruthy();
    const next = screen.getByTestId("calendar-edge-next").querySelectorAll("button")[0];
    const date = next.getAttribute("data-testid")?.replace("edge-day-", "");
    await userEvent.click(next);
    expect(onFocusDay).toHaveBeenCalledWith(date);
  });

  it("у генезиса кромки назад нет, а её дни достаются сетке", () => {
    renderEdge({ canGoBack: false });
    expect(screen.queryByTestId("calendar-edge-prev")).toBeNull();
    expect(screen.getAllByRole("gridcell")).toHaveLength(35);
  });

  it("«сегодня» уходит из ярлыка на нижний край плитки — строка сверху не появляется", async () => {
    const onResetWindow = vi.fn();
    renderEdge({ anchor: "2026-06-04", onResetWindow });
    const home = screen.getByTestId("calendar-home");
    expect(home.className).toContain("cal-home-pill");
    // Ряда управления в ярлыке больше нет вовсе — ради этого таблетку вниз и уносили.
    expect(document.querySelector(".cal-nav")).toBeNull();
    await userEvent.click(home);
    expect(onResetWindow).toHaveBeenCalled();
  });

  it("«сегодня» возвращает и окно, и выбранный день", async () => {
    const onResetWindow = vi.fn();
    const { onSelect } = renderEdge({ anchor: "2026-06-04", selected: "2026-06-02", onResetWindow });
    await userEvent.click(screen.getByTestId("calendar-home"));
    expect(onResetWindow).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith(TODAY);
  });

  it("базовая редакция держит «сегодня» в строке листания", () => {
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        anchor="2026-06-04"
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={() => {}}
        onResetWindow={() => {}}
      />,
    );
    const home = screen.getByTestId("calendar-home");
    expect(home.className).toContain("cal-nav-home");
    expect(document.querySelector(".cal-nav")?.contains(home)).toBe(true);
  });

  it("«сегодня» базовой редакции возвращает выбранный день так же, как таблетка «поля»", async () => {
    const onResetWindow = vi.fn();
    const onSelect = vi.fn();
    render(
      <Calendar
        days={buildWindow()}
        selected="2026-06-02"
        today={TODAY}
        anchor="2026-06-04"
        onSelect={onSelect}
        state="loaded"
        onShiftWeeks={() => {}}
        onResetWindow={onResetWindow}
      />,
    );
    await userEvent.click(screen.getByTestId("calendar-home"));
    expect(onResetWindow).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith(TODAY);
  });

  it("базовая редакция кромок не заводит и стрелки сохраняет", () => {
    render(
      <Calendar
        days={buildWindow()}
        selected={TODAY}
        today={TODAY}
        onSelect={() => {}}
        state="loaded"
        onShiftWeeks={() => {}}
      />,
    );
    expect(screen.queryByTestId("calendar-edge-prev")).toBeNull();
    expect(screen.getByTestId("calendar-prev")).toBeTruthy();
  });
});

describe("Calendar — месяц с новой строки (§5.2)", () => {
  /** Среда сентября: окно захватывает стык, а 1 сентября 2026 приходится на вторник. */
  const SEP = "2026-09-15";

  /** Окно 2026-08-31 … 2026-09-27 — четыре недели, из которых август занял один день. */
  function crossWindow(): DaySummary[] {
    const { from, to } = weekWindowAround(SEP, 2, 1);
    return datesInRange(from, to).map((date) => ({
      date,
      title: null,
      hasData: date <= SEP,
      steps: null,
      sleepMinutes: null,
      contributions: null,
      disciplineCounts: undefined,
      monsterDrunk: null,
    }));
  }

  function renderCross(extra: Record<string, unknown> = {}) {
    return render(
      <Calendar
        days={crossWindow()}
        selected={SEP}
        today={SEP}
        onSelect={() => {}}
        state="loaded"
        edition="field"
        {...extra}
      />,
    );
  }

  it("первое число уезжает на новую строку — стык метит перенос, а не линия", () => {
    renderCross();
    // Понедельник 31 августа остаётся последним днём своей строки, вторник 1 сентября
    // начинает следующую и стоит в своей колонке дня недели.
    expect(screen.getByTestId("day-2026-08-31").getAttribute("style")).toContain("grid-row: 1");
    const first = screen.getByTestId("day-2026-09-01").getAttribute("style") ?? "";
    expect(first).toContain("grid-row: 2");
    expect(first).toContain("grid-column: 2");
    // Слоя линий в этой редакции нет вовсе.
    expect(document.querySelector(".cal-month-edges")).toBeNull();
  });

  it("имя месяца встаёт в пустой кусок перед ним, а не в клетку дня", () => {
    renderCross();
    const mark = screen.getByTestId("month-gap-2026-09-01");
    expect(mark).toHaveTextContent(/сентябрь/i);
    // Голова новой строки — один понедельник, имя ушло в широкий хвост прошлой:
    // шесть клеток, оставшихся от августа.
    expect(mark.getAttribute("style")).toContain("grid-row: 1");
    expect(mark.getAttribute("style")).toContain("grid-column: 2 / 8");
    expect(screen.queryByTestId("month-mark-2026-09-01")).toBeNull();
  });

  it("сетка вырастает на ряд: перенос стоит неделю слотов", () => {
    renderCross();
    const grid = document.querySelector(".cal-grid--field") as HTMLElement;
    expect(grid.style.gridTemplateRows).toContain("repeat(5");
    // Пропорция считается от того же числа строк — иначе сетка вылезла бы за плитку.
    expect(grid.style.aspectRatio).toBe("7 / 5");
  });

  it("с кромками перенос сетку не растит: верхняя строка уходит за край", () => {
    // Окно, которое борд шлёт редакции: две прошлые недели и текущая, плюс по неделе на
    // кромку с каждого края. Перенос добавляет строку, и лишней становится верхняя: высота
    // плитки не зависит от того, попал ли в окно стык месяцев.
    const { from, to } = weekWindowAround(SEP, 3, 1);
    const wide = datesInRange(from, to).map((date) => ({
      date,
      title: null,
      hasData: date <= SEP,
      steps: null,
      sleepMinutes: null,
      contributions: null,
      disciplineCounts: undefined,
      monsterDrunk: null,
    })) as DaySummary[];
    render(
      <Calendar
        days={wide}
        selected={SEP}
        today={SEP}
        onSelect={() => {}}
        state="loaded"
        edition="field"
        edgeWeeks={1}
        onShiftWeeks={() => {}}
      />,
    );
    const grid = document.querySelector(".cal-grid--field") as HTMLElement;
    expect(grid.style.gridTemplateRows).toContain("repeat(3");
    // 31 августа стояло один в срезанной строке — оно в одном шаге назад.
    expect(screen.queryByTestId("day-2026-08-31")).toBeNull();
    // Вместе со строкой уехал и её пустой кусок, поэтому месяц называет клетка.
    expect(screen.queryByTestId("month-gap-2026-09-01")).toBeNull();
    expect(screen.getByTestId("month-mark-2026-09-01")).toHaveTextContent(/сен/i);
  });

  it("ход окна метится направлением — по нему скин и рисует наплыв", () => {
    const { rerender } = renderCross({ anchor: SEP });
    const frame = () => document.querySelector(".tile-frame")?.getAttribute("data-roll");
    // Стоячее окно ничем не метится: наплыв — это событие, а не состояние.
    expect(frame()).toBeNull();

    rerender(
      <Calendar
        days={crossWindow()}
        selected={SEP}
        today={SEP}
        anchor="2026-09-08"
        onSelect={() => {}}
        state="loaded"
        edition="field"
      />,
    );
    expect(frame()).toBe("back");
  });

  it("базовая редакция наплыва не заводит", () => {
    const { rerender } = render(
      <Calendar days={crossWindow()} selected={SEP} today={SEP} anchor={SEP} onSelect={() => {}} state="loaded" />,
    );
    rerender(
      <Calendar days={crossWindow()} selected={SEP} today={SEP} anchor="2026-09-08" onSelect={() => {}} state="loaded" />,
    );
    expect(document.querySelector(".tile-frame")?.getAttribute("data-roll")).toBeNull();
  });

  it("базовая редакция переноса не заводит — стык там по-прежнему в слое линий", () => {
    render(
      <Calendar
        days={crossWindow()}
        selected={SEP}
        today={SEP}
        onSelect={() => {}}
        state="loaded"
      />,
    );
    expect(document.querySelector(".cal-month-edges")).not.toBeNull();
    expect(screen.getByTestId("day-2026-09-01").getAttribute("style")).not.toContain("grid-row");
    expect(screen.queryByTestId("month-gap-2026-09-01")).toBeNull();
  });
});
