import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactView } from "@/lib/api/types";
import { ArtifactMarquee } from "./ArtifactMarquee";
import { ARTIFACT_SIZE, artifactBox } from "@/lib/artifactBox";

vi.mock("@/lib/api/client", () => ({ getArtifacts: vi.fn() }));
import { getArtifacts } from "@/lib/api/client";
const getArtifactsMock = vi.mocked(getArtifacts);

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
});

/** Заставляет ленту «не влезть» ⇒ она едет и дублирует контент (в jsdom размеров нет). */
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
  name: "Камера",
  imageUrl: "/assets/artifacts/camera.png",
  firstMentionedOn: "2026-01-15",
};

// Пропорции реальных предметов ленты (w/h самих PNG).
const GLASSES = 922 / 318; // 2.90 — вытянуты поперёк себя, «лежат»
const RACKET = 330 / 1257; // 0.26 — вытянута вдоль себя, «стоит»
const CAMERA = 1262 / 829; // 1.52 — почти квадратная

/** Оптический вес предмета — сторона квадрата той же площади. */
const presence = (b: { width: number; height: number }) => Math.sqrt(b.width * b.height);

describe("artifactBox — набок только с разрешения, вес общий", () => {
  it("ракетке класться разрешено ⇒ в горизонтальной ленте она ложится вдоль", () => {
    const racket = artifactBox(RACKET, false, true);

    expect(racket.rotate).toBe(true);
    // Длинная сторона легла вдоль ленты (иначе ракетка была бы ниткой в 11px).
    expect(racket.width).toBeGreaterThan(racket.height);
  });

  it("очкам класться НЕ разрешено ⇒ в вертикальной ленте волны 02 они не встают на бок", () => {
    // Правило не геометрическое: у очков есть «правильная сторона», у ракетки её нет.
    // Пропорцией это не выводится — поэтому разрешение хранится у самого предмета.
    const box = artifactBox(GLASSES, true, false);
    expect(box.rotate).toBe(false);
    expect(box.width / box.height).toBeCloseTo(GLASSES, 2);
  });

  it("разрешение само по себе не крутит: предмет уже лежит вдоль ленты", () => {
    expect(artifactBox(RACKET, true, true).rotate).toBe(false); // вертикальная лента
    expect(artifactBox(GLASSES, false, true).rotate).toBe(false); // горизонтальная
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
    // Равнять по высоте нельзя: широкие очки при той же высоте занимают вдвое больше
    // места, чем почти квадратная камера, и читаются крупнее. Равняем оптический вес.
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

    // В jsdom нет ResizeObserver ⇒ лента не едет ⇒ один предмет рендерится один раз (без дубля).
    const label = await screen.findByText("Камера");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Клик по предмету открывает меню с датой (ховер сам меню НЕ открывает).
    fireEvent.click(label.closest("button")!);
    const dialog = await screen.findByRole("dialog", { name: "Камера" });
    expect(dialog).toHaveTextContent("15 января 2026");
  });

  it("на едущей ленте кликается и копия предмета — мимо неё промахнуться нельзя", async () => {
    // Лента дублирует контент для бесшовной петли, и мимо зрителя едут обе копии:
    // если клик живёт только у первой, каждый второй проход предметы «не нажимаются».
    forceScrolling();
    getArtifactsMock.mockResolvedValue([camera]);
    render(<ArtifactMarquee />);

    // Дубль появляется вторым проходом (после замера), поэтому ждём именно двух копий.
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

    // Жёсткая ширина + потолок высоты = искажение: у вытянутого предмета (ракетка ~1:3.8)
    // высота упирается в потолок, а заданная ширина не ужимается вслед — предмет плющит.
    // Поэтому обе стороны ограничиваем ТОЛЬКО потолками, размер считает браузер по пропорции.
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
    // Не едет ⇒ контент не дублирован: ровно один предмет (одна картинка).
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
    // Предметы разной пропорции дают разную высоту картинки (вес считается по площади), и
    // подпись под ними прыгала вверх-вниз от предмета к предмету. Слот держит поперечный
    // габарит ленты независимо от того, что в нём лежит, — строка подписей ровная.
    getArtifactsMock.mockResolvedValue([
      { name: "Очки", imageUrl: "/assets/artifacts/glasses.png", firstMentionedOn: "2026-03-10" },
      { name: "Ракетка", imageUrl: "/assets/artifacts/racket.png", firstMentionedOn: "2026-04-01" },
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
    // Место ВДОЛЬ ленты остаётся за самим предметом — слот равняет только поперечник.
    expect(glasses.parentElement!.style.width).not.toBe(racket.parentElement!.style.width);
  });

  it("артефакт без картинки → плейсхолдер вместо img, подпись на месте", async () => {
    getArtifactsMock.mockResolvedValue([
      { name: "Очки", imageUrl: null, firstMentionedOn: "2026-03-10" },
    ]);
    const { container } = render(<ArtifactMarquee />);

    expect(await screen.findByText("Очки")).toBeInTheDocument();
    // Картинки нет ⇒ ни одного <img> (рисуем пиксель-плейсхолдер), вёрстка не ломается.
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("ArtifactMarquee — лента листается рукой (§7.2)", () => {
  /**
   * Собственный ход ленты в этих тестах выключен режимом «меньше движения»: он идёт по кадрам
   * и сдвигал бы замеряемое смещение на случайные доли пикселя. Заодно это и проверка правила —
   * ход борда режим гасит, а протяжку рукой нет: её затеял сам зритель.
   */
  beforeEach(() => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }));
  });

  /** Точка указателя: в jsdom нет `PointerEvent`, а без координат протяжка считалась бы из NaN. */
  function pointer(target: Window | HTMLElement, type: string, x: number) {
    fireEvent(
      target,
      new MouseEvent(type, { clientX: x, clientY: 0, bubbles: true, cancelable: true }),
    );
  }

  /** Протяжка по ленте: нажали на предмете, повели, отпустили. */
  function dragBy(from: HTMLElement, startX: number, endX: number) {
    pointer(from, "pointerdown", startX);
    pointer(window, "pointermove", endX);
    pointer(window, "pointerup", endX);
  }

  /** Едущая лента с одним предметом: контент дублирован, копия одна ⇒ шаг петли = scrollWidth/2. */
  async function renderScrolling() {
    forceScrolling();
    getArtifactsMock.mockResolvedValue([camera]);
    const { container } = render(<ArtifactMarquee />);
    await waitFor(() => expect(screen.getAllByText("Камера")).toHaveLength(2));
    const track = container.querySelector(".artifact-track") as HTMLElement;
    const btn = screen.getAllByText("Камера")[0].closest("button")!;
    return { track, btn };
  }

  it("тянем влево — лента уезжает вперёд ровно на пройденный путь", async () => {
    const { track, btn } = await renderScrolling();

    pointer(btn, "pointerdown", 200);
    pointer(window, "pointermove", 140);

    // Лента идёт за рукой в тот же кадр: ждать следующего тика анимации нельзя, иначе
    // протяжка ощущается как «толкнул и посмотрел, что вышло».
    expect(track.style.left).toBe("-60px");
  });

  it("тянем вправо — лента листается НАЗАД и заходит с конца копии, а не упирается в край", async () => {
    // Полкопии ленты уже уехало? Неважно: назад можно листать бесконечно, как и вперёд.
    // Шаг петли тут 500 (scrollWidth 1000 на две копии), поэтому −60 читается как 440.
    const { track, btn } = await renderScrolling();

    dragBy(btn, 200, 260);

    // Точное число зависит от шага петли (он меряется по вёрстке), поэтому проверяем суть:
    // лента ушла далеко ЗА пройденные 60px — то есть зашла с конца копии, а не встала в ноль.
    expect(track.style.left).not.toBe("0px");
    expect(Number.parseFloat(track.style.left)).toBeLessThan(-60);
  });

  it("после протяжки клик по предмету меню НЕ открывает", async () => {
    // Протащить ленту за предмет — обычное дело: предметы занимают её почти целиком.
    // Если такой жест ещё и открывает меню, листать ленту нельзя вовсе.
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
    // Браузер фокусирует кнопку на нажатии: фокус открывал меню, а следующий за ним клик
    // (тот же предмет ⇒ переключатель) закрывал его. Мышью меню не открывалось вовсе.
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

  it("лента влезла целиком ⇒ листать нечего: протяжка её не двигает", async () => {
    getArtifactsMock.mockResolvedValue([camera]);
    const { container } = render(<ArtifactMarquee />);
    await screen.findByText("Камера");
    const track = container.querySelector(".artifact-track") as HTMLElement;

    dragBy(screen.getByText("Камера").closest("button")!, 200, 140);

    expect(track.style.left).toBe("");
  });
});
