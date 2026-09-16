import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoDropModal } from "./PhotoDropModal";

vi.mock("@/lib/api/client", () => ({ getDrop: vi.fn() }));
import { getDrop } from "@/lib/api/client";
const getDropMock = vi.mocked(getDrop);

// restore is not cosmetic: stubbing `matchMedia` in one case would otherwise make the whole file touch.
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("PhotoDropModal — blur-up загрузка", () => {
  it("кадр стоит из размытого thumb, полный проступает по onLoad", async () => {
    getDropMock.mockResolvedValue([
      { imageUrl: "/api/film-media/1/0/web", thumbUrl: "/api/film-media/1/0/thumb", width: 300, height: 400 },
    ]);

    const { container } = render(
      <PhotoDropModal dropId={1} title="Плёнка" monthLabel="июль 2026" onClose={() => {}} />,
    );

    await waitFor(() => expect(container.querySelector(".blur-up-full")).not.toBeNull());

    const thumb = container.querySelector<HTMLImageElement>(".blur-up-thumb")!;
    const full = container.querySelector<HTMLImageElement>(".blur-up-full")!;

    // The thumb shows at once (blurred); the full frame is not loaded yet and stays hidden.
    expect(thumb).toHaveAttribute("src", "/api/film-media/1/0/thumb");
    expect(full).toHaveAttribute("src", "/api/film-media/1/0/web");
    expect(full).toHaveAttribute("loading", "lazy");
    expect(full.dataset.loaded).toBe("false");

    // The full frame finished loading and comes through on top.
    fireEvent.load(full);
    expect(full.dataset.loaded).toBe("true");
  });

  it("thumb остаётся непрозрачной подложкой — фон не мелькает в кросс-фейде", async () => {
    // A regression anchor on the "pink flash": the thumb used to fade out as the full frame faded
    // in, and mid-transition the tile's background showed through both translucent layers. The
    // thumb must get no fading mechanism at all, before or after the full frame loads.
    getDropMock.mockResolvedValue([
      { imageUrl: "/api/film-media/1/0/web", thumbUrl: "/api/film-media/1/0/thumb", width: 300, height: 400 },
    ]);
    const { container } = render(
      <PhotoDropModal dropId={1} title="Плёнка" monthLabel={null} onClose={() => {}} />,
    );
    await waitFor(() => expect(container.querySelector(".blur-up-full")).not.toBeNull());
    const thumb = container.querySelector<HTMLImageElement>(".blur-up-thumb")!;
    const full = container.querySelector<HTMLImageElement>(".blur-up-full")!;

    const notFaded = () => {
      expect(thumb).not.toHaveAttribute("data-hidden");
      expect(thumb.style.opacity === "" || thumb.style.opacity === "1").toBe(true);
    };

    notFaded(); // before loading
    fireEvent.load(full);
    notFaded(); // and after — the backing stays opaque
  });

  it("пустой дроп → «пока нет кадров»", async () => {
    getDropMock.mockResolvedValue([]);
    render(<PhotoDropModal dropId={2} title="Пусто" monthLabel={null} onClose={() => {}} />);
    expect(await screen.findByText("в этом дропе пока нет кадров")).toBeInTheDocument();
  });
});

