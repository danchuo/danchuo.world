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
  it("ховер по артефакту → поповер с названием и датой первого упоминания", async () => {
    getArtifactsMock.mockResolvedValue([camera]);
    render(<ArtifactMarquee />);

    // Имя есть и в строке (дублируется x2), поповера ещё нет.
    const buttons = await screen.findAllByText("Камера");
    expect(buttons.length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Наводим на первый (видимый) артефакт → поповер с датой.
    fireEvent.mouseEnter(buttons[0].closest("button")!);
    const dialog = await screen.findByRole("dialog", { name: "Камера" });
    expect(dialog).toHaveTextContent("15 января 2026");
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

    // Подпись рендерится (дублируется x2 в бесшовной петле).
    const labels = await screen.findAllByText("Очки");
    expect(labels.length).toBeGreaterThan(0);
    // Картинки нет ⇒ ни одного <img> (рисуем пиксель-плейсхолдер), вёрстка не ломается.
    expect(container.querySelector("img")).toBeNull();
  });

  it("микс с картинкой и без — у второго img, у первого нет", async () => {
    getArtifactsMock.mockResolvedValue([
      { name: "Очки", imageUrl: null, firstMentionedOn: "2026-03-10" },
      camera,
    ]);
    const { container } = render(<ArtifactMarquee />);

    await screen.findAllByText("Камера");
    // Ровно картинки камеры (×2 за счёт дубля петли), у «Очков» картинки нет.
    const imgs = container.querySelectorAll("img");
    expect(imgs.length).toBe(2);
    imgs.forEach((img) => expect(img.getAttribute("alt")).toBe("Камера"));
  });
});
