import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LatestDropTile } from "./LatestDropTile";
import { writeCache } from "@/lib/api/cache";
import { buildMosaic } from "@/lib/mosaic";
import type { FilmPhotoView } from "@/lib/api/types";

vi.mock("@/lib/api/client", () => ({ getDrops: vi.fn(), getDrop: vi.fn() }));
import { getDrop, getDrops } from "@/lib/api/client";
import { FRAME_WHEEL_TRAVEL_PX } from "@/lib/dropRoll";
const getDropsMock = vi.mocked(getDrops);
const getDropMock = vi.mocked(getDrop);

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

const landscape = (seq: number): FilmPhotoView => ({
  imageUrl: `/api/film-media/1/${seq}/web`,
  thumbUrl: `/api/film-media/1/${seq}/thumb`,
  width: 120,
  height: 80,
});

describe("buildMosaic (justified-раскладка кадров)", () => {
  it("пять кадров никогда не пакуются в один ряд, даже в широком низком виджете", () => {
    const photos = [0, 1, 2, 3, 4].map(landscape);
    // A wide, low container: without the cap a single row of 5 won on score.
    const mosaic = buildMosaic(photos, 1000, 120);
    expect(mosaic).not.toBeNull();
    for (const row of mosaic!) expect(row.length).toBeLessThanOrEqual(4);
    // A re-layout, not a discard: all 5 frames stay.
    expect(mosaic!.flat()).toHaveLength(5);
  });

  it("четыре кадра в один ряд — по-прежнему можно", () => {
    const photos = [0, 1, 2, 3].map(landscape);
    const mosaic = buildMosaic(photos, 1000, 120);
    expect(mosaic).not.toBeNull();
    expect(mosaic!).toHaveLength(1);
    expect(mosaic![0]).toHaveLength(4);
  });
});

const portrait = (seq: number): FilmPhotoView => ({
  imageUrl: `/api/film-media/1/${seq}/web`,
  thumbUrl: `/api/film-media/1/${seq}/thumb`,
  width: 80,
  height: 120,
});

const DROP = {
  id: 2,
  title: "Июльская плёнка",
  droppedOn: "2026-07-02",
  monthLabel: "июль 2026",
  photoCount: 12,
  coverPhotoUrl: "/api/film-media/2/0/thumb",
};

/** Frame preloading in jsdom: images do not load, so `load` is simulated. */
class ImageStub {
  onload: (() => void) | null = null;
  set src(v: string) {
    ImageStub.srcs.push(v);
    if (ImageStub.loads) queueMicrotask(() => this.onload?.());
  }
  static loads = true;
  /** What was asked of the network at all: this list shows the neighbours being preloaded. */
  static srcs: string[] = [];
}

