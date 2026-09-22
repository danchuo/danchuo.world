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
  it("the find's name is always in the markup — hover has no screen reader", () => {
    render(<ArtifactBoxes boxes={[solid, flat]} shown={[]} />);
    expect(screen.getByText("банка монстра")).toBeInTheDocument();
    expect(screen.getByText("ракетка")).toBeInTheDocument();
  });

  it("the box under the hand is marked — that is the mark the wave highlights it by", () => {
    const { container } = render(<ArtifactBoxes boxes={[solid, flat]} shown={[2]} />);
    const marked = container.querySelectorAll(".artifact-box[data-shown]");
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toContain("ракетка");
  });

  it("next to the frame the find stands as an item, with no backing under it", () => {
    const { container } = render(<ArtifactBoxes boxes={[solid]} shown={[1]} aside />);

    expect(container.querySelector(".artifact-finds")).toBeInTheDocument();
    expect(container.querySelector(".artifact-find canvas")).toBeInTheDocument();
    // The plated card belongs to the editions that keep the find over the frame.
    expect(container.querySelector(".artifact-card")).toBeNull();
  });

  it("a find without a model shows its picture — in the same slot", () => {
    const { container } = render(<ArtifactBoxes boxes={[flat]} shown={[2]} aside />);

    const img = container.querySelector<HTMLImageElement>("img.artifact-find__face");
    expect(img).toBeInTheDocument();
    expect(img!.src).toContain("/racket.png");
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("without a mark nothing appears on hover beside the frame", () => {
    const { container } = render(<ArtifactBoxes boxes={[solid, flat]} shown={[]} aside />);
    expect(container.querySelector(".artifact-finds")).toBeNull();
  });
});

describe("ArtifactBoxes — the frame window in a find", () => {
  it("the frame address reaches the area via variables, not a second request", () => {
    const { container } = render(
      <ArtifactBoxes boxes={[solid]} shown={[]} aside shot="/api/film-media/4/26/web" />,
    );

    const box = container.querySelector(".artifact-box") as HTMLElement;
    expect(box.style.getPropertyValue("--shot")).toBe('url("/api/film-media/4/26/web")');
    expect(box.style.getPropertyValue("--shot-size")).not.toBe("");
    expect(box.style.getPropertyValue("--shot-pos")).not.toBe("");
  });

  it("without a frame there are no variables — the wave has nothing to develop and draws nothing", () => {
    const { container } = render(<ArtifactBoxes boxes={[solid]} shown={[]} aside />);

    const box = container.querySelector(".artifact-box") as HTMLElement;
    expect(box.style.getPropertyValue("--shot")).toBe("");
  });
});
