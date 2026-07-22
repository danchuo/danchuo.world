import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArtifactView } from "@/lib/api/types";
import { ArtifactMarquee } from "./ArtifactMarquee";

vi.mock("@/lib/api/client", () => ({ getArtifacts: vi.fn() }));
import { getArtifacts } from "@/lib/api/client";
const getArtifactsMock = vi.mocked(getArtifacts);

afterEach(() => vi.clearAllMocks());

const camera: ArtifactView = {
  name: "Камера",
  imageUrl: "/assets/artifacts/camera.png",
  firstMentionedOn: "2026-01-15",
};

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

  it("повторный клик по тому же предмету закрывает меню", async () => {
    getArtifactsMock.mockResolvedValue([camera]);
    render(<ArtifactMarquee />);

    const btn = (await screen.findByText("Камера")).closest("button")!;
    fireEvent.click(btn);
    expect(await screen.findByRole("dialog", { name: "Камера" })).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
