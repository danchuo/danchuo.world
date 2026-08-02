import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoDropModal } from "./PhotoDropModal";

vi.mock("@/lib/api/client", () => ({ getDrop: vi.fn() }));
import { getDrop } from "@/lib/api/client";
const getDropMock = vi.mocked(getDrop);

afterEach(() => vi.clearAllMocks());

describe("PhotoDropModal — blur-up загрузка", () => {
  it("кадр стоит из размытого thumb, полный проступает по onLoad", async () => {
    getDropMock.mockResolvedValue([
      { imageUrl: "/api/film-media/1/0/web", thumbUrl: "/api/film-media/1/0/thumb", width: 300, height: 400 },
    ]);

    const { container } = render(
      <PhotoDropModal dropId={1} title="Плёнка" monthLabel="июль 2026" onClose={() => {}} />,
    );

    // Дождаться загрузки кадров.
    await waitFor(() => expect(container.querySelector(".blur-up-full")).not.toBeNull());

    const thumb = container.querySelector<HTMLImageElement>(".blur-up-thumb")!;
    const full = container.querySelector<HTMLImageElement>(".blur-up-full")!;

    // thumb — сразу виден (blur), полный ещё не загружен (скрыт).
    expect(thumb).toHaveAttribute("src", "/api/film-media/1/0/thumb");
    expect(full).toHaveAttribute("src", "/api/film-media/1/0/web");
    expect(full).toHaveAttribute("loading", "lazy");
    expect(full.dataset.loaded).toBe("false");

    // Полный кадр догрузился — проступает поверх.
    fireEvent.load(full);
    expect(full.dataset.loaded).toBe("true");
  });

  it("thumb остаётся непрозрачной подложкой — фон не мелькает в кросс-фейде", async () => {
    // Регрессионный якорь на «розовый проскок»: раньше thumb гасили одновременно с проявлением
    // полного кадра, и на середине перехода сквозь оба полупрозрачных слоя мелькал фон тайла.
    // thumb НЕ должен получать механизм затухания (ни data-атрибута, ни inline opacity:0)
    // ни до, ни после загрузки полного кадра.
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

    notFaded(); // до загрузки
    fireEvent.load(full);
    notFaded(); // и после — подложка остаётся плотной
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
    // Показываем именно тот кадр, по которому кликнули, и в полном размере (web, не thumb).
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
    // Набор кадров на месте.
    expect(screen.getAllByRole("button", { name: /открыть кадр/ })).toHaveLength(2);

    // Второй Esc — уже про саму галерею.
    fireEvent.keyDown(window, { key: "Escape" });
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
    // Промах мимо фона не должен стоить просмотра — закрытие это решение (фон/✕/Esc).
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

    // Доли переживают любой размер рендера — множитель задаёт вёрстка, а не бэкенд.
    // Рамка шире находки на запас 15% с каждой стороны: 0.25..0.75 ⇒ 0.175..0.825.
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

  /** Курсор в долях кадра: в jsdom размеров нет, поэтому рамку кадра задаём сами. */
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
    // Подсказка привязана к своей рамке, а не к кадру: находок бывает несколько.
    expect(cards[0].parentElement).toHaveClass("artifact-box");
  });

  it("в полноэкранном кадре находки подписаны сразу — без наведения", async () => {
    // Тач-флоу (§7.5): ховера на телефоне нет, а тап по кадру уже занят открытием на весь
    // экран. Поэтому объясняет находку сам полноэкранный кадр: рамки те же, но карточки видны
    // без жеста. Довод «постоянные подписи — шум» тут не работает: кадр ровно один, не 36.
    getDropMock.mockResolvedValue(twoFinds);
    const { container } = render(
      <PhotoDropModal dropId={1} title="Плёнка" monthLabel={null} onClose={() => {}} />,
    );
    const frames = await screen.findAllByRole("button", { name: /открыть кадр/ });
    fireEvent.click(frames[0]);

    const lightbox = screen.getByRole("dialog", { name: "кадр 1 из 1" });
    // Ни одного mouseMove не было — карточки обеих находок всё равно на месте.
    expect(lightbox.querySelectorAll(".artifact-box")).toHaveLength(2);
    expect(lightbox.querySelectorAll(".artifact-card")).toHaveLength(2);
    expect(lightbox).toHaveTextContent("Очки");
    expect(lightbox).toHaveTextContent("Футболка");
  });

  it("рамки в полноэкранном кадре не перехватывают закрытие по фону", async () => {
    // Рамка лежит поверх картинки; если бы она ловила указатель, промах мимо предмета
    // закрывал бы просмотр (клик по картинке закрывать не должен — регрессионный якорь).
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
    // Ракетка нарисована стоймя, а слот карточки лежачий: без поворота предмет вырождается
    // в нитку. Флаг `rotatable` тут тот же, что в ленте, — карточка обязана его уважать.
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
    // До onLoad пропорция неизвестна — предмет рисуется как есть.
    expect(img).not.toHaveClass("artifact-card__img--tilted");

    Object.defineProperty(img, "naturalWidth", { value: 619, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: 2055, configurable: true });
    fireEvent.load(img);
    expect(img).toHaveClass("artifact-card__img--tilted");
  });

  it("без разрешения предмет в карточке не поворачивается", async () => {
    const view = await renderFrame(); // очки: rotatable не задан
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
    // Иначе порядок диктует разметка: одна и та же плашка всегда сверху, и подвести мышь
    // к нижней находке нельзя вовсе — её карточку не увидеть.
    const { container, frame } = await renderFrame();

    const zOf = (name: string) =>
      Number(
        [...container.querySelectorAll<HTMLElement>(".artifact-card")]
          .find((c) => c.textContent === name)!.style.zIndex,
      );

    // Сперва только футболка, затем въезжаем в пересечение ⇒ очки пришли позже.
    hoverAt(frame, 0.8, 0.8);
    hoverAt(frame, 0.3, 0.3);
    expect(zOf("Очки")).toBeGreaterThan(zOf("Футболка"));

    // Тем же курсором в обратном порядке — сверху уже футболка.
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
    // Подсказка живёт по ховеру, а ховера у скринридера нет — имя обязано быть в разметке
    // всегда, иначе находка для него просто не существует.
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
    // Регрессионный якорь на два бага сразу. Клип со всего кадра снимали, чтобы подпись не
    // срезалась, — и получили ореол: filter: blur() расплывается ЗА границы элемента, и клип
    // был единственным, что его держало. Ответ — клипует ровно то, что размывается: обёртка
    // картинок. Сам кадр не клипует, поэтому подпись вправе выйти за него целиком.
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
    // Узкая рамка у правого края — худший случай: раньше подпись упиралась в край кадра и
    // усекалась многоточием («2YK Su…»), потому что кадр клипует. Теперь клипует только
    // картинка, и подпись выходит за кадр целиком — потолок ей больше не нужен.
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
