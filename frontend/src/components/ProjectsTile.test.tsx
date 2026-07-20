import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectView } from "@/lib/api/types";
import { ProjectsTile } from "./ProjectsTile";

vi.mock("@/lib/api/client", () => ({ getProjects: vi.fn() }));
import { getProjects } from "@/lib/api/client";
const getProjectsMock = vi.mocked(getProjects);

afterEach(() => vi.clearAllMocks());

function project(over: Partial<ProjectView> = {}): ProjectView {
  return {
    iconUrl: null,
    title: "danchuo.world",
    description: null,
    startYear: 2026,
    startQuarter: 1,
    endYear: null,
    endQuarter: null,
    url: "https://github.com/dontyouo",
    ...over,
  };
}

describe("ProjectsTile", () => {
  it("рендерит проект с диапазоном и ссылкой на названии", async () => {
    getProjectsMock.mockResolvedValue([project()]);
    render(<ProjectsTile />);

    expect(await screen.findByText("danchuo.world")).toBeInTheDocument();
    expect(screen.getByText("danchuo.world").closest("a")).toHaveAttribute(
      "href",
      "https://github.com/dontyouo",
    );
    expect(screen.getByText("Q1 2026 — наст.")).toBeInTheDocument();
  });

  it("спрайт-планета из /assets/projects/: пиксель-арт (-px) — pixelated и своя доля, гладкий — на ступень крупнее", async () => {
    getProjectsMock.mockResolvedValue([
      project({ iconUrl: "/assets/projects/danchuo-world-px.png" }),
      project({ title: "proxemics", iconUrl: "/assets/projects/proxemics.png" }),
    ]);
    const { container } = render(<ProjectsTile />);
    await screen.findByText("proxemics");

    // Размеры — доли контейнера в CSS (DESIGN §8.1), поэтому в jsdom проверяем выбор класса,
    // а не вычисленные пиксели: clamp/cqw тут не считаются. Пропорции закреплены e2e-замером.
    const [pixel, smooth] = Array.from(container.querySelectorAll("img"));
    expect(pixel).toHaveClass("project-sprite");
    expect(pixel.style.imageRendering).toBe("pixelated");
    // Smooth sprite is drawn one step bigger: without a chunky pixel outline it
    // optically reads smaller than pixel art of the same box.
    expect(smooth).toHaveClass("project-sprite--smooth");
    expect(smooth.style.imageRendering).toBe("");
    // Both sit in one uniform icon column so row texts start at the same x.
    expect(pixel.parentElement).toHaveClass("project-slot");
    expect(smooth.parentElement).toHaveClass("project-slot");
  });

  it("сторонний фавикон — легаси-подача (мельче спрайта, со скруглением)", async () => {
    getProjectsMock.mockResolvedValue([
      project({ iconUrl: "https://example.com/favicon.ico" }),
    ]);
    const { container } = render(<ProjectsTile />);
    await screen.findByText("danchuo.world");

    const img = container.querySelector("img");
    expect(img).toHaveClass("project-favicon");
    expect(img).not.toHaveClass("project-sprite");
    expect(img?.parentElement).not.toHaveClass("project-slot");
  });

  it("orientation=horizontal → лента-ряд (модификатор на списке)", async () => {
    getProjectsMock.mockResolvedValue([project(), project({ title: "proxemics" })]);
    const { container } = render(<ProjectsTile orientation="horizontal" />);
    await screen.findByText("proxemics");
    expect(container.querySelector(".projects-list--horizontal")).toBeInTheDocument();
  });

  it("без orientation → вертикальный список (дефолт, как во всех волнах до)", async () => {
    getProjectsMock.mockResolvedValue([project()]);
    const { container } = render(<ProjectsTile />);
    await screen.findByText("danchuo.world");
    expect(container.querySelector(".projects-list--horizontal")).not.toBeInTheDocument();
  });

  it("пустой список → тихое пустое состояние", async () => {
    getProjectsMock.mockResolvedValue([]);
    render(<ProjectsTile />);
    expect(await screen.findByText("нет проектов")).toBeInTheDocument();
  });

  it("сбой → состояние ошибки", async () => {
    getProjectsMock.mockRejectedValue(new Error("boom"));
    render(<ProjectsTile />);
    await waitFor(() => expect(screen.getByText("не удалось загрузить")).toBeInTheDocument());
  });

  it("сбой при наличии кэш-копии → показывает её, а не пустоту/ошибку", async () => {
    // Прошлая удачная загрузка (как после серии F5 с рейтлимитом на повторе).
    window.localStorage.setItem(
      "dw:cache:v1:projects",
      JSON.stringify({ t: Date.now(), v: [project({ title: "из кэша" })] }),
    );
    getProjectsMock.mockRejectedValue(new Error("rate limited"));
    render(<ProjectsTile />);

    expect(await screen.findByText("из кэша")).toBeInTheDocument();
    expect(screen.queryByText("не удалось загрузить")).not.toBeInTheDocument();
  });
});
