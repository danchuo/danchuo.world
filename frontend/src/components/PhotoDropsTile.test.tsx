import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoDropsTile } from "./PhotoDropsTile";

vi.mock("@/lib/api/client", () => ({ getDrops: vi.fn(), getDrop: vi.fn() }));
import { getDrop, getDrops } from "@/lib/api/client";
const getDropsMock = vi.mocked(getDrops);
const getDropMock = vi.mocked(getDrop);

const TWO_DROPS = [
  { id: 2, title: "Июльская плёнка", droppedOn: "2026-07-02", monthLabel: "июль 2026", photoCount: 12, coverPhotoUrl: "/api/film-media/2/0/thumb" },
  { id: 1, title: "Июньская плёнка", droppedOn: "2026-06-10", monthLabel: "июнь 2026", photoCount: 36, coverPhotoUrl: "/api/film-media/1/0/thumb" },
];

afterEach(() => vi.clearAllMocks());

describe("PhotoDropsTile (компактная лента)", () => {
  it("нет дропов → пустое состояние «пока нет дропов»", async () => {
    getDropsMock.mockResolvedValue([]);
    render(<PhotoDropsTile />);
    expect(await screen.findByText("пока нет дропов")).toBeInTheDocument();
  });

  it("есть дропы → перечисляет все (сама лента и есть архив)", async () => {
    getDropsMock.mockResolvedValue([
      { id: 2, title: "Июльская плёнка", droppedOn: "2026-07-02", monthLabel: "июль 2026", photoCount: 12, coverPhotoUrl: "/api/film-media/2/0/thumb" },
      { id: 1, title: "Июньская плёнка", droppedOn: "2026-06-10", monthLabel: "июнь 2026", photoCount: 36, coverPhotoUrl: "/api/film-media/1/0/thumb" },
    ]);

    render(<PhotoDropsTile />);

    expect(await screen.findByText("Июльская плёнка")).toBeInTheDocument();
    expect(screen.getByText("Июньская плёнка")).toBeInTheDocument();
  });

  /**
   * Полоса прокрутки у обеих лент — БЕЗ визуала (замечание владельца: вертикальный ползунок
   * в дропах на волне 02 читался лишним элементом интерфейса поверх карточек). Прокрутка
   * колесом, тачпадом и с клавиатуры остаётся: `overflow` на месте, снят только ползунок.
   * Класс общий (`scroll-invisible` в common.css) — inline-стилем это волна не переопределит.
   */
  it("ползунок прокрутки не рисуется ни в вертикальном списке, ни в горизонтальной полке", async () => {
    getDropsMock.mockResolvedValue(TWO_DROPS);
    const { container, rerender } = render(<PhotoDropsTile />);
    await screen.findByText("Июльская плёнка");
    const list = container.querySelector("ul") as HTMLElement;
    expect(list).toHaveClass("scroll-invisible");
    expect(list.className).toContain("overflow-y-auto");
    expect(list.style.scrollbarWidth).toBe("");

    rerender(<PhotoDropsTile orientation="horizontal" />);
    const shelf = container.querySelector("ul") as HTMLElement;
    expect(shelf).toHaveClass("scroll-invisible");
    expect(shelf.style.scrollbarWidth).toBe("");
  });

  it("горизонтальная полка (orientation=horizontal) — карточки с названием и месяцем", async () => {
    getDropsMock.mockResolvedValue([
      { id: 2, title: "Июльская плёнка", droppedOn: "2026-07-02", monthLabel: "июль 2026", photoCount: 12, coverPhotoUrl: "/api/film-media/2/0/thumb" },
      { id: 1, title: "Июньская плёнка", droppedOn: "2026-06-10", monthLabel: "июнь 2026", photoCount: 36, coverPhotoUrl: "/api/film-media/1/0/thumb" },
    ]);

    render(<PhotoDropsTile orientation="horizontal" />);

    // Название читается целиком (двухстрочный клэмп, не однострочный обруб) + месяц под ним.
    expect(await screen.findByText("Июльская плёнка")).toBeInTheDocument();
    expect(screen.getByText("июль 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Открыть дроп «Июньская плёнка»" })).toBeInTheDocument();
  });

  it("живой скролл: вертикальное колесо мыши листает полку вбок", async () => {
    getDropsMock.mockResolvedValue(TWO_DROPS);
    const { container } = render(<PhotoDropsTile orientation="horizontal" />);
    await screen.findByText("Июльская плёнка");

    const shelf = container.querySelector("ul")!;
    // jsdom не считает раскладку — подставляем переполнение, чтобы полке было куда листаться.
    Object.defineProperty(shelf, "scrollWidth", { configurable: true, value: 500 });
    Object.defineProperty(shelf, "clientWidth", { configurable: true, value: 100 });

    expect(shelf.scrollLeft).toBe(0);
    fireEvent.wheel(shelf, { deltaY: 40, deltaX: 0 });
    expect(shelf.scrollLeft).toBe(40);
  });

  it("клик по дропу открывает его на весь экран (drag-перехвата больше нет)", async () => {
    // Регрессионный якорь: перетаскивание мышью раньше глотало клик и ломало открытие дропа.
    // Драга нет — клик по карточке полки обязан открывать модалку (грузит кадры).
    getDropsMock.mockResolvedValue(TWO_DROPS);
    getDropMock.mockResolvedValue([]);
    render(<PhotoDropsTile orientation="horizontal" />);
    await screen.findByText("Июньская плёнка");

    fireEvent.click(screen.getByRole("button", { name: "Открыть дроп «Июньская плёнка»" }));
    expect(getDropMock).toHaveBeenCalledWith(1, expect.anything());
  });
});