describe("PhotoDropModal — кадр на весь экран", () => {
  const twoFrames = [
    { imageUrl: "/api/film-media/1/0/web", thumbUrl: "/api/film-media/1/0/thumb", width: 300, height: 400 },
    { imageUrl: "/api/film-media/1/1/web", thumbUrl: "/api/film-media/1/1/thumb", width: 400, height: 300 },
  ];

  const openFirst = async (onClose = () => {}) => {
    getDropMock.mockResolvedValue(twoFrames);
    const view = render(
      <PhotoDropModal dropId={1} title="Плёнка" monthLabel="июль 2026" onClose={onClose} />,
    );
    const frames = await screen.findAllByRole("button", { name: /открыть кадр/ });
    fireEvent.click(frames[0]);
    return view;
  };

  it("каждый кадр — кнопка, клик открывает его во весь экран", async () => {
    const { container } = await openFirst();

    const lightbox = screen.getByRole("dialog", { name: "кадр 1 из 2" });
    expect(lightbox).toBeInTheDocument();
    // We show the frame that was clicked, at full size (web, not thumb).
    expect(container.querySelector(".lightbox-photo")).toHaveAttribute(
      "src",
      "/api/film-media/1/0/web",
    );
  });

  it("Esc закрывает только кадр — галерея дропа остаётся", async () => {
    const onClose = vi.fn();
    const { container } = await openFirst(onClose);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".lightbox-photo")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: /открыть кадр/ })).toHaveLength(2);

    // The second Esc is about the gallery itself.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("системное «Назад» закрывает сперва кадр, потом галерею — а не уводит с сайта", async () => {
    // The main cancel gesture on a phone. While open overlays were absent from history, Back on
    // Android navigated off the site entirely: the browser had nothing to undo.
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    window.history.replaceState(null, "");
    const onClose = vi.fn();
    const { container } = await openFirst(onClose);

    // The browser drops the top history entry and hands back the state of the one below.
    fireEvent(window, new PopStateEvent("popstate", { state: { danchuoOverlay: 1 } }));
    expect(container.querySelector(".lightbox-photo")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: /открыть кадр/ })).toHaveLength(2);

    fireEvent(window, new PopStateEvent("popstate", { state: null }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("клик по фону и по ✕ закрывает кадр, но не галерею", async () => {
    const onClose = vi.fn();
    const { container } = await openFirst(onClose);

    fireEvent.click(screen.getByRole("dialog", { name: "кадр 1 из 2" }));
    expect(container.querySelector(".lightbox-photo")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: /открыть кадр/ })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Закрыть кадр" }));
    expect(container.querySelector(".lightbox-photo")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("клик по самой картинке кадр не закрывает", async () => {
    // A miss past the backdrop must not cost the viewing — closing is a decision (backdrop/✕/Esc).
    const { container } = await openFirst();
    fireEvent.click(container.querySelector(".lightbox-photo")!);
    expect(container.querySelector(".lightbox-photo")).not.toBeNull();
  });

  it("закрытый кадр возвращает фокус на свою плитку", async () => {
    await openFirst();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.activeElement).toBe(
      screen.getAllByRole("button", { name: /открыть кадр/ })[0],
    );
  });
});

describe("PhotoDropModal — подсветка артефактов (§5.12)", () => {
  it("рисует рамку долями кадра, а не пикселями", async () => {
    getDropMock.mockResolvedValue([
      {
        imageUrl: "/api/film-media/1/0/web",
        thumbUrl: "/api/film-media/1/0/thumb",
        width: 300,
        height: 400,
        artifacts: [{ artifactId: 7, name: "Ракетка", x0: 0.25, y0: 0.1, x1: 0.75, y1: 0.6 }],
      },
    ]);

    const { container } = render(
      <PhotoDropModal dropId={1} title="Плёнка" monthLabel="июль 2026" onClose={() => {}} />,
    );

    await waitFor(() => expect(container.querySelector(".artifact-box")).not.toBeNull());
    const box = container.querySelector<HTMLElement>(".artifact-box")!;

    // Fractions survive any render size — the multiplier is layout's, not the backend's. The box
    // is wider than the finding by 15% on each side: 0.25..0.75 ⇒ 0.175..0.825.
    expect(box.style.left).toBe("17.5%");
    expect(box.style.top).toBe("2.5%");
    expect(box.style.width).toBe("65%");
    expect(box.style.height).toBe("65%");
  });

  it("подпись артефакта доступна с клавиатуры и скринридеру", async () => {
    getDropMock.mockResolvedValue([
      {
        imageUrl: "/api/film-media/1/0/web",
        thumbUrl: "/api/film-media/1/0/thumb",
        width: 300,
        height: 400,
        artifacts: [{ artifactId: 7, name: "Ракетка", x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.5 }],
      },
    ]);

    render(<PhotoDropModal dropId={1} title="Плёнка" monthLabel="июль 2026" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Ракетка")).toBeInTheDocument());
  });

  it("кадр без находок не несёт ни одной рамки", async () => {
    getDropMock.mockResolvedValue([
      { imageUrl: "/api/film-media/1/0/web", thumbUrl: "/api/film-media/1/0/thumb", width: 300, height: 400 },
    ]);

    const { container } = render(
      <PhotoDropModal dropId={1} title="Плёнка" monthLabel="июль 2026" onClose={() => {}} />,
    );

    await waitFor(() => expect(container.querySelector(".blur-up-full")).not.toBeNull());
    expect(container.querySelectorAll(".artifact-box")).toHaveLength(0);
  });
});

describe("PhotoDropModal — подсказка о предмете по наведению на рамку", () => {
  const twoFinds = [
    {
      imageUrl: "/api/film-media/1/0/web",
      thumbUrl: "/api/film-media/1/0/thumb",
      width: 400,
      height: 400,
      artifacts: [
        { artifactId: 6, name: "Очки", imageUrl: "/api/artifact-media/6", x0: 0.05, y0: 0.05, x1: 0.35, y1: 0.35 },
        { artifactId: 9, name: "Футболка", imageUrl: null, x0: 0.25, y0: 0.25, x1: 0.9, y1: 0.9 },
      ],
    },
  ];

  /** The cursor in fractions of the frame: jsdom has no sizes, so we set the frame's box ourselves. */
  const hoverAt = (frame: HTMLElement, x: number, y: number) => {
    frame.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => "" }) as DOMRect;
    fireEvent.mouseMove(frame, { clientX: x * 200, clientY: y * 200 });
  };

  const renderFrame = async () => {
    getDropMock.mockResolvedValue(twoFinds);
    const view = render(
      <PhotoDropModal dropId={1} title="Плёнка" monthLabel="июль 2026" onClose={() => {}} />,
    );
    await waitFor(() => expect(view.container.querySelector(".artifact-box")).not.toBeNull());
    return { ...view, frame: view.container.querySelector<HTMLElement>(".drop-frame")! };
  };

  it("на пустом месте кадра подсказки нет", async () => {
    const { container, frame } = await renderFrame();
    hoverAt(frame, 0.95, 0.02);
    expect(container.querySelectorAll(".artifact-card")).toHaveLength(0);
  });

  it("подсказка показывает картинку предмета и его имя", async () => {
    const { container, frame } = await renderFrame();
    hoverAt(frame, 0.1, 0.1);

    const cards = container.querySelectorAll(".artifact-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent("Очки");
    expect(cards[0].querySelector("img")).toHaveAttribute("src", "/api/artifact-media/6");
    // The hint binds to its own box rather than the frame: there can be several findings.
    expect(cards[0].parentElement).toHaveClass("artifact-box");
  });

  /** A touch device: the pointer has no hover. `matches` is always false in jsdom, so we stub it. */
  const pretendTouch = () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    );
  };

  const openLightbox = async () => {
    getDropMock.mockResolvedValue(twoFinds);
    render(<PhotoDropModal dropId={1} title="Плёнка" monthLabel={null} onClose={() => {}} />);
    const frames = await screen.findAllByRole("button", { name: /открыть кадр/ });
    fireEvent.click(frames[0]);
    return screen.getByRole("dialog", { name: "кадр 1 из 1" });
  };

  it("на телефоне полноэкранный кадр подписывает находки сразу — без наведения", async () => {
    // The touch flow (§7.5): there is no hover on a phone, and a tap on the frame is already taken
    // by opening fullscreen. So the fullscreen frame explains the finding itself — same boxes, but
    // the cards visible without a gesture. There is exactly one frame here, not 36.
    pretendTouch();
    const lightbox = await openLightbox();
    // Not one mouseMove happened, and both findings' cards are there anyway.
    expect(lightbox.querySelectorAll(".artifact-box")).toHaveLength(2);
    expect(lightbox.querySelectorAll(".artifact-card")).toHaveLength(2);
    expect(lightbox).toHaveTextContent("Очки");
    expect(lightbox).toHaveTextContent("Футболка");
  });

  it("на компьютере полноэкранный кадр не несёт ни рамок, ни карточек", async () => {
    // With a mouse the finding is shown by hovering in the gallery itself, so fullscreen has
    // nothing to explain — and boxes over the shot get in the way of looking at it.
    const lightbox = await openLightbox();
    expect(lightbox.querySelectorAll(".artifact-box")).toHaveLength(0);
    expect(lightbox.querySelectorAll(".artifact-card")).toHaveLength(0);
  });

  it("рамки в полноэкранном кадре не перехватывают закрытие по фону", async () => {
    // The box lies over the picture; if it caught the pointer, a miss past the item would close
    // the viewing (a click on the picture must not close it — a regression anchor).
    getDropMock.mockResolvedValue(twoFinds);
    const { container } = render(
      <PhotoDropModal dropId={1} title="Плёнка" monthLabel={null} onClose={() => {}} />,
    );
    const frames = await screen.findAllByRole("button", { name: /открыть кадр/ });
    fireEvent.click(frames[0]);
    fireEvent.click(container.querySelector(".lightbox-stage")!);
    expect(container.querySelector(".lightbox-photo")).not.toBeNull();
  });

  it("вытянутый предмет с разрешением ложится в карточке набок", async () => {
    // A racket is drawn upright while the card's slot is landscape: without rotation the item
    // degenerates into a thread. The `rotatable` flag here is the marquee's, and the card must
    // respect it.
    getDropMock.mockResolvedValue([
      {
        imageUrl: "/api/film-media/1/0/web",
        thumbUrl: "/api/film-media/1/0/thumb",
        width: 400,
        height: 400,
        artifacts: [
          {
            artifactId: 7,
            name: "Ракетка",
            imageUrl: "/api/artifact-media/7",
            rotatable: true,
            x0: 0.05,
            y0: 0.05,
            x1: 0.95,
            y1: 0.95,
          },
        ],
      },
    ]);
    const view = render(
      <PhotoDropModal dropId={1} title="Плёнка" monthLabel={null} onClose={() => {}} />,
    );
    await waitFor(() => expect(view.container.querySelector(".artifact-box")).not.toBeNull());
    hoverAt(view.container.querySelector<HTMLElement>(".drop-frame")!, 0.5, 0.5);

    const img = view.container.querySelector<HTMLImageElement>(".artifact-card__img")!;
    // Before onLoad the proportion is unknown, so the item is drawn as is.
    expect(img).not.toHaveClass("artifact-card__img--tilted");

    Object.defineProperty(img, "naturalWidth", { value: 619, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: 2055, configurable: true });
    fireEvent.load(img);
    expect(img).toHaveClass("artifact-card__img--tilted");
  });

  it("без разрешения предмет в карточке не поворачивается", async () => {
    const view = await renderFrame(); // sunglasses: rotatable is not set
    hoverAt(view.container.querySelector<HTMLElement>(".drop-frame")!, 0.1, 0.1);
    const img = view.container.querySelector<HTMLImageElement>(".artifact-card__img")!;
    Object.defineProperty(img, "naturalWidth", { value: 619, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: 2055, configurable: true });
    fireEvent.load(img);
    expect(img).not.toHaveClass("artifact-card__img--tilted");
  });

  it("две находки на кадре: показывается та, под которой курсор", async () => {
    const { container, frame } = await renderFrame();
    hoverAt(frame, 0.8, 0.8);
    const cards = container.querySelectorAll(".artifact-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent("Футболка");
  });

  it("на пересечении рамок показываются обе подсказки", async () => {
    const { container, frame } = await renderFrame();
    hoverAt(frame, 0.3, 0.3);
    const cards = container.querySelectorAll(".artifact-card");
    expect(cards).toHaveLength(2);
    expect([...cards].map((c) => c.textContent)).toEqual(["Очки", "Футболка"]);
  });

  it("на пересечении верхняя плашка — та, на которую навели ПОЗЖЕ", async () => {
    // Otherwise the markup dictates the order: the same plate is always on top, and the lower
    // finding cannot be reached by mouse at all — its card is never seen.
    const { container, frame } = await renderFrame();

    const zOf = (name: string) =>
      Number(
        [...container.querySelectorAll<HTMLElement>(".artifact-card")]
          .find((c) => c.textContent === name)!.style.zIndex,
      );

    // First the shirt alone, then into the overlap ⇒ the sunglasses arrived later.
    hoverAt(frame, 0.8, 0.8);
    hoverAt(frame, 0.3, 0.3);
    expect(zOf("Очки")).toBeGreaterThan(zOf("Футболка"));

    // The same cursor in reverse order — now the shirt is on top.
    fireEvent.mouseLeave(frame);
    hoverAt(frame, 0.1, 0.1);
    hoverAt(frame, 0.3, 0.3);
    expect(zOf("Футболка")).toBeGreaterThan(zOf("Очки"));
  });

  it("предмет без картинки — подсказка остаётся, просто без картинки", async () => {
    const { container, frame } = await renderFrame();
    hoverAt(frame, 0.8, 0.8);
    expect(container.querySelector(".artifact-card")!.querySelector("img")).toBeNull();
  });

  it("курсор ушёл с кадра — подсказка гаснет", async () => {
    const { container, frame } = await renderFrame();
    hoverAt(frame, 0.1, 0.1);
    expect(container.querySelectorAll(".artifact-card")).toHaveLength(1);
    fireEvent.mouseLeave(frame);
    expect(container.querySelectorAll(".artifact-card")).toHaveLength(0);
  });

  it("имя предмета доступно скринридеру и без наведения", async () => {
    // The hint lives on hover and a screen reader has no hover, so the name must always be in the
    // markup, or the finding simply does not exist for it.
    await renderFrame();
    expect(screen.getByText("Очки")).toBeInTheDocument();
    expect(screen.getByText("Футболка")).toBeInTheDocument();
  });
});