describe("LatestDropTile — редакции (волна выбирает через layout, DESIGN §7.5)", () => {
  beforeEach(() => {
    ImageStub.loads = true;
    ImageStub.srcs = [];
    vi.stubGlobal("Image", ImageStub);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("до ответа сети карточки нет — копия из кэша не мелькает «на секунду до свежего»", async () => {
    writeCache("latest-drop", { latest: { ...DROP, title: "Из кэша" }, photos: [landscape(0)] });
    getDropsMock.mockReturnValue(new Promise(() => {})); // the network stays silent
    const { container } = render(<LatestDropTile />);
    await new Promise((r) => setTimeout(r, 10));
    expect(container.querySelector(".pixel-tile")).toBeNull();
    expect(screen.queryByText("Из кэша")).toBeNull();
  });

  it("сеть ответила сбоем (рейтлимит) — появляется копия из кэша, один раз", async () => {
    writeCache("latest-drop", { latest: { ...DROP, title: "Из кэша" }, photos: [landscape(0)] });
    getDropsMock.mockRejectedValue(new Error("rate_limited"));
    const { container } = render(<LatestDropTile />);
    expect(await screen.findByText("Из кэша")).toBeInTheDocument();
    expect(container.querySelector(".pixel-tile")).not.toBeNull();
  });

  it("с копией в кэше кадры мозаики всё равно рисуются: замер идёт после появления карточки", async () => {
    // A second page load: the copy exists, the "loaded" phase arrives before the network answers
    // and the card after it — so the block must be measured on the node itself, not on the phase.
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => "" } as DOMRect);
    writeCache("latest-drop", { latest: DROP, photos: [landscape(0), landscape(1), landscape(2)] });
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([landscape(0), landscape(1), landscape(2)]);
    const { container } = render(<LatestDropTile />);
    await screen.findByText("Июльская плёнка");
    await waitFor(() => expect(container.querySelectorAll(".drop-mosaic img").length).toBeGreaterThan(0));
    rect.mockRestore();
  });

  it("сеть ответила успехом — на экране свежие кадры, а не копия", async () => {
    writeCache("latest-drop", { latest: { ...DROP, title: "Из кэша" }, photos: [landscape(0)] });
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([landscape(1)]);
    render(<LatestDropTile />);
    expect(await screen.findByText("Июльская плёнка")).toBeInTheDocument();
    expect(screen.queryByText("Из кэша")).toBeNull();
  });

  it("edition=frame: пока снимок не пришёл, карточки нет вовсе — ни полоски стекла", async () => {
    ImageStub.loads = false;
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([landscape(0)]);

    const { container } = render(<LatestDropTile edition="frame" />);
    await screen.findByText("Июльская плёнка").catch(() => {});
    // The data arrived but the frame is still loading: no glass may be on screen.
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector(".pixel-tile")).toBeNull();
  });


  it("edition=frame: один кадр во всю карточку, карточка берёт пропорцию кадра", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([landscape(0), landscape(1), landscape(2)]);

    const { container } = render(<LatestDropTile edition="frame" />);
    await screen.findByText("Июльская плёнка");

    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getByText(/12 кадров/)).toBeInTheDocument();
    // The caption sits INSIDE the blur band: the band's height is feather plus caption, so a long
    // title deepens the band by itself.
    expect(container.querySelector(".drop-frame__band .drop-frame__caption")).not.toBeNull();
    // The blurred copies under the caption take the same frame as the shot itself.
    const band = container.querySelector(".drop-frame__band") as HTMLElement;
    expect(band.style.getPropertyValue("--drop-frame-src")).toContain("/api/film-media/1/");
    expect(container.querySelectorAll(".drop-frame__blur")).toHaveLength(2);
    // The proportion belongs to the card (the glass), not the picture: a landscape frame, a
    // landscape card.
    const card = container.querySelector(".pixel-tile") as HTMLElement;
    expect(card.style.aspectRatio).toBe("120 / 80");
    expect(container.querySelector(".drop-mosaic")).toBeNull();
  });

  it("edition=frame: стоячий кадр — стоячая карточка", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([portrait(0)]);

    const { container } = render(<LatestDropTile edition="frame" />);
    await screen.findByText("Июльская плёнка");

    const card = container.querySelector(".pixel-tile") as HTMLElement;
    expect(card.style.aspectRatio).toBe("80 / 120");
  });

  /**
   * A swipe across the card in px, with `SWIPE_NOTCH` (56px) as the threshold. The event is built
   * by hand from `MouseEvent`: jsdom has no `PointerEvent`, and `fireEvent.pointerMove` gives a
   * bare `Event` — no `clientX`, that is, no gesture at all.
   */
  const pointer = (card: HTMLElement, type: string, clientX: number) => {
    const event = new MouseEvent(type, { bubbles: true, clientX });
    Object.defineProperty(event, "pointerType", { value: "touch" });
    fireEvent(card, event);
  };
  const swipe = (card: HTMLElement, dx: number) => {
    pointer(card, "pointerdown", 0);
    pointer(card, "pointermove", dx);
    pointer(card, "pointerup", dx);
  };
  /** A long gesture: the hand travels far, and by stages rather than in one jump, as a real one does. */
  const longSwipe = (card: HTMLElement, dx: number) => {
    pointer(card, "pointerdown", 0);
    for (let i = 1; i <= 6; i += 1) pointer(card, "pointermove", (dx / 6) * i);
    pointer(card, "pointerup", dx);
  };

  const shownSeq = (container: HTMLElement) =>
    (container.querySelector(".drop-frame__img") as HTMLImageElement).src.match(/\/(\d+)\/web/)?.[1] ?? null;

  it("edition=frame: свайп по карточке листает кадры дропа, за краями плёнка стоит", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([landscape(0), landscape(1), landscape(2)]);

    const { container } = render(<LatestDropTile edition="frame" />);
    const card = await screen.findByLabelText(/Открыть дроп/);

    // The starting frame is random (a seeded roll), so we first go RIGHT to the stop: three
    // gestures for three frames is plenty, and past the first frame there is no step.
    swipe(card, 70);
    swipe(card, 70);
    swipe(card, 70);
    await waitFor(() => expect(shownSeq(container)).toBe("0"));

    // Left is the next frame (the sheet of paper follows the finger), to the end of the roll.
    swipe(card, -70);
    await waitFor(() => expect(shownSeq(container)).toBe("1"));
    swipe(card, -70);
    await waitFor(() => expect(shownSeq(container)).toBe("2"));

    // The last frame: the roll goes no further and does NOT loop back to the first.
    swipe(card, -70);
    await new Promise((r) => setTimeout(r, 10));
    expect(shownSeq(container)).toBe("2");

    swipe(card, 70);
    await waitFor(() => expect(shownSeq(container)).toBe("1"));
  });

  it("edition=frame: один жест — ровно один кадр, каким бы длинным он ни был", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([0, 1, 2, 3, 4, 5].map(landscape));

    const { container } = render(<LatestDropTile edition="frame" />);
    const card = await screen.findByLabelText(/Открыть дроп/);

    // Back to the roll's start, then one long gesture left: it must cost ONE frame rather than
    // winding the film to its edge.
    for (let i = 0; i < 6; i += 1) swipe(card, 70);
    await waitFor(() => expect(shownSeq(container)).toBe("0"));
    longSwipe(card, -600);
    await waitFor(() => expect(shownSeq(container)).toBe("1"));
    await new Promise((r) => setTimeout(r, 10));
    expect(shownSeq(container)).toBe("1");

    longSwipe(card, 600);
    await waitFor(() => expect(shownSeq(container)).toBe("0"));
  });

  it("edition=frame: короткий мах по трекпаду не пролистывает дроп целиком", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([0, 1, 2, 3, 4, 5].map(landscape));

    const { container } = render(<LatestDropTile edition="frame" />);
    const card = await screen.findByLabelText(/Открыть дроп/);
    for (let i = 0; i < 6; i += 1) swipe(card, 70); // back to the roll's start
    await waitFor(() => expect(shownSeq(container)).toBe("0"));

    // One two-finger flick arrives as a BURST: a couple of dozen 40px events, almost all of them
    // inertia. Travel does not accumulate while the frame is cooling, so a flick costs one frame.
    // The counter must live in a ref — in a closure the frame it triggers would reset it.
    for (let i = 0; i < 20; i += 1) fireEvent.wheel(card, { deltaX: 40, deltaY: 0 });
    await waitFor(() => expect(shownSeq(container)).toBe("1"));
    await new Promise((r) => setTimeout(r, 20));
    expect(shownSeq(container)).toBe("1");
  });

  it("edition=frame: пока пальцы не отпущены, второй ход того же жеста не считается", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([0, 1, 2, 3, 4, 5].map(landscape));

    const { container } = render(<LatestDropTile edition="frame" />);
    const card = await screen.findByLabelText(/Открыть дроп/);
    for (let i = 0; i < 6; i += 1) swipe(card, 70); // back to the roll's start
    await waitFor(() => expect(shownSeq(container)).toBe("0"));

    // Several bursts still belong to one wheel stream: none is separated by the quiet interval
    // that stands for lifting fingers from the trackpad.
    const perEvent = Math.ceil((FRAME_WHEEL_TRAVEL_PX + 40) / 4);
    for (let burst = 0; burst < 3; burst += 1) {
      for (let i = 0; i < 4; i += 1) fireEvent.wheel(card, { deltaX: perEvent, deltaY: 0 });
      await new Promise((done) => setTimeout(done, 40));
    }
    await waitFor(() => expect(shownSeq(container)).toBe("1"));
  });

  it("edition=frame: следующий мах после тишины листает дальше", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([0, 1, 2, 3, 4, 5].map(landscape));

    const { container } = render(<LatestDropTile edition="frame" />);
    const card = await screen.findByLabelText(/Открыть дроп/);
    for (let i = 0; i < 6; i += 1) swipe(card, 70);
    await waitFor(() => expect(shownSeq(container)).toBe("0"));

    for (let i = 0; i < 10; i += 1) fireEvent.wheel(card, { deltaX: 40, deltaY: 0 });
    await waitFor(() => expect(shownSeq(container)).toBe("1"));
    // The inertial tail may keep emitting after the hand has lifted. It must neither turn another
    // frame nor postpone rearming; the next flick works without moving the pointer off the card.
    await new Promise((done) => setTimeout(done, 80));
    for (let i = 0; i < 12; i += 1) fireEvent.wheel(card, { deltaX: 2, deltaY: 0 });
    await new Promise((done) => setTimeout(done, 80));
    expect(shownSeq(container)).toBe("1");
    for (let i = 0; i < 10; i += 1) fireEvent.wheel(card, { deltaX: 40, deltaY: 0 });
    await waitFor(() => expect(shownSeq(container)).toBe("2"));
  });


  it("edition=frame: соседние кадры тянутся заранее — свайп не ждёт сеть", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    const photos = [0, 1, 2, 3, 4].map(landscape);
    getDropMock.mockResolvedValue(photos);

    const { container } = render(<LatestDropTile edition="frame" />);
    await screen.findByLabelText(/Открыть дроп/);
    await waitFor(() => expect(container.querySelector(".drop-frame__img")).not.toBeNull());

    // The shown frame is one of the selection, and its neighbours (±1, ±2) must be requested
    // beside it, or every gesture on a phone runs into a load.
    const shown = container.querySelector(".drop-frame__img")!.getAttribute("src")!;
    const shownIdx = photos.findIndex((p) => shown.includes(p.imageUrl));
    const neighbours = [shownIdx - 2, shownIdx - 1, shownIdx + 1, shownIdx + 2].filter(
      (i) => i >= 0 && i < photos.length,
    );
    expect(neighbours.length).toBeGreaterThan(0);
    for (const i of neighbours) {
      await waitFor(() => expect(ImageStub.srcs.some((s) => s.includes(photos[i].imageUrl))).toBe(true));
    }
  });

  it("edition=frame: свайп НЕ пересоздаёт узлы кадра — курсор остаётся над теми же", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([landscape(0), landscape(1), landscape(2)]);

    const { container } = render(<LatestDropTile edition="frame" />);
    const card = await screen.findByLabelText(/Открыть дроп/);
    const img = container.querySelector(".drop-frame__img");
    const view = container.querySelector(".drop-frame__view");

    for (let i = 0; i < 3; i += 1) swipe(card, 70); // to the start, where there is room to step
    await waitFor(() => expect(shownSeq(container)).toBe("0"));
    swipe(card, -70);
    await waitFor(() => expect(shownSeq(container)).toBe("1"));
    // The very same node, not a new one with the same class: a recreated layer takes the hover
    // target out from under the cursor, and the browser stops sending wheel events to the card.
    expect(container.querySelector(".drop-frame__img")).toBe(img);
    expect(container.querySelector(".drop-frame__view")).toBe(view);
  });

  it("edition=frame: свайп не открывает галерею — это жест, а не клик по кадру", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([landscape(0), landscape(1)]);

    render(<LatestDropTile edition="frame" />);
    const card = await screen.findByLabelText(/Открыть дроп/);
    swipe(card, -70);
    fireEvent.click(card); // the click a browser ends a drag with
    await new Promise((r) => setTimeout(r, 10));
    expect(document.querySelector(".drop-modal__panel")).toBeNull();
  });

  it("edition=frame: после свайпа СЛЕДУЮЩЕЕ нажатие открывает галерею, а не пропадает", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([landscape(0), landscape(1)]);

    render(<LatestDropTile edition="frame" />);
    const card = await screen.findByLabelText(/Открыть дроп/);
    // A gesture the browser did NOT finish with a click: on a touch screen a swipe is not a click,
    // and on a mouse the native image drag eats it. The "this was a gesture" mark must die with
    // the gesture, or the next press would clear it instead of opening.
    swipe(card, -70);
    pointer(card, "pointerdown", 0);
    pointer(card, "pointerup", 0);
    fireEvent.click(card);
    await waitFor(() => expect(document.querySelector(".drop-modal__panel")).not.toBeNull());
  });

  it("edition=frame: кадр открывает модалку так же, как мозаика", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([landscape(0)]);

    render(<LatestDropTile edition="frame" />);
    const box = await screen.findByRole("button", { name: /Открыть дроп/ });
    expect(box).toHaveClass("drop-frame");
  });

  it("edition=sheet: четыре кадра justified-рядами — без обрезки и без поворота, строка данных сверху", async () => {
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => "" } as DOMRect);
    getDropsMock.mockResolvedValue([DROP]);
    const photos = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (i % 2 === 1 ? portrait(i) : landscape(i)));
    getDropMock.mockResolvedValue(photos);

    const { container } = render(<LatestDropTile edition="sheet" />);
    await screen.findByText("Июльская плёнка");

    const imgs = [...container.querySelectorAll(".drop-sheet img")] as HTMLImageElement[];
    expect(imgs).toHaveLength(4);
    expect(container.querySelector("[data-rotated]")).toBeNull();
    // Every frame carries ITS OWN proportion: portrait stays portrait, landscape stays landscape.
    for (const img of imgs) {
      const seq = Number(img.getAttribute("src")!.match(/\/(\d+)\/thumb$/)![1]);
      const [w, h] = img.style.aspectRatio.split("/").map((v) => Number(v.trim()));
      const expected = seq % 2 === 1 ? 80 / 120 : 120 / 80;
      expect(Math.abs(w / h - expected) / expected).toBeLessThan(0.05);
    }
    expect(screen.getByText(/12 кадров/)).toBeInTheDocument();
    // In the stack the block's height comes from the `.drop-mosaic` CSS contract (§8).
    expect(screen.getByRole("button", { name: /Открыть дроп/ })).toHaveClass("drop-mosaic");
    rect.mockRestore();
  });

  it("в стеке карточка НЕ жмётся к мозаике: ширина стека и есть ширина карточки", async () => {
    // A jumping widget on a phone: in the stack the frame block's height comes from its own width
    // (`aspect-ratio`, §8) while the card sized its width to the laid-out rows, closing a loop.
    // In the stack the card no longer fits its width, which breaks it.
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => "" } as DOMRect);
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([0, 1, 2, 3].map((i) => (i % 2 === 1 ? portrait(i) : landscape(i))));

    const { container } = render(<LatestDropTile edition="sheet" />);
    await screen.findByText("Июльская плёнка");

    const card = container.querySelector(".pixel-tile") as HTMLElement;
    expect(card.style.width).toBe("");
    expect(card.style.marginInline).toBe("");
    rect.mockRestore();
  });

  it("edition=sheet: кадров меньше четырёх — лист показывает столько, сколько есть", async () => {
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => "" } as DOMRect);
    getDropsMock.mockResolvedValue([{ ...DROP, photoCount: 2 }]);
    getDropMock.mockResolvedValue([landscape(0), landscape(1)]);

    const { container } = render(<LatestDropTile edition="sheet" />);
    await screen.findByText("Июльская плёнка");
    expect(container.querySelectorAll(".drop-sheet img")).toHaveLength(2);
    expect(screen.getByText(/2 кадра/)).toBeInTheDocument();
    rect.mockRestore();
  });

  it("незнакомая редакция ⇒ мозаика (дефолт)", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([landscape(0)]);

    const { container } = render(<LatestDropTile edition="hologram" />);
    await screen.findByText("Июльская плёнка");
    expect(container.querySelector(".drop-mosaic")).not.toBeNull();
  });
});

