import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DisciplineItemView } from "@/lib/api/types";
import { QuestMap } from "./QuestMap";

function item(
  key: string,
  count: number,
  target: number,
  occurrenceStreaks?: number[],
  measuredMinutes?: number | null,
): DisciplineItemView {
  return { key, label: key, icon: null, count, target, occurrenceStreaks, measuredMinutes };
}

const ALL_DONE: DisciplineItemView[] = [
  item("stretch", 1, 1),
  item("podcasts", 2, 2),
  item("office", 1, 1),
  item("reading", 2, 2),
  item("journal", 1, 1),
];

describe("QuestMap", () => {
  it("рендерит 7 остановок маршрута, детур монстра и итог дня", () => {
    render(<QuestMap items={[]} monsterDrunk={false} />);

    // пункты с target=2 дают две остановки (occurrence 1 и 2)
    for (const id of [
      "quest-stop-stretch-1",
      "quest-stop-podcasts-1",
      "quest-stop-office-1",
      "quest-stop-reading-1",
      "quest-stop-podcasts-2",
      "quest-stop-reading-2",
      "quest-stop-journal-1",
      "quest-stop-monster",
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    // Итога дня «N/7» на карте нет (решение владельца): счёт читается самой тропой.
    expect(screen.queryByTestId("quest-total")).not.toBeInTheDocument();
  });

  it("остановка done по счётчику ≥ occurrence; иначе pending (два состояния, без missed)", () => {
    // чтение закрыто целиком (обе остановки), растяжка нет → растяжка «не сделано» = pending
    render(<QuestMap items={[item("reading", 2, 2), item("stretch", 0, 1)]} monsterDrunk={false} />);

    expect(screen.getByTestId("quest-stop-reading-1")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("quest-stop-reading-2")).toHaveAttribute("data-done", "true");
    const stretch = screen.getByTestId("quest-stop-stretch-1");
    expect(stretch).toHaveAttribute("data-done", "false");
    // «пропущено» (missed) больше не выделяем — всё несделанное = pending
    expect(stretch.getAttribute("class")).toContain("quest-stop--pending");
    expect(stretch.getAttribute("class")).not.toContain("quest-stop--missed");
    expect(screen.getByTestId("quest-stop-journal-1").getAttribute("class")).toContain(
      "quest-stop--pending",
    );
    expect(screen.queryByTestId("quest-total")).not.toBeInTheDocument();
  });

  it("частичный прогресс пункта закрывает только первую его остановку", () => {
    render(<QuestMap items={[item("podcasts", 1, 2)]} monsterDrunk={false} />);
    expect(screen.getByTestId("quest-stop-podcasts-1")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("quest-stop-podcasts-2")).toHaveAttribute("data-done", "false");
  });

  it("дроби прогресса (для скинов со счётчиками): из данных пункта, фолбэк — по маршруту", () => {
    render(<QuestMap items={[item("podcasts", 1, 2)]} monsterDrunk={false} />);
    // обе остановки пункта показывают общий прогресс пункта
    expect(screen.getByTestId("quest-frac-podcasts-1")).toHaveTextContent("1/2");
    expect(screen.getByTestId("quest-frac-podcasts-2")).toHaveTextContent("1/2");
    // пункта нет в данных — target выводится из числа его остановок на маршруте
    expect(screen.getByTestId("quest-frac-reading-1")).toHaveTextContent("0/2");
    expect(screen.getByTestId("quest-frac-stretch-1")).toHaveTextContent("0/1");
  });

  it("измеренные минуты вытесняют дробь у своей остановки", () => {
    render(
      <QuestMap items={[item("journal", 1, 1, undefined, 23)]} monsterDrunk={false} />,
    );
    expect(screen.getByTestId("quest-minutes-journal-1")).toHaveTextContent("23 мин");
    // дробь `1/1` у бинарного пункта не сообщает ничего сверх кольца — её место и занимаем
    expect(screen.queryByTestId("quest-frac-journal-1")).not.toBeInTheDocument();
    // соседние пункты не измеряются — у них дробь на месте
    expect(screen.getByTestId("quest-frac-stretch-1")).toBeInTheDocument();
  });

  it("минуты показываются и когда порог не взят — они объясняют пустую остановку", () => {
    render(
      <QuestMap items={[item("journal", 0, 1, undefined, 6)]} monsterDrunk={false} />,
    );
    expect(screen.getByTestId("quest-stop-journal-1")).toHaveAttribute("data-done", "false");
    expect(screen.getByTestId("quest-minutes-journal-1")).toHaveTextContent("6 мин");
  });

  it("без измерения строка остаётся дробью (ручная отметка, старые дни)", () => {
    render(<QuestMap items={[item("journal", 1, 1)]} monsterDrunk={false} />);
    expect(screen.queryByTestId("quest-minutes-journal-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("quest-frac-journal-1")).toHaveTextContent("1/1");
  });

  it("измеренный ноль — это не «не мерили»: цифра рисуется", () => {
    render(<QuestMap items={[item("journal", 0, 1, undefined, 0)]} monsterDrunk={false} />);
    expect(screen.getByTestId("quest-minutes-journal-1")).toHaveTextContent("0 мин");
  });

  it("все 7 остановок закрыты — маршрут в perfect-подсветке (монстр не обязателен)", () => {
    render(<QuestMap items={ALL_DONE} monsterDrunk={false} />);
    expect(screen.getByTestId("quest-map").getAttribute("class")).toContain("quest-map--perfect");
    // Празднование живёт классом маршрута, а не цифрой: итога на карте больше нет.
    expect(screen.queryByTestId("quest-total")).not.toBeInTheDocument();
  });

  it("детур монстра отражает «пил/не пил»", () => {
    render(<QuestMap items={[]} monsterDrunk={true} />);
    expect(screen.getByTestId("quest-stop-monster")).toHaveAttribute("data-done", "true");
  });

  it("подпись монстра называет вердикт словами, а не одним словом «монстр»", () => {
    const { rerender } = render(<QuestMap items={[]} monsterDrunk={true} />);
    expect(screen.getByTestId("quest-monster-verdict")).toHaveTextContent("пил монстр");

    rerender(<QuestMap items={[]} monsterDrunk={false} />);
    expect(screen.getByTestId("quest-monster-verdict")).toHaveTextContent("не пил монстр");
  });

  it("глагол вердикта красится своим токеном: «не пил» зелёным, «пил» тревожным", () => {
    const verb = (drunk: boolean) => {
      const { unmount } = render(<QuestMap items={[]} monsterDrunk={drunk} />);
      const style = screen.getByTestId("quest-monster-verb").getAttribute("style") ?? "";
      unmount();
      return style;
    };
    expect(verb(false)).toContain("--accent-clean");
    expect(verb(true)).toContain("--danger");
  });

  it("детур не притворяется пунктом дисциплины: у монстра свои состояния clean/drunk", () => {
    // Регрессионный якорь полярности: выпитый монстр закрывал детур как «сделано» —
    // кольцо и тропа красились как достижение, хотя достижением был чистый день.
    const { rerender } = render(<QuestMap items={[]} monsterDrunk={true} />);
    let stop = screen.getByTestId("quest-stop-monster");
    expect(stop.getAttribute("class")).toContain("quest-stop--drunk");
    expect(stop.getAttribute("class")).not.toContain("quest-stop--done");

    rerender(<QuestMap items={[]} monsterDrunk={false} />);
    stop = screen.getByTestId("quest-stop-monster");
    expect(stop.getAttribute("class")).toContain("quest-stop--clean");
    // «Не пил» — это не «ещё не дошёл»: серым пунктиром незакрытого пункта не рисуем.
    expect(stop.getAttribute("class")).not.toContain("quest-stop--pending");
  });

  it("к монстру не ведёт тропа: он стоит отдельно от маршрута, без стрелки", () => {
    // Решение владельца: детур-ответвление снято совсем. Любая тропа к монстру говорила о
    // нём как об этапе дня («сходил туда»), а раскрасить её было нечем — «пройденная»
    // хвалила за выпитое, «непройденная» ругала за чистый день.
    const { rerender } = render(<QuestMap items={[]} monsterDrunk={true} />);
    expect(screen.queryByTestId("quest-seg-monster")).toBeNull();

    rerender(<QuestMap items={[]} monsterDrunk={false} />);
    expect(screen.queryByTestId("quest-seg-monster")).toBeNull();
    // Сегментов ровно столько, сколько промежутков между 7 остановками маршрута.
    expect(document.querySelectorAll(".quest-seg")).toHaveLength(6);
  });

  it("дроби «1/1» у монстра нет: она читалась как закрытый пункт, а вердикт словами точнее", () => {
    render(<QuestMap items={[]} monsterDrunk={true} />);
    expect(screen.queryByTestId("quest-frac-monster")).toBeNull();
  });

  it("нет данных за день — монстр серый, как любая незакрытая остановка, и без вердикта", () => {
    render(<QuestMap items={[]} monsterDrunk={null} />);
    // Подпись — просто «монстр», никакого глагола: отсутствие записи не выдаём за чистый день.
    expect(screen.getByTestId("quest-monster-verdict")).toHaveTextContent(/^монстр$/);
    expect(screen.queryByTestId("quest-monster-verb")).toBeNull();
    // Картинка — ровно как у остальных незакрытых пунктов маршрута.
    const stop = screen.getByTestId("quest-stop-monster");
    expect(stop.getAttribute("class")).toContain("quest-stop--pending");
    expect(stop.getAttribute("class")).not.toContain("quest-stop--clean");
    expect(stop.getAttribute("class")).not.toContain("quest-stop--drunk");
  });

  it("запись за день есть, вкуса нет — это честное «не пил», а не «нет данных»", () => {
    render(<QuestMap items={[]} monsterDrunk={false} />);
    expect(screen.getByTestId("quest-monster-verdict")).toHaveTextContent("не пил монстр");
    expect(screen.getByTestId("quest-stop-monster").getAttribute("class")).toContain(
      "quest-stop--clean",
    );
  });

  it("описание карты и без данных не врёт: «нет данных о монстре», а не «не пил»", () => {
    render(<QuestMap items={[]} monsterDrunk={null} />);
    expect(screen.getByTestId("quest-map")).toHaveAttribute(
      "aria-label",
      "Дисциплина: 0 из 7, нет данных о монстре",
    );
  });

  it("описание карты всегда называет монстра — и чистый день тоже", () => {
    // Раньше про чистый день карта молчала, и для скринридера «не пил» было неотличимо
    // от «данных нет».
    const { rerender } = render(<QuestMap items={[]} monsterDrunk={false} />);
    expect(screen.getByTestId("quest-map")).toHaveAttribute(
      "aria-label",
      "Дисциплина: 0 из 7, не пил монстр",
    );

    rerender(<QuestMap items={ALL_DONE} monsterDrunk={true} />);
    expect(screen.getByTestId("quest-map")).toHaveAttribute(
      "aria-label",
      "Дисциплина: 7 из 7, пил монстр",
    );
  });

  it("огонёк-стрик пункта: показывается от 2, по своей остановке (occurrence)", () => {
    // подкасты: серия ≥1 семь дней, ≥2 три дня → у остановки 1 огонёк 7, у остановки 2 — 3
    render(<QuestMap items={[item("podcasts", 2, 2, [7, 3])]} monsterDrunk={false} />);
    expect(screen.getByTestId("quest-streak-podcasts-1")).toHaveTextContent("7");
    expect(screen.getByTestId("quest-streak-podcasts-2")).toHaveTextContent("3");
    // тултип поясняет С ЧЕМ и сколько дней подряд (нативный SVG <title> = accessible-имя)
    expect(screen.getByTestId("quest-streak-podcasts-1")).toHaveAttribute(
      "aria-label",
      "подкаст: 7 дней подряд",
    );
  });

  it("стрик < 2 и без данных о стрике — значок не рисуется (шум на карте)", () => {
    render(
      <QuestMap
        items={[item("stretch", 1, 1, [1]), item("journal", 1, 1)]}
        monsterDrunk={false}
      />,
    );
    // серия 1 — прячем
    expect(screen.queryByTestId("quest-streak-stretch-1")).toBeNull();
    // occurrenceStreaks нет вовсе (старый ответ/фикстура) — тоже прячем, без падения
    expect(screen.queryByTestId("quest-streak-journal-1")).toBeNull();
  });

  it("огонёк-стрик монстра: «дней чисто» от 2, иначе скрыт", () => {
    const { rerender } = render(
      <QuestMap items={[]} monsterDrunk={false} monsterCleanStreak={12} />,
    );
    expect(screen.getByTestId("quest-streak-monster")).toHaveTextContent("12");
    // Формулировка та же, что в подписи детура и в сводке календаря — один словарь на факт.
    expect(screen.getByTestId("quest-streak-monster")).toHaveAttribute(
      "aria-label",
      "не пил монстр: 12 дней подряд",
    );
    // Огонёк «чисто» горит зелёным — тем же цветом, что и вердикт под ним.
    expect(screen.getByTestId("quest-streak-monster").getAttribute("class")).toContain(
      "quest-streak--clean",
    );

    rerender(<QuestMap items={[]} monsterDrunk={false} monsterCleanStreak={1} />);
    expect(screen.queryByTestId("quest-streak-monster")).toBeNull();
  });
});

describe("QuestMap — линза календаря", () => {
  it("без обработчика остановки не интерактивны (карта прежняя)", () => {
    render(<QuestMap items={ALL_DONE} monsterDrunk={false} />);
    const stop = screen.getByTestId("quest-stop-stretch-1");
    expect(stop).not.toHaveAttribute("role", "button");
    expect(stop).not.toHaveAttribute("aria-pressed");
  });

  it("клик по остановке включает линзу этой остановки (ключ + occurrence)", async () => {
    const onLensChange = vi.fn();
    render(<QuestMap items={ALL_DONE} monsterDrunk={false} onLensChange={onLensChange} />);

    await userEvent.click(screen.getByTestId("quest-stop-podcasts-2"));
    expect(onLensChange).toHaveBeenCalledWith({ key: "podcasts", occurrence: 2, label: "подкаст" });
  });

  it("повторный клик по выбранной остановке снимает линзу", async () => {
    const onLensChange = vi.fn();
    render(
      <QuestMap
        items={ALL_DONE}
        monsterDrunk={false}
        lens={{ key: "stretch", occurrence: 1, label: "растяжка" }}
        onLensChange={onLensChange}
      />,
    );
    await userEvent.click(screen.getByTestId("quest-stop-stretch-1"));
    expect(onLensChange).toHaveBeenCalledWith(null);
  });

  it("выбранная остановка приподнята и озвучена; соседняя — нет", () => {
    render(
      <QuestMap
        items={ALL_DONE}
        monsterDrunk={false}
        lens={{ key: "reading", occurrence: 2, label: "чтение" }}
        onLensChange={() => {}}
      />,
    );
    const focused = screen.getByTestId("quest-stop-reading-2");
    expect(focused).toHaveAttribute("data-focused", "true");
    expect(focused.getAttribute("class")).toContain("quest-stop--focused");
    expect(focused).toHaveAttribute("aria-pressed", "true");

    // первая остановка того же ПУНКТА — отдельная линза, не подсвечена
    const sibling = screen.getByTestId("quest-stop-reading-1");
    expect(sibling).not.toHaveAttribute("data-focused");
    expect(sibling).toHaveAttribute("aria-pressed", "false");
  });

  it("монстр тоже включает линзу — со своим ключом", async () => {
    const onLensChange = vi.fn();
    render(<QuestMap items={[]} monsterDrunk={true} onLensChange={onLensChange} />);
    await userEvent.click(screen.getByTestId("quest-stop-monster"));
    expect(onLensChange).toHaveBeenCalledWith({ key: "monster", occurrence: 1, label: "монстр" });
  });

  it("кнопка-детур озвучивает вердикт: aria-label кнопки перекрывает подпись, и без него «пил/не пил» до скринридера не доходит", async () => {
    render(<QuestMap items={[]} monsterDrunk={true} onLensChange={() => {}} />);
    expect(screen.getByTestId("quest-stop-monster")).toHaveAttribute(
      "aria-label",
      "пил монстр: показать в календаре",
    );
  });

  it("остановка доступна с клавиатуры (Enter)", async () => {
    const onLensChange = vi.fn();
    render(<QuestMap items={ALL_DONE} monsterDrunk={false} onLensChange={onLensChange} />);
    const stop = screen.getByTestId("quest-stop-office-1");
    stop.focus();
    await userEvent.keyboard("{Enter}");
    expect(onLensChange).toHaveBeenCalledWith({ key: "office", occurrence: 1, label: "офис" });
  });
});