describe("PhotoDropModal — подпись артефакта не обрезается", () => {
  const frameWith = (box: { x0: number; y0: number; x1: number; y1: number }) => [
    {
      imageUrl: "/api/film-media/1/0/web",
      thumbUrl: "/api/film-media/1/0/thumb",
      width: 300,
      height: 400,
      artifacts: [{ artifactId: 7, name: "Ракетка", ...box }],
    },
  ];

  it("клипует картинку, а не весь кадр — ореола нет, подписи есть куда выйти", async () => {
    // A regression anchor on two bugs at once. Dropping the clip from the whole frame kept the
    // caption from being trimmed and gave a halo instead: filter: blur() spreads BEYOND the
    // element, and the clip was all that held it. Now only the picture wrapper clips.
    getDropMock.mockResolvedValue(frameWith({ x0: 0.1, y0: 0.8, x1: 0.5, y1: 0.98 }));

    const { container } = render(
      <PhotoDropModal dropId={1} title="Плёнка" monthLabel="июль 2026" onClose={() => {}} />,
    );

    await waitFor(() => expect(container.querySelector(".artifact-box")).not.toBeNull());
    const media = container.querySelector<HTMLElement>(".blur-up-thumb")!.parentElement!;
    expect(media.style.overflow).toBe("hidden");

    const frame = container.querySelector<HTMLElement>(".artifact-box")!.parentElement!;
    expect(frame).toHaveClass("drop-frame");
    expect(frame.style.overflow === "" || frame.style.overflow === "visible").toBe(true);
  });

  it("рамке не назначается потолок ширины подписи — имя предмета видно целиком", async () => {
    // A narrow box at the right edge is the worst case: the caption used to hit the frame's edge
    // and ellipsise, because the frame clipped. Now only the picture clips and the caption may
    // leave the frame entirely, so it needs no ceiling.
    const raw = { x0: 0.65, y0: 0.1, x1: 0.85, y1: 0.4 };
    getDropMock.mockResolvedValue(frameWith(raw));

    const { container } = render(
      <PhotoDropModal dropId={1} title="Плёнка" monthLabel="июль 2026" onClose={() => {}} />,
    );

    await waitFor(() => expect(container.querySelector(".artifact-box")).not.toBeNull());
    const box = container.querySelector<HTMLElement>(".artifact-box")!;

    expect(box.style.getPropertyValue("--label-max")).toBe("");
  });
});