describe("LatestDropTile (крупный последний дроп)", () => {
  it("нет дропов → пустое состояние, кадры не запрашиваются", async () => {
    getDropsMock.mockResolvedValue([]);
    render(<LatestDropTile />);
    expect(await screen.findByText("пока нет дропов")).toBeInTheDocument();
    expect(getDropMock).not.toHaveBeenCalled();
  });

  it("есть дропы → крупно показывает последний (его название и кадры)", async () => {
    getDropsMock.mockResolvedValue([
      { id: 2, title: "Июльская плёнка", droppedOn: "2026-07-02", monthLabel: "июль 2026", photoCount: 12, coverPhotoUrl: "/api/film-media/2/0/thumb" },
      { id: 1, title: "Июньская плёнка", droppedOn: "2026-06-10", monthLabel: "июнь 2026", photoCount: 36, coverPhotoUrl: "/api/film-media/1/0/thumb" },
    ]);
    getDropMock.mockResolvedValue([
      { imageUrl: "/api/film-media/2/0/web", thumbUrl: "/api/film-media/2/0/thumb", width: 120, height: 80 },
    ]);

    render(<LatestDropTile />);

    expect(await screen.findByText("Июльская плёнка")).toBeInTheDocument();
    expect(getDropMock).toHaveBeenCalledWith(2, expect.anything());
  });

  it("ширину кадров раздаёт флексбокс, а не пиксели из JS", () => {
    // A pixel width in `style.width` relied on the engine adding numbers the way the calculation
    // did. Safari added them differently and the right frame spilled out of the card.
    // `flex-grow` plus `flex-basis: 0` make the row fill the container by definition.
    const photos = [0, 1, 2, 3].map(landscape);
    const mosaic = buildMosaic(photos, 341, 260)!;
    expect(mosaic.flat().length).toBe(4);
    // The layout contract itself is checked by the render below; here we pin that the calculation
    // still yields whole widths, which the grow factors are taken from.
    for (const cell of mosaic.flat()) expect(Number.isInteger(cell.w)).toBe(true);
  });

  it("ширина карточки НЕ анимируется — иначе WebKit размазывает её тень по боковым зазорам", async () => {
    // The tile carries filter: drop-shadow, hence its own compositing layer, and the shadow
    // extends past the box. WebKit does not clean up the area freed by a shrinking layer, so every
    // frame of a width animation left a stripe of shadow (docs/pitfalls.md).
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => "" } as DOMRect);
    getDropsMock.mockResolvedValue([
      { id: 2, title: "Июльская плёнка", droppedOn: "2026-07-02", monthLabel: "июль 2026", photoCount: 12, coverPhotoUrl: "/api/film-media/2/0/thumb" },
    ]);
    getDropMock.mockResolvedValue([landscape(0), landscape(1), landscape(2)]);

    // The slot height (bento) is required: the card hugs the mosaic only there, while in the stack
    // it takes the row's full width.
    const { container } = render(<LatestDropTile style={{ height: 300 }} />);
    await screen.findByText("Июльская плёнка");

    const card = container.querySelector(".pixel-tile") as HTMLElement;
    // The width really was computed ⇒ the lock guards the branch it claims to.
    expect(card.style.width).not.toBe("");
    expect(card.style.transition).toBe("");
    rect.mockRestore();
  });

  it("блок мозаики зацеплен за .drop-mosaic — свою высоту ему даёт CSS", async () => {
    // The block's height is an input of the row calculation (`buildMosaic` returns null at H<=0),
    // and in the mobile stack the parent sets none: without a height of its own the tile stayed
    // frameless forever. The pixels are checked by `app/styles/stackHeights.test.ts`.
    getDropsMock.mockResolvedValue([
      { id: 2, title: "Июльская плёнка", droppedOn: "2026-07-02", monthLabel: "июль 2026", photoCount: 12, coverPhotoUrl: "/api/film-media/2/0/thumb" },
    ]);
    getDropMock.mockResolvedValue([
      { imageUrl: "/api/film-media/2/0/web", thumbUrl: "/api/film-media/2/0/thumb", width: 120, height: 80 },
    ]);

    render(<LatestDropTile />);

    const box = await screen.findByRole("button", { name: /Открыть дроп/ });
    expect(box).toHaveClass("drop-mosaic");
  });
});

