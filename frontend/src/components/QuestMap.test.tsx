import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DisciplineItemView } from "@/lib/api/types";
import { QuestMap } from "./QuestMap";

function item(
  key: string,
  count: number,
  target: number,
  occurrenceStreaks?: number[],
): DisciplineItemView {
  return { key, label: key, icon: null, count, target, occurrenceStreaks };
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
    render(<QuestMap items={[]} monsterDone={false} />);

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
    expect(screen.getByTestId("quest-total")).toHaveTextContent("0/7");
  });

  it("остановка done по счётчику ≥ occurrence; иначе pending (два состояния, без missed)", () => {
    // чтение закрыто целиком (обе остановки), растяжка нет → растяжка «не сделано» = pending
    render(<QuestMap items={[item("reading", 2, 2), item("stretch", 0, 1)]} monsterDone={false} />);

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
    expect(screen.getByTestId("quest-total")).toHaveTextContent("2/7");
  });

  it("частичный прогресс пункта закрывает только первую его остановку", () => {
    render(<QuestMap items={[item("podcasts", 1, 2)]} monsterDone={false} />);
    expect(screen.getByTestId("quest-stop-podcasts-1")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("quest-stop-podcasts-2")).toHaveAttribute("data-done", "false");
  });

  it("дроби прогресса (для скинов со счётчиками): из данных пункта, фолбэк — по маршруту", () => {
    render(<QuestMap items={[item("podcasts", 1, 2)]} monsterDone={false} />);
    // обе остановки пункта показывают общий прогресс пункта
    expect(screen.getByTestId("quest-frac-podcasts-1")).toHaveTextContent("1/2");
    expect(screen.getByTestId("quest-frac-podcasts-2")).toHaveTextContent("1/2");
    // пункта нет в данных — target выводится из числа его остановок на маршруте
    expect(screen.getByTestId("quest-frac-reading-1")).toHaveTextContent("0/2");
    expect(screen.getByTestId("quest-frac-stretch-1")).toHaveTextContent("0/1");
    expect(screen.getByTestId("quest-frac-monster")).toHaveTextContent("0/1");
  });

  it("все 7 остановок закрыты — маршрут в perfect-подсветке (монстр не обязателен)", () => {
    render(<QuestMap items={ALL_DONE} monsterDone={false} />);
    expect(screen.getByTestId("quest-map").getAttribute("class")).toContain("quest-map--perfect");
    expect(screen.getByTestId("quest-total")).toHaveTextContent("7/7");
  });

  it("детур монстра отражает «пил/не пил»", () => {
    render(<QuestMap items={[]} monsterDone={true} />);
    expect(screen.getByTestId("quest-stop-monster")).toHaveAttribute("data-done", "true");
  });

  it("огонёк-стрик пункта: показывается от 2, по своей остановке (occurrence)", () => {
    // подкасты: серия ≥1 семь дней, ≥2 три дня → у остановки 1 огонёк 7, у остановки 2 — 3
    render(<QuestMap items={[item("podcasts", 2, 2, [7, 3])]} monsterDone={false} />);
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
        monsterDone={false}
      />,
    );
    // серия 1 — прячем
    expect(screen.queryByTestId("quest-streak-stretch-1")).toBeNull();
    // occurrenceStreaks нет вовсе (старый ответ/фикстура) — тоже прячем, без падения
    expect(screen.queryByTestId("quest-streak-journal-1")).toBeNull();
  });

  it("щит-стрик монстра: «дней чисто» от 2, иначе скрыт", () => {
    const { rerender } = render(
      <QuestMap items={[]} monsterDone={false} monsterCleanStreak={12} />,
    );
    expect(screen.getByTestId("quest-streak-monster")).toHaveTextContent("12");
    expect(screen.getByTestId("quest-streak-monster")).toHaveAttribute(
      "aria-label",
      "без монстра: 12 дней подряд",
    );

    rerender(<QuestMap items={[]} monsterDone={false} monsterCleanStreak={1} />);
    expect(screen.queryByTestId("quest-streak-monster")).toBeNull();
  });
});
