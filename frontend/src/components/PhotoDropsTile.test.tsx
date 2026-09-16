import { act, fireEvent, render, screen } from "@testing-library/react";
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

/**
 * jsdom does not load pictures: `complete` is always false and `naturalWidth` zero. To check the
 * behaviour with an ALREADY loaded cover (browser cache, a reused node) both properties are
 * stubbed on the prototype and restored after the test.
 */
const IMG_PROTO = window.HTMLImageElement.prototype;
const NATIVE_IMG_PROPS = {
  complete: Object.getOwnPropertyDescriptor(IMG_PROTO, "complete")!,
  naturalWidth: Object.getOwnPropertyDescriptor(IMG_PROTO, "naturalWidth")!,
};
function pretendCoversLoaded() {
  Object.defineProperty(IMG_PROTO, "complete", { configurable: true, get: () => true });
  Object.defineProperty(IMG_PROTO, "naturalWidth", { configurable: true, get: () => 800 });
}

afterEach(() => {
  Object.defineProperty(IMG_PROTO, "complete", NATIVE_IMG_PROPS.complete);
  Object.defineProperty(IMG_PROTO, "naturalWidth", NATIVE_IMG_PROPS.naturalWidth);
  vi.clearAllMocks();
});

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
   * Neither ribbon draws a scrollbar: on a card stack the thumb read as a stray piece of interface
   * over the cards. Scrolling by wheel, trackpad and keyboard stays — `overflow` is intact, only
   * the thumb is gone, through a shared class a wave cannot override with an inline style.
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

    // The title reads in full (a two-line clamp, not a one-line cut) with the month below it.
    expect(await screen.findByText("Июльская плёнка")).toBeInTheDocument();
    expect(screen.getByText("июль 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Открыть дроп «Июньская плёнка»" })).toBeInTheDocument();
  });

  it("живой скролл: вертикальное колесо мыши листает полку вбок", async () => {
    getDropsMock.mockResolvedValue(TWO_DROPS);
    const { container } = render(<PhotoDropsTile orientation="horizontal" />);
    await screen.findByText("Июльская плёнка");

    // The wheel handler is attached by an effect, and React's passive effects arrive in their own
    // task: `findByText` fires on a DOM mutation and may return BEFORE the shelf starts listening.
    // The empty `act` waits for that explicitly, or the test races and fails under load.
    await act(async () => {});
    const shelf = container.querySelector("ul")!;
    // jsdom does not lay out — we fake the overflow so the shelf has somewhere to scroll.
    Object.defineProperty(shelf, "scrollWidth", { configurable: true, value: 500 });
    Object.defineProperty(shelf, "clientWidth", { configurable: true, value: 100 });

    expect(shelf.scrollLeft).toBe(0);
    fireEvent.wheel(shelf, { deltaY: 40, deltaX: 0 });
    expect(shelf.scrollLeft).toBe(40);
  });

  /**
   * The `spines` edition (DESIGN §7.5, §10.2): drops stand in a stack like boxes of film on a
   * shelf. The type is UPRIGHT (no `writing-mode`), with title and month on one line per spine.
   */
  it("редакция carousel — вертикальная лента кадров, у каждого название и месяц", async () => {
    getDropsMock.mockResolvedValue(TWO_DROPS);
    const { container } = render(<PhotoDropsTile edition="carousel" />);
    await screen.findByText("Июльская плёнка");

    const reel = container.querySelector(".drop-carousel") as HTMLElement;
    expect(reel).toBeInTheDocument();
    expect(container.querySelectorAll(".drop-carousel__slot")).toHaveLength(2);
    expect(screen.getByText("июль 2026")).toBeInTheDocument();
    expect(screen.getByText("июнь 2026")).toBeInTheDocument();
    // The ribbon scrolls by the same gesture and without a thumb, like both earlier ribbons.
    expect(reel).toHaveClass("scroll-invisible");
  });

  it("редакция carousel — клик по кадру открывает дроп на весь экран", async () => {
    getDropsMock.mockResolvedValue(TWO_DROPS);
    getDropMock.mockResolvedValue([]);
    render(<PhotoDropsTile edition="carousel" />);
    await screen.findByText("Июньская плёнка");

    fireEvent.click(screen.getByRole("button", { name: "Открыть дроп «Июньская плёнка»" }));
    expect(getDropMock).toHaveBeenCalledWith(1, expect.anything());
  });

  /**
   * The first visit to a drop meets its COVER — the frame shown on the ribbon card, not the roll's
   * first frame: a click asks about the frame being looked at (DESIGN §7.5). After that its place
   * is taken by the frame the gallery was closed on (`viewed`).
   */
  it("редакция carousel — плёнка открывается на обложке дропа, а не с первого кадра", async () => {
    getDropsMock.mockResolvedValue(TWO_DROPS);
    getDropMock.mockResolvedValue([
      { imageUrl: "/api/film-media/1/9/web", thumbUrl: "/api/film-media/1/9/thumb", width: 1600, height: 1083, artifacts: [] },
      { imageUrl: "/api/film-media/1/5/web", thumbUrl: "/api/film-media/1/5/thumb", width: 1600, height: 1083, artifacts: [] },
      // The cover is the drop's THIRD frame: frame order does not govern it.
      { imageUrl: "/api/film-media/1/0/web", thumbUrl: "/api/film-media/1/0/thumb", width: 1600, height: 1083, artifacts: [] },
    ]);
    render(<PhotoDropsTile edition="carousel" gallery="roll" />);
    await screen.findByText("Июньская плёнка");

    fireEvent.click(screen.getByRole("button", { name: "Открыть дроп «Июньская плёнка»" }));

    expect(await screen.findByRole("button", { name: "кадр 3" })).toHaveAttribute("aria-current", "true");
  });

  /**
   * The main frame is declared in the markup, not only by looks: `aria-current` is the only way
   * "this frame is centred right now" reaches anyone who cannot see the ribbon.
   */
  it("редакция carousel — центральный кадр помечен aria-current", async () => {
    getDropsMock.mockResolvedValue(TWO_DROPS);
    const { container } = render(<PhotoDropsTile edition="carousel" />);
    await screen.findByText("Июльская плёнка");

    expect(container.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
  });

  /**
   * The ribbon is hidden until the first cover arrives (`is-ready`), and on a wave change that
   * nearly became the widget vanishing: both editions sit at the SAME place in the tree with the
   * same key, React reuses the `<img>`, `src` never changes and a second `load` never comes.
   */
  it("возврат на карусель с уже загруженными обложками — лента видна без второго load", async () => {
    getDropsMock.mockResolvedValue(TWO_DROPS);
    // Arrive on a wave with the earlier ribbon and wait for the covers.
    const { container, rerender } = render(<PhotoDropsTile orientation="horizontal" />);
    await screen.findByText("Июльская плёнка");
    pretendCoversLoaded();

    // Switching wave: the same tile, another edition — the picture nodes are reused.
    rerender(<PhotoDropsTile edition="carousel" />);

    expect(container.querySelector(".drop-carousel")).toHaveClass("is-ready");
  });

  /**
   * An unknown edition name falls back to the default (the same rule as `latestDrop`): the layout
   * registry knows nothing of the set of editions, and a wave may arrive with anything.
   */
  it("незнакомая редакция → прежний вертикальный список, а не карусель", async () => {
    getDropsMock.mockResolvedValue(TWO_DROPS);
    const { container } = render(<PhotoDropsTile edition="катушка" />);
    await screen.findByText("Июльская плёнка");

    expect(container.querySelector(".drop-carousel")).toBeNull();
    expect(container.querySelector("ul.overflow-y-auto")).toBeInTheDocument();
  });

  it("клик по дропу открывает его на весь экран (drag-перехвата больше нет)", async () => {
    // A regression anchor: mouse dragging used to swallow the click and break opening a drop.
    // With no drag, a click on a shelf card must open the modal.
    getDropsMock.mockResolvedValue(TWO_DROPS);
    getDropMock.mockResolvedValue([]);
    render(<PhotoDropsTile orientation="horizontal" />);
    await screen.findByText("Июньская плёнка");

    fireEvent.click(screen.getByRole("button", { name: "Открыть дроп «Июньская плёнка»" }));
    expect(getDropMock).toHaveBeenCalledWith(1, expect.anything());
  });
});
