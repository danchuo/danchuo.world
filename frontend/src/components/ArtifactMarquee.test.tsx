import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactView } from "@/lib/api/types";
import { ArtifactMarquee } from "./ArtifactMarquee";
import { ARTIFACT_SIZE, artifactBox } from "@/lib/artifactBox";

vi.mock("@/lib/api/client", () => ({ getArtifacts: vi.fn() }));
// The shaft mounts real 3D objects; the scene is a browser thing and has its own tests.
vi.mock("@/lib/artifact3dStage", () => ({ mountArtifact: vi.fn().mockResolvedValue(null) }));
import { getArtifacts } from "@/lib/api/client";
const getArtifactsMock = vi.mocked(getArtifacts);

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
});

/** Makes the ribbon "not fit" ⇒ it moves and duplicates its content (jsdom has no sizes). */
function forceScrolling() {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", { configurable: true, get: () => 1000 });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 100 });
}

const camera: ArtifactView = {
  id: 1,
  name: "Камера",
  imageUrl: "/assets/artifacts/camera.png",
  firstMentionedOn: "2026-01-15",
};

// Proportions of the real items in the ribbon (w/h of the PNGs themselves).
const GLASSES = 922 / 318; // 2.90 — wide across themselves, they "lie"
const RACKET = 330 / 1257; // 0.26 — long along itself, it "stands"
const CAMERA = 1262 / 829; // 1.52 — nearly square

/** An item's optical weight: the side of a square with the same area. */
const presence = (b: { width: number; height: number }) => Math.sqrt(b.width * b.height);

describe("artifactBox — набок только с разрешения, вес общий", () => {
  it("ракетке класться разрешено ⇒ в горизонтальной ленте она ложится вдоль", () => {
    const racket = artifactBox(RACKET, false, true);

    expect(racket.rotate).toBe(true);
    // The long side lies along the ribbon (otherwise the racket would be an 11px thread).
    expect(racket.width).toBeGreaterThan(racket.height);
  });

  it("очкам класться НЕ разрешено ⇒ в вертикальной ленте волны 02 они не встают на бок", () => {
    // The rule is not geometric: sunglasses have a right way up, a racket does not. That cannot
    // be derived from a proportion, so the permission is stored on the item itself.
    const box = artifactBox(GLASSES, true, false);
    expect(box.rotate).toBe(false);
    expect(box.width / box.height).toBeCloseTo(GLASSES, 2);
  });

  it("разрешение само по себе не крутит: предмет уже лежит вдоль ленты", () => {
    expect(artifactBox(RACKET, true, true).rotate).toBe(false); // vertical ribbon
    expect(artifactBox(GLASSES, false, true).rotate).toBe(false); // horizontal
  });

  it("почти квадратный предмет не крутим даже с разрешения — крутить нечего", () => {
    expect(artifactBox(CAMERA, false, true).rotate).toBe(false);
    expect(artifactBox(CAMERA, true, true).rotate).toBe(false);
  });

  it("по умолчанию класться нельзя — новый предмет остаётся как нарисован", () => {
    expect(artifactBox(RACKET, false).rotate).toBe(false);
    expect(artifactBox(GLASSES, true).rotate).toBe(false);
  });

  it("предметы весят одинаково: равная площадь, а не равная высота", () => {
    // Matching by height is wrong: wide sunglasses at the same height take twice the room of a
    // near-square camera and read larger. We match optical weight.
    const boxes = [
      artifactBox(GLASSES, false, false),
      artifactBox(RACKET, false, true),
      artifactBox(CAMERA, false, false),
    ];
    for (const box of boxes) expect(presence(box)).toBeCloseTo(presence(boxes[0]), 1);
  });

  it("вес не выпирает за ленту: поперечный габарит в пределах потолка", () => {
    for (const ratio of [GLASSES, RACKET, CAMERA]) {
      for (const rotatable of [false, true]) {
        expect(artifactBox(ratio, false, rotatable).height).toBeLessThanOrEqual(40);
        expect(artifactBox(ratio, true, rotatable).width).toBeLessThanOrEqual(40);
      }
    }
  });

  it("пропорция сохраняется всегда — предмет не плющится", () => {
    for (const [ratio, vertical, rotatable] of [
      [GLASSES, false, false], [GLASSES, true, false], [GLASSES, true, true],
      [RACKET, false, true], [RACKET, false, false], [RACKET, true, true],
      [CAMERA, false, false], [CAMERA, true, true],
    ] as const) {
      const box = artifactBox(ratio, vertical, rotatable);
      const onScreen = box.rotate ? 1 / ratio : ratio;
      expect(box.width / box.height).toBeCloseTo(onScreen, 2);
    }
  });

  it("битая пропорция (картинка не измерилась) → квадрат по поперечному потолку, без NaN", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const box = artifactBox(bad, false, true);
      expect(box.rotate).toBe(false);
      expect(box.width).toBe(40);
      expect(box.height).toBe(40);
    }
  });
});