/**
 * Advance paint frames until the developing animation starts. We wait for the EVENT rather than a
 * known frame count: the seam accepts its measurement only once the gallery's size settles, and a
 * test that knows that number breaks on every edit of the seam while checking nothing.
 */
async function untilMorph(scene: HTMLElement, state: string, maxFrames = 12): Promise<void> {
  for (let i = 0; i < maxFrames && scene.dataset.morph !== state; i += 1) {
    await act(async () => new Promise<void>((done) => requestAnimationFrame(() => done())));
  }
}

/**
 * Make the pictures "ready to paint": the animation waits for decoded pixels rather than the
 * frame appearing in markup (see [useDropMorph]), or the flight starts just as the browser begins
 * decoding. Pictures never load in jsdom, so readiness is set by hand.
 */
function imagesPaintable(): () => void {
  const proto = HTMLImageElement.prototype as unknown as Record<string, unknown>;
  const had = { complete: Object.getOwnPropertyDescriptor(proto, "complete"), natural: Object.getOwnPropertyDescriptor(proto, "naturalWidth") };
  Object.defineProperty(proto, "complete", { configurable: true, get: () => true });
  Object.defineProperty(proto, "naturalWidth", { configurable: true, get: () => 1 });
  return () => {
    if (had.complete) Object.defineProperty(proto, "complete", had.complete);
    if (had.natural) Object.defineProperty(proto, "naturalWidth", had.natural);
  };
}