describe("LatestDropTile — ряд мозаики заполняет контейнер сам", () => {
  it("у кадров flex-grow и нулевой базис, а жёсткой ширины в пикселях нет", async () => {
    // A regression lock on the load-bearing decision: the horizontal must not depend on how the
    // engine adds pixels written from JS. Bring back `width: Npx` and Safari clips the right frame.
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => "" } as DOMRect);
    getDropsMock.mockResolvedValue([
      { id: 2, title: "Июльская плёнка", droppedOn: "2026-07-02", monthLabel: "июль 2026", photoCount: 12, coverPhotoUrl: "/api/film-media/2/0/thumb" },
    ]);
    getDropMock.mockResolvedValue([landscape(0), landscape(1), landscape(2), landscape(3)]);

    const { container } = render(<LatestDropTile />);
    await screen.findByText("Июльская плёнка");

    const imgs = [...container.querySelectorAll(".drop-mosaic img")] as HTMLImageElement[];
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img.style.flexGrow).not.toBe("");
      expect(img.style.flexBasis).toBe("0px");
      expect(img.style.width).toBe("");
      expect(img.style.aspectRatio).not.toBe("");
    }
    // The row spans the container's full width rather than the sum of the pixels.
    const row = container.querySelector(".drop-mosaic > div") as HTMLElement;
    expect(row.style.width).toBe("100%");
    rect.mockRestore();
  });
});
