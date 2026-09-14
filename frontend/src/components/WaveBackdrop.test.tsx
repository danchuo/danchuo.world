import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DaySummary } from "@/lib/api/types";
import { WaveBackdrop } from "./WaveBackdrop";

const TODAY = "2026-09-02";

function day(over: Partial<DaySummary> = {}): DaySummary {
  return {
    date: "2026-08-24",
    title: "тихий понедельник",
    hasData: true,
    steps: 8340,
    sleepMinutes: 432,
    contributions: 3,
    monsterDrunk: null,
    ...over,
  };
}

/** Ленту в разметке ищем по её узлу, а не по тексту: текст ставит эффект императивно. */
function ribbonOf(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>(".wave-backdrop-ribbon");
  if (!el) throw new Error("шов фона не отрендерил ленту");
  return el;
}

/**
 * Стена в jsdom: вёрстки нет, поэтому обе меры подменяем. Замер ширины знака в jsdom тоже
 * не состоится (проба меряется нулём) — шов падает на моноширинную оценку по кеглю, и это
 * ровно тот путь, которым он пойдёт в скрытом табе. Модель грубая намеренно: проверяем не
 * раскладку, а то, что строк ХВАТАЕТ на всю высоту стены.
 */
function mockWall(height: number, width = 1000): () => void {
  const proto = HTMLElement.prototype;
  const client = Object.getOwnPropertyDescriptor(proto, "clientHeight");
  const clientW = Object.getOwnPropertyDescriptor(proto, "clientWidth");
  Object.defineProperty(proto, "clientHeight", { configurable: true, get: () => height });
  Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => width });
  return () => {
    Object.defineProperty(proto, "clientHeight", client ?? { configurable: true, value: 0 });
    Object.defineProperty(proto, "clientWidth", clientW ?? { configurable: true, value: 0 });
  };
}

/** Самый широкий правдоподобный межстрочный интервал — верхняя оценка для счёта строк. */
const MAX_LEADING_PX = 30;

let restoreWall: (() => void) | null = null;
afterEach(() => {
  restoreWall?.();
  restoreWall = null;
});

describe("WaveBackdrop", () => {
  it("шов рендерится всегда — волна включает его скином, а не наличием разметки", () => {
    const { container } = render(<WaveBackdrop summaries={[]} today={TODAY} wave="wave-01" />);
    const root = container.querySelector(".wave-backdrop");
    expect(root).not.toBeNull();
    // Фон — не контент: скринридер его не читает.
    expect(root).toHaveAttribute("aria-hidden", "true");
  });

  it("кладёт в ленту прожитые дни окна календаря", () => {
    const { container } = render(<WaveBackdrop summaries={[day()]} today={TODAY} wave="wave-03" />);
    expect(ribbonOf(container).textContent).toBe(
      "пн 24.08 · тихий понедельник · сон 7ч 12м · шаги 8 340 · git +3",
    );
  });

  it("окно без данных не оставляет на холсте мусора", () => {
    const { container } = render(<WaveBackdrop summaries={[]} today={TODAY} wave="wave-03" />);
    expect(ribbonOf(container).textContent).toBe("");
  });

  it("закрывает стену целиком, даже когда она в сотни раз выше ленты (зум наружу)", () => {
    // 60 000 против ленты в полсотни символов — тысяча повторов. Линейный шаг «ещё один
    // дубль за проход» упирался в свой потолок задолго до края, и низ холста оставался пустым.
    restoreWall = mockWall(60_000);
    const { container } = render(<WaveBackdrop summaries={[day()]} today={TODAY} wave="wave-03" />);
    const lines = ribbonOf(container).querySelectorAll(".wave-backdrop-line");
    expect(lines.length).toBeGreaterThanOrEqual(Math.ceil(60_000 / MAX_LEADING_PX));
  });

  /**
   * Выключка через строку — правило волны, но возможна она только потому, что КАЖДАЯ строка
   * приезжает своим узлом: `text-align` в CSS правит абзац целиком, а не отдельную строку.
   * Поэтому разбиение — обязательство шва, и проверяется здесь, а не глазами на борде.
   */
  it("ломает ленту на строки-узлы, чтобы волна могла выключать их по очереди", () => {
    restoreWall = mockWall(600);
    const { container } = render(<WaveBackdrop summaries={[day()]} today={TODAY} wave="wave-03" />);
    const lines = ribbonOf(container).querySelectorAll<HTMLElement>(".wave-backdrop-line");
    expect(lines.length).toBeGreaterThan(1);
    const lengths = [...lines].map((line) => (line.textContent ?? "").length);
    // Пустых строк нет, и строки одной длины с точностью до слова: перенос считает шов по
    // ширине, а не браузер по своему усмотрению. Точную длину тест не знает намеренно — она
    // зависит от замера знака, а проверяется здесь СВОЙСТВО разбиения, не его арифметика.
    expect(Math.min(...lengths)).toBeGreaterThan(0);
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(24);
  });

  it("новое окно календаря переписывает ленту, а не дописывает её", () => {
    const { container, rerender } = render(
      <WaveBackdrop summaries={[day()]} today={TODAY} wave="wave-03" />,
    );
    rerender(
      <WaveBackdrop
        summaries={[day({ date: "2026-08-25", title: "день длинных созвонов" })]}
        today={TODAY}
        wave="wave-03"
      />,
    );
    const text = ribbonOf(container).textContent ?? "";
    expect(text).toContain("день длинных созвонов");
    expect(text).not.toContain("тихий понедельник");
  });
  /**
   * Лента режется по ЗАМЕРУ знака, а системное начертание и шрифт волны меряются по-разному:
   * посчитанная до шрифта раскладка не достаёт до края. Сигнал пересчёта — ворота шрифта
   * (`fontGate.ts`), а не `document.fonts.ready`: у ворот учтён и потолок ожидания, и то,
   * что до первой раскладки набор шрифтов пуст и отвечает «готов» мгновенно.
   */
  it("пересобирает ленту, когда открылись ворота шрифта", async () => {
    restoreWall = mockWall(600);
    document.documentElement.setAttribute("data-fonts", "pending");
    const { container } = render(<WaveBackdrop summaries={[day()]} today={TODAY} wave="wave-03" />);
    const ribbon = ribbonOf(container);
    const before = ribbon.querySelectorAll(".wave-backdrop-line").length;

    // Шрифт приехал — стена та же, а знак стал у́же: строк должно стать больше.
    restoreWall?.();
    restoreWall = mockWall(900);
    document.documentElement.setAttribute("data-fonts", "ready");

    await waitFor(() =>
      expect(ribbon.querySelectorAll(".wave-backdrop-line").length).toBeGreaterThan(before),
    );
    document.documentElement.removeAttribute("data-fonts");
  });
});
