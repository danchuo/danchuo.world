import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArtifactView } from "@/lib/api/types";
import { ArtifactMarquee, artifactBox } from "./ArtifactMarquee";

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