describe("PhotoDropModal — кадры с плитки", () => {
  const photo = {
    imageUrl: "/api/film-media/1/0/web",
    thumbUrl: "/api/film-media/1/0/thumb",
    width: 300,
    height: 200,
  };

  it("открывается на кадрах плитки, не дожидаясь своего запроса", () => {
    // The tile already fetched `getDrop(id)` for its own layout, so the gallery need not show a
    // loader over the same data. The network never answers here.
    getDropMock.mockReturnValue(new Promise(() => {}));

    const { container } = render(
      <PhotoDropModal dropId={1} title="Плёнка" monthLabel={null} initialPhotos={[photo]} onClose={() => {}} />,
    );

    expect(container.querySelector(".blur-up-full")).not.toBeNull();
    expect(screen.queryByText("загрузка…")).toBeNull();
  });

  it("проявка стартует не раньше, чем стартовый кадр отрисован", async () => {
    const restoreImages = imagesPaintable();
    // The frame must SIT at the tile's place for at least one painted frame before moving. Start
    // the timeline before the gallery's first paint and the heavy work (decoding the shot and the
    // thumbnail strip) eats it: the animation is nearly over by the first frame the viewer sees.
    document.documentElement.style.setProperty("--drop-morph", "1");
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 300,
    } as DOMRect);
    getDropMock.mockReturnValue(new Promise(() => {}));
    const tile = document.createElement("div");
    document.body.append(tile);

    const { container } = render(
      <PhotoDropModal
        dropId={1}
        title="Плёнка"
        monthLabel={null}
        gallery="roll"
        initialPhotos={[photo]}
        origin={{ current: tile }}
        onClose={() => {}}
      />,
    );
    const scene = container.querySelector<HTMLElement>(".drop-scene")!;

    // The starting frame is not placed instantly: the seam first waits for the gallery's size to
    // stop changing, or the frame would "fly out" from an almost final size.
    await untilMorph(scene, "from");
    expect(scene.dataset.morph).toBe("from");

    await untilMorph(scene, "in");
    expect(scene.dataset.morph).toBe("in");

    document.documentElement.style.removeProperty("--drop-morph");
    tile.remove();
    restoreImages();
  });

  /**
   * A regression anchor to a measurement on the live stack: a flight begun before the pictures are
   * ready simply does not paint for its first third (17–20 frames of 27, with gaps up to 115ms),
   * so "the frame is in the markup" is no reason to fly.
   */
  it("не летит, пока картинки кадра не готовы к отрисовке", async () => {
    getDropMock.mockReturnValue(new Promise(() => {}));
    document.documentElement.style.setProperty("--drop-morph", "1");
    const tile = document.createElement("div");
    tile.getBoundingClientRect = () => ({ width: 100, height: 60, top: 10, left: 10, right: 110, bottom: 70, x: 10, y: 10, toJSON: () => "" });
    document.body.appendChild(tile);

    const { container } = render(
      <PhotoDropModal
        dropId={1}
        title="Плёнка"
        monthLabel={null}
        gallery="roll"
        initialPhotos={[photo]}
        origin={{ current: tile }}
        onClose={() => {}}
      />,
    );
    const scene = container.querySelector<HTMLElement>(".drop-scene")!;

    // There are no pictures in jsdom and never will be, so the seam must hold the scene waiting
    // rather than release a flight over an undecoded frame.
    await untilMorph(scene, "in");
    expect(scene.dataset.morph).toBe("wait");

    document.documentElement.style.removeProperty("--drop-morph");
    tile.remove();
  });

  it("галерея снимается не в момент посадки, а после досадки", async () => {
    const restoreImages = imagesPaintable();
    // The frame reaches the tile in `--drop-morph-out-ms`, and there its only difference from the
    // tile is the blur band with the caption. Removing it at that instant would reveal them with a
    // jerk; instead it dissolves for `--drop-morph-settle-ms` more, already still.
    const root = document.documentElement.style;
    root.setProperty("--drop-morph", "1");
    root.setProperty("--drop-morph-out-ms", "300ms");
    root.setProperty("--drop-morph-settle-ms", "200ms");
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 300,
    } as DOMRect);
    getDropMock.mockReturnValue(new Promise(() => {}));
    const onClose = vi.fn();
    const tile = document.createElement("div");
    document.body.append(tile);

    const { container } = render(
      <PhotoDropModal
        dropId={1}
        title="Плёнка"
        monthLabel={null}
        gallery="roll"
        initialPhotos={[photo]}
        origin={{ current: tile }}
        onClose={onClose}
      />,
    );
    const scene = container.querySelector<HTMLElement>(".drop-scene")!;
    await untilMorph(scene, "in");

    vi.useFakeTimers();
    fireEvent.click(scene);
    expect(scene.dataset.morph).toBe("out");
    // The frame is still travelling.
    await act(async () => void vi.advanceTimersByTime(299));
    expect(onClose).not.toHaveBeenCalled();
    // Arrived — but the gallery is still there, settling.
    await act(async () => void vi.advanceTimersByTime(1));
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => void vi.advanceTimersByTime(200));
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();

    root.removeProperty("--drop-morph");
    root.removeProperty("--drop-morph-out-ms");
    root.removeProperty("--drop-morph-settle-ms");
    tile.remove();
    restoreImages();
  });

  it("волна не просила проявки — галерея закрывается сразу, без ожидания анимации", () => {
    // There is no `--drop-morph` opt-in (see [useDropMorph]) ⇒ no return flight, and `onClose`
    // must fire in the same tick, or the gallery would hang on an empty timer.
    getDropMock.mockReturnValue(new Promise(() => {}));
    const onClose = vi.fn();

    const { container } = render(
      <PhotoDropModal dropId={1} title="Плёнка" monthLabel={null} initialPhotos={[photo]} onClose={onClose} />,
    );

    fireEvent.click(container.querySelector(".drop-scene")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