describe("ArtifactMarquee", () => {
  it("клик по артефакту → меню с названием и датой первого упоминания", async () => {
    getArtifactsMock.mockResolvedValue([camera]);
    render(<ArtifactMarquee />);

    // jsdom has no ResizeObserver ⇒ the ribbon does not move ⇒ one item renders once, no duplicate.
    const label = await screen.findByText("Камера");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // A click on an item opens the menu with the date; hover does NOT open it.
    fireEvent.click(label.closest("button")!);
    const dialog = await screen.findByRole("dialog", { name: "Камера" });
    expect(dialog).toHaveTextContent("15 января 2026");
  });

  it("на едущей ленте кликается и копия предмета — мимо неё промахнуться нельзя", async () => {
    // The ribbon duplicates its content for a seamless loop and both copies pass the viewer, so
    // if the click lives only on the first, every other pass the items are unclickable.
    forceScrolling();
    getArtifactsMock.mockResolvedValue([camera]);
    render(<ArtifactMarquee />);

    // The duplicate appears on the second pass, after measuring, so we wait for exactly two copies.
    await waitFor(() => expect(screen.getAllByText("Камера")).toHaveLength(2));

    fireEvent.click(screen.getAllByText("Камера")[1].closest("button")!);
    expect(await screen.findByRole("dialog", { name: "Камера" })).toBeInTheDocument();
  });

  it("повторный клик по тому же предмету закрывает меню", async () => {
    getArtifactsMock.mockResolvedValue([camera]);
    render(<ArtifactMarquee />);

    const btn = (await screen.findByText("Камера")).closest("button")!;
    fireEvent.click(btn);
    expect(await screen.findByRole("dialog", { name: "Камера" })).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("системное «Назад» закрывает меню предмета, а не уводит с сайта", async () => {
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    window.history.replaceState(null, "");
    getArtifactsMock.mockResolvedValue([camera]);
    render(<ArtifactMarquee />);

    fireEvent.click((await screen.findByText("Камера")).closest("button")!);
    expect(await screen.findByRole("dialog", { name: "Камера" })).toBeInTheDocument();

    fireEvent(window, new PopStateEvent("popstate", { state: null }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("картинка в меню не сплющивается: потолки по обеим сторонам, без жёсткой ширины", async () => {
    getArtifactsMock.mockResolvedValue([camera]);
    render(<ArtifactMarquee />);

    fireEvent.click((await screen.findByText("Камера")).closest("button")!);
    const dialog = await screen.findByRole("dialog", { name: "Камера" });
    const img = dialog.querySelector("img")!;

    // A fixed width plus a height ceiling distorts: an elongated item hits the ceiling while the
    // given width does not follow, and the item is squashed. Both sides are therefore ceilings
    // only, and the browser computes the size from the proportion.
    expect(img.style.width).toBe("");
    expect(img.style.height).toBe("");
    expect(img.style.maxWidth).not.toBe("");
    expect(img.style.maxHeight).not.toBe("");
    expect(img.style.objectFit).toBe("contain");
  });

  it("один предмет влезает ⇒ лента не анимируется (без класса is-scrolling)", async () => {
    getArtifactsMock.mockResolvedValue([camera]);
    const { container } = render(<ArtifactMarquee />);

    await screen.findByText("Камера");
    expect(container.querySelector(".artifact-track")).not.toHaveClass("is-scrolling");
    expect(container.querySelectorAll("img").length).toBe(1);
  });

  it("orientation=vertical → трек-колонка (модификатор на бегущей строке)", async () => {
    getArtifactsMock.mockResolvedValue([camera]);
    const { container } = render(<ArtifactMarquee orientation="vertical" />);

    await screen.findByText("Камера");
    expect(container.querySelector(".artifact-track")).toHaveClass("artifact-track--vertical");
  });

  it("без orientation → горизонтальный трек (дефолт, как во всех волнах до)", async () => {
    getArtifactsMock.mockResolvedValue([camera]);
    const { container } = render(<ArtifactMarquee />);

    await screen.findByText("Камера");
    expect(container.querySelector(".artifact-track")).not.toHaveClass("artifact-track--vertical");
  });

  it("пустой список → тихое пустое состояние", async () => {
    getArtifactsMock.mockResolvedValue([]);
    render(<ArtifactMarquee />);
    expect(await screen.findByText("нет артефактов")).toBeInTheDocument();
  });

  it("подписи стоят на одной высоте: слот картинки одинаков у любого предмета", async () => {
    // Items of different proportions give pictures of different heights (weight goes by area), and
    // the caption under them jumped about. The slot holds the ribbon's cross size whatever is in
    // it, which keeps the row of captions level.
    getArtifactsMock.mockResolvedValue([
      { id: 2, name: "Очки", imageUrl: "/assets/artifacts/glasses.png", firstMentionedOn: "2026-03-10" },
      { id: 3, name: "Ракетка", imageUrl: "/assets/artifacts/racket.png", firstMentionedOn: "2026-04-01" },
    ]);
    render(<ArtifactMarquee />);

    const load = async (alt: string, w: number, h: number) => {
      const img = await screen.findByAltText(alt);
      Object.defineProperty(img, "naturalWidth", { configurable: true, value: w });
      Object.defineProperty(img, "naturalHeight", { configurable: true, value: h });
      fireEvent.load(img);
      return img;
    };

    const glasses = await load("Очки", 922, 318);
    const racket = await load("Ракетка", 330, 1257);

    expect(glasses.parentElement!.style.height).toBe(`${ARTIFACT_SIZE}px`);
    expect(racket.parentElement!.style.height).toBe(`${ARTIFACT_SIZE}px`);
    // Room ALONG the ribbon still belongs to the item; the slot only levels the cross size.
    expect(glasses.parentElement!.style.width).not.toBe(racket.parentElement!.style.width);
  });

  it("в шахту встают только предметы со своей моделью", async () => {
    getArtifactsMock.mockResolvedValue([
      { id: 1, name: "С моделью", imageUrl: null, firstMentionedOn: "2026-03-10", model3dUrl: "/m.glb" },
      { id: 2, name: "Без модели", imageUrl: "/p.png", firstMentionedOn: "2026-04-01" },
    ]);
    render(<ArtifactMarquee edition="shaft" />);

    // The name is the shaft's only text, so its presence is the item's presence.
    expect(await screen.findByText("С моделью")).toBeInTheDocument();
    expect(screen.queryByText("Без модели")).toBeNull();
  });

  it("ни у одного предмета нет модели — шахты на борде нет вовсе", async () => {
    getArtifactsMock.mockResolvedValue([
      { id: 1, name: "Очки", imageUrl: "/p.png", firstMentionedOn: "2026-03-10" },
    ]);
    const { container } = render(<ArtifactMarquee edition="shaft" />);

    // Not the empty state either: on a wave with no plate its words would hang on the canvas.
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByText("нет артефактов")).toBeNull();
  });

  it("артефакт без картинки → плейсхолдер вместо img, подпись на месте", async () => {
    getArtifactsMock.mockResolvedValue([
      { id: 2, name: "Очки", imageUrl: null, firstMentionedOn: "2026-03-10" },
    ]);
    const { container } = render(<ArtifactMarquee />);

    expect(await screen.findByText("Очки")).toBeInTheDocument();
    // No picture ⇒ no `<img>` at all (a pixel placeholder is drawn) and the layout holds.
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("ArtifactMarquee — лента листается рукой (§7.2)", () => {
  /**
   * The ribbon's own motion is off here through reduced motion: it runs per frame and would shift
   * the measured offset by random fractions of a pixel. That doubles as a check of the rule —
   * the board's motion is damped, a hand drag is not, because the viewer started it.
   */
  beforeEach(() => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }));
  });

  /** A pointer with coordinates: jsdom has no `PointerEvent`, and a drag would compute from NaN. */
  function pointer(target: Window | HTMLElement, type: string, x: number) {
    fireEvent(
      target,
      new MouseEvent(type, { clientX: x, clientY: 0, bubbles: true, cancelable: true }),
    );
  }

  function dragBy(from: HTMLElement, startX: number, endX: number) {
    pointer(from, "pointerdown", startX);
    pointer(window, "pointermove", endX);
    pointer(window, "pointerup", endX);
  }

  /** A moving ribbon with one item: content duplicated, one copy ⇒ loop step = scrollWidth/2. */
  async function renderScrolling() {
    forceScrolling();
    getArtifactsMock.mockResolvedValue([camera]);
    const { container } = render(<ArtifactMarquee />);
    await waitFor(() => expect(screen.getAllByText("Камера")).toHaveLength(2));
    const track = container.querySelector(".artifact-track") as HTMLElement;
    const btn = screen.getAllByText("Камера")[0].closest("button")!;
    const frame = container.querySelector(".tile-frame") as HTMLElement;
    return { track, btn, frame };
  }

  it("тянем влево — лента уезжает вперёд ровно на пройденный путь", async () => {
    const { track, btn } = await renderScrolling();

    pointer(btn, "pointerdown", 200);
    pointer(window, "pointermove", 140);

    // The ribbon follows the hand within the same frame: waiting for the next animation tick makes
    // the drag feel like "push it and see what happens".
    expect(track.style.left).toBe("-60px");
  });

  it("тянем вправо — лента листается НАЗАД и заходит с конца копии, а не упирается в край", async () => {
    // Half a copy already gone by? It does not matter: back scrolls forever, as does forward.
    // The loop step here is 500 (scrollWidth 1000 over two copies), so −60 reads as 440.
    const { track, btn } = await renderScrolling();

    dragBy(btn, 200, 260);

    // The exact number depends on the loop step, measured from layout, so we check the substance:
    // the ribbon went far PAST the 60px travelled, entering from the copy's end rather than zero.
    expect(track.style.left).not.toBe("0px");
    expect(Number.parseFloat(track.style.left)).toBeLessThan(-60);
  });

  it("после протяжки клик по предмету меню НЕ открывает", async () => {
    // Dragging the ribbon by an item is ordinary — items fill almost all of it. If that gesture
    // also opened the menu, the ribbon could not be scrolled at all.
    const { btn } = await renderScrolling();

    dragBy(btn, 200, 140);
    fireEvent.click(btn);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("тап без протяжки открывает меню, как и раньше", async () => {
    const { btn } = await renderScrolling();

    pointer(btn, "pointerdown", 200);
    pointer(window, "pointerup", 200);
    fireEvent.click(btn);

    expect(await screen.findByRole("dialog", { name: "Камера" })).toBeInTheDocument();
  });

  it("подавляется ровно один клик — следующий тап снова открывает меню", async () => {
    const { btn } = await renderScrolling();

    dragBy(btn, 200, 140);
    fireEvent.click(btn);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    pointer(btn, "pointerdown", 140);
    pointer(window, "pointerup", 140);
    fireEvent.click(btn);
    expect(await screen.findByRole("dialog", { name: "Камера" })).toBeInTheDocument();
  });

  it("нажатие указателем не открывает меню фокусом — иначе клик мышью открывал и тут же закрывал", async () => {
    // The browser focuses a button on press: focus opened the menu and the click that followed
    // (same item ⇒ a toggle) closed it, so the menu never opened by mouse at all.
    const { btn } = await renderScrolling();

    pointer(btn, "pointerdown", 200);
    fireEvent.focus(btn);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("фокус с клавиатуры меню по-прежнему открывает", async () => {
    const { btn } = await renderScrolling();

    fireEvent.focus(btn);

    expect(await screen.findByRole("dialog", { name: "Камера" })).toBeInTheDocument();
  });

  it("колесо/тачпад при наведении крутит ленту — без единого нажатия", async () => {
    // The second way to scroll: a hand on the trackpad with no finger down. Dragging by an item is
    // awkward on a laptop, and the familiar scroll gesture over the ribbon suggested itself.
    const { track, frame } = await renderScrolling();

    fireEvent.wheel(frame, { deltaX: 0, deltaY: 40 });

    expect(track.style.left).toBe("-40px");
  });

  it("колесо в обратную сторону листает назад и заходит с конца копии", async () => {
    const { track, frame } = await renderScrolling();

    fireEvent.wheel(frame, { deltaX: 0, deltaY: -40 });

    expect(Number.parseFloat(track.style.left)).toBeLessThan(-40);
  });

  it("колесо накручивается щелчок за щелчком, а не начинает каждый раз с нуля", async () => {
    const { track, frame } = await renderScrolling();

    fireEvent.wheel(frame, { deltaX: 0, deltaY: 40 });
    fireEvent.wheel(frame, { deltaX: 30, deltaY: 0 });

    expect(track.style.left).toBe("-70px");
  });

  it("колесо не открывает меню предмета и не гасит следующий клик", async () => {
    // Scrolling is not a gesture on an item: it must neither open the card nor swallow the click
    // the way a drag does.
    const { frame, btn } = await renderScrolling();

    fireEvent.wheel(frame, { deltaX: 0, deltaY: 40 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(btn);
    expect(await screen.findByRole("dialog", { name: "Камера" })).toBeInTheDocument();
  });

  it("лента влезла целиком ⇒ колесо над ней отдано странице, а не съедено тайлом", async () => {
    getArtifactsMock.mockResolvedValue([camera]);
    const { container } = render(<ArtifactMarquee />);
    await screen.findByText("Камера");
    const frame = container.querySelector(".tile-frame") as HTMLElement;

    const wheel = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true });
    fireEvent(frame, wheel);

    expect(wheel.defaultPrevented).toBe(false);
  });

  it("лента влезла целиком ⇒ листать нечего: протяжка её не двигает", async () => {
    getArtifactsMock.mockResolvedValue([camera]);
    const { container } = render(<ArtifactMarquee />);
    await screen.findByText("Камера");
    const track = container.querySelector(".artifact-track") as HTMLElement;

    dragBy(screen.getByText("Камера").closest("button")!, 200, 140);

    expect(track.style.left).toBe("");
  });
});

describe("ArtifactMarquee — смена волны не оставляет ленту уехавшей (§7.2)", () => {
  beforeEach(() => {
    getArtifactsMock.mockReset();
  });

  it("смена ориентации чистит ось, по которой лента ехала", async () => {
    // The wave sets the ribbon's direction (§10.1) and a visitor switches waves freely. While the
    // horizontal effect cleaned up only its OWN axis, `left` survived from the previous wave and
    // a vertical ribbon drifted further sideways with every switch.
    forceScrolling();
    getArtifactsMock.mockResolvedValue([camera]);
    const { container, rerender } = render(<ArtifactMarquee />);
    await waitFor(() => expect(screen.getAllByText("Камера")).toHaveLength(2));

    const track = container.querySelector(".artifact-track") as HTMLElement;
    const frame = container.querySelector(".tile-frame") as HTMLElement;
    fireEvent.wheel(frame, { deltaX: 0, deltaY: 120 });
    expect(track.style.left).not.toBe("");

    rerender(<ArtifactMarquee orientation="vertical" />);

    await waitFor(() => expect(track.style.left).toBe(""));
  });

  it("лента, которая перестала ехать, возвращается на место, а не застывает уехавшей", async () => {
    // Another wave means another tile size, and the items may simply fit. The loop step is then
    // zero and there is no content copy — but the offset from the previous wave stayed in the
    // style, leaving the single copy half past the edge.
    const observers: (() => void)[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          observers.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", { configurable: true, get: () => 1000 });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 100 });
    getArtifactsMock.mockResolvedValue([camera]);
    const { container } = render(<ArtifactMarquee />);
    await waitFor(() => expect(screen.getAllByText("Камера")).toHaveLength(2));

    const track = container.querySelector(".artifact-track") as HTMLElement;
    const frame = container.querySelector(".tile-frame") as HTMLElement;
    fireEvent.wheel(frame, { deltaX: 0, deltaY: 120 });
    expect(track.style.left).not.toBe("");

    // The items now fit: one copy is narrower than the window ⇒ the ribbon stops moving.
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", { configurable: true, get: () => 50 });
    await act(async () => {
      observers.forEach((cb) => cb());
    });

    await waitFor(() => expect(track.style.left).toBe(""));
  });

  it("возврат с волны 03 на 01 ⇒ лента снова живая, а не застывшая", async () => {
    // Wave 03 dresses the tile as a shaft, so the ribbon's nodes are torn out and built anew on
    // the way back. Nothing in the effects' dependencies notices that swap — the counts and the
    // loop step are the same — so the listeners stayed on the detached nodes and the ribbon froze.
    forceScrolling();
    getArtifactsMock.mockResolvedValue([{ ...camera, model3dUrl: "/assets/artifacts/camera.glb" }]);
    const { container, rerender } = render(<ArtifactMarquee />);
    await waitFor(() => expect(screen.getAllByText("Камера")).toHaveLength(2));

    rerender(<ArtifactMarquee edition="shaft" />);
    await waitFor(() => expect(container.querySelector(".artifact-track")).toBeNull());

    rerender(<ArtifactMarquee />);
    await waitFor(() => expect(screen.getAllByText("Камера")).toHaveLength(2));

    const track = container.querySelector(".artifact-track") as HTMLElement;
    const frame = container.querySelector(".tile-frame") as HTMLElement;
    fireEvent.wheel(frame, { deltaX: 0, deltaY: 120 });

    expect(track.style.left).not.toBe("");
  });
});
