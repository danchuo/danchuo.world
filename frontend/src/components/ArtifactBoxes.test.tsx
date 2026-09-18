import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArtifactBoxView } from "@/lib/api/types";
import { ArtifactBoxes } from "./ArtifactBoxes";

vi.mock("@/lib/artifact3dStage", () => ({ mountArtifact: vi.fn().mockResolvedValue(null) }));

afterEach(() => vi.clearAllMocks());

const solid: ArtifactBoxView = {
  artifactId: 1,
  name: "банка монстра",
  imageUrl: "/monster.png",
  model3dUrl: "/monster.glb",
  x0: 0.1, y0: 0.1, x1: 0.4, y1: 0.5,
};
const flat: ArtifactBoxView = {
  artifactId: 2,
  name: "ракетка",
  imageUrl: "/racket.png",
  model3dUrl: null,
  x0: 0.5, y0: 0.2, x1: 0.8, y1: 0.6,
};

describe("ArtifactBoxes", () => {
  it("имя находки лежит в разметке всегда — у ховера нет скринридера", () => {
    render(<ArtifactBoxes boxes={[solid, flat]} shown={[]} />);
    expect(screen.getByText("банка монстра")).toBeInTheDocument();
    expect(screen.getByText("ракетка")).toBeInTheDocument();
  });

  it("рамка под рукой помечена — по этой метке волна её и подсвечивает", () => {
    const { container } = render(<ArtifactBoxes boxes={[solid, flat]} shown={[2]} />);
    const marked = container.querySelectorAll(".artifact-box[data-shown]");
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toContain("ракетка");
  });

  it("рядом с кадром находка встаёт предметом, и подложки под ним нет", () => {
    const { container } = render(<ArtifactBoxes boxes={[solid]} shown={[1]} aside />);

    expect(container.querySelector(".artifact-finds")).toBeInTheDocument();
    expect(container.querySelector(".artifact-find canvas")).toBeInTheDocument();
    // The plated card belongs to the editions that keep the find over the frame.
    expect(container.querySelector(".artifact-card")).toBeNull();
  });

  it("у находки без модели показывается её картинка — в том же слоте", () => {
    const { container } = render(<ArtifactBoxes boxes={[flat]} shown={[2]} aside />);

    const img = container.querySelector<HTMLImageElement>("img.artifact-find__face");
    expect(img).toBeInTheDocument();
    expect(img!.src).toContain("/racket.png");
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("без метки наведения рядом с кадром не появляется ничего", () => {
    const { container } = render(<ArtifactBoxes boxes={[solid, flat]} shown={[]} aside />);
    expect(container.querySelector(".artifact-finds")).toBeNull();
  });
});
