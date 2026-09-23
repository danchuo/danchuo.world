import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectView } from "@/lib/api/types";
import { ProjectsTile } from "./ProjectsTile";

// The 3D artifact scene is stubbed: jsdom has no WebGL, and what we check is the choice of
// presentation by address.
vi.mock("@/lib/artifact3dStage", () => ({
  mountArtifact: vi.fn(async () => ({ setSpinning: vi.fn(), resize: vi.fn(), dispose: vi.fn() })),
}));
vi.mock("@/lib/api/client", () => ({ getProjects: vi.fn() }));
import { getProjects } from "@/lib/api/client";
const getProjectsMock = vi.mocked(getProjects);

afterEach(() => {
  vi.clearAllMocks();
  // The year-grouping tests fake the clock: "this year" decides where an open-ended project lands,
  // and without freezing it the run would depend on the date it was started.
  vi.useRealTimers();
});

function project(over: Partial<ProjectView> = {}): ProjectView {
  return {
    iconUrl: null,
    modelUrl: null,
    title: "danchuo.world",
    description: null,
    startYear: 2026,
    startQuarter: 1,
    endYear: null,
    endQuarter: null,
    url: "https://github.com/dontyouo",
    homeUrl: null,
    ...over,
  };
}

describe("ProjectsTile", () => {
  it("renders a project with a range and a link on the title", async () => {
    getProjectsMock.mockResolvedValue([project()]);
    render(<ProjectsTile />);

    expect(await screen.findByText("danchuo.world")).toBeInTheDocument();
    expect(screen.getByText("danchuo.world").closest("a")).toHaveAttribute(
      "href",
      "https://github.com/dontyouo",
    );
    expect(screen.getByText("Q1 2026 — наст.")).toBeInTheDocument();
  });

  it("the wave asks for volume — a planet with a model stands as a 3D artifact in the same slot", async () => {
    getProjectsMock.mockResolvedValue([
      project({ iconUrl: "/assets/projects/danchuo-world-px.png", modelUrl: "/assets/3d/wireframe-globe.glb" }),
    ]);
    const { container } = render(<ProjectsTile planet="model" />);
    await screen.findByText("danchuo.world");

    const artifact = container.querySelector("canvas");
    expect(artifact).toHaveClass("project-artifact");
    // The same slot as the flat planets: row texts begin at one x whatever the planet wears.
    expect(artifact?.parentElement).toHaveClass("project-slot");
    // Exactly one presentation: the sprite is not drawn as a second layer.
    expect(container.querySelector("img")).toBeNull();
  });

  it("a wave without `planet: model` keeps the flat sprite", async () => {
    getProjectsMock.mockResolvedValue([
      project({ iconUrl: "/assets/projects/danchuo-world-px.png", modelUrl: "/assets/3d/wireframe-globe.glb" }),
    ]);
    const { container } = render(<ProjectsTile />);
    await screen.findByText("danchuo.world");

    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("img")).toHaveClass("project-sprite");
  });

  it("the wave asks for volume but the project has no model — the sprite quietly stays", async () => {
    getProjectsMock.mockResolvedValue([
      project({ title: "proxemics", iconUrl: "/assets/projects/proxemics.png", modelUrl: null }),
    ]);
    const { container } = render(<ProjectsTile planet="model" />);
    await screen.findByText("proxemics");

    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("img")).toHaveClass("project-sprite--smooth");
  });

  it("a sprite planet from /assets/projects/: pixel art (-px) is pixelated with its own share, smooth art is one step larger", async () => {
    getProjectsMock.mockResolvedValue([
      project({ iconUrl: "/assets/projects/danchuo-world-px.png" }),
      project({ title: "proxemics", iconUrl: "/assets/projects/proxemics.png" }),
    ]);
    const { container } = render(<ProjectsTile />);
    await screen.findByText("proxemics");

    // Sizes are fractions of the container in CSS (DESIGN §8.1), so in jsdom we check the class
    // rather than computed pixels: clamp/cqw are not evaluated. Proportions are pinned by e2e.
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

  it("a third-party favicon is drawn smaller than a sprite, with rounding", async () => {
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

  it("orientation=horizontal → a row ribbon (modifier on the list)", async () => {
    getProjectsMock.mockResolvedValue([project(), project({ title: "proxemics" })]);
    const { container } = render(<ProjectsTile orientation="horizontal" />);
    await screen.findByText("proxemics");
    expect(container.querySelector(".projects-list--horizontal")).toBeInTheDocument();
  });

  it("without orientation → a vertical list (the default, as in every wave before)", async () => {
    getProjectsMock.mockResolvedValue([project()]);
    const { container } = render(<ProjectsTile />);
    await screen.findByText("danchuo.world");
    expect(container.querySelector(".projects-list--horizontal")).not.toBeInTheDocument();
  });

  /**
   * The `console` edition (DESIGN §7.8): a `tree` listing instead of a label row. The set of
   * editions is the tile's knowledge, not the layout registry's, so an unknown name is the default.
   */
  describe("console edition", () => {
    it("the tile caption is a shell prompt, not the word \"projects\"", async () => {
      getProjectsMock.mockResolvedValue([project()]);
      render(<ProjectsTile edition="console" />);
      await screen.findByText("danchuo.world");
      expect(screen.getByText("~/projects")).toBeInTheDocument();
      expect(screen.getByText("tree -L 1")).toBeInTheDocument();
    });

    /**
     * Two links with different jobs: the shown path leads where it points, while the title and
     * picture lead to the project's home (for proxemics the code is a repo, the project a bot).
     */
    it("the title and the picture lead to the project's home, the path to its own address", async () => {
      getProjectsMock.mockResolvedValue([
        project({
          title: "proxemics",
          iconUrl: "/assets/projects/proxemics.png",
          url: "https://github.com/danchuo/proxemics",
          homeUrl: "https://t.me/proxemics_bot",
        }),
      ]);
      const { container } = render(<ProjectsTile edition="console" />);
      await screen.findByText("proxemics");

      expect(screen.getByText("proxemics").closest("a")).toHaveAttribute("href", "https://t.me/proxemics_bot");
      expect(container.querySelector("img")?.closest("a")).toHaveAttribute("href", "https://t.me/proxemics_bot");
      expect(screen.getByText("danchuo/proxemics").closest("a")).toHaveAttribute(
        "href",
        "https://github.com/danchuo/proxemics",
      );
    });

    /** With no separate home, the title and picture lead where the shown path does. */
    it("without a home the title follows the shown path", async () => {
      getProjectsMock.mockResolvedValue([
        project({ title: "danchuo.world", iconUrl: "/assets/projects/danchuo-world-px.png", url: "https://danchuo.world" }),
      ]);
      const { container } = render(<ProjectsTile edition="console" />);
      await screen.findByText("danchuo.world");

      expect(container.querySelector(".project-title")).toHaveAttribute("href", "https://danchuo.world");
      expect(container.querySelector("img")?.closest("a")).toHaveAttribute("href", "https://danchuo.world");
    });

    /**
     * A site named by its own address: a second line would repeat the title in another voice and
     * colour while saying nothing new, so it simply is not there.
     */
    it("a path literally equal to the title is not printed as a second line", async () => {
      getProjectsMock.mockResolvedValue([
        project({ title: "danchuo.world", url: "https://danchuo.world" }),
      ]);
      const { container } = render(<ProjectsTile edition="console" />);
      await screen.findByText("danchuo.world");

      expect(container.querySelector(".project-repo")).toBeNull();
    });

    /**
     * Time goes in the row's left margin rather than a right-hand column (DESIGN §7.8): there is
     * no right column at all. The year follows the LAST activity, so an open end lands in the
     * current one.
     */
    it("the year is in the left margin; there is no range column in the row", async () => {
      vi.setSystemTime(new Date("2031-09-07T10:00:00Z"));
      getProjectsMock.mockResolvedValue([
        project({ title: "danchuo.world", endYear: null }),
        project({ title: "proxemics", endYear: 2024, endQuarter: 2 }),
      ]);
      const { container } = render(<ProjectsTile edition="console" />);
      await screen.findByText("proxemics");

      const years = [...container.querySelectorAll(".projects-year__head")].map((h) => h.textContent);
      expect(years).toEqual(["2031", "2024"]);
      // A year is joined to its subtree by a horizontal — one per printed year.
      expect(container.querySelectorAll(".projects-year__link")).toHaveLength(2);
      expect(container.querySelector(".projects-console .project-range")).toBeNull();
      expect(screen.queryByText(/Q\d/)).not.toBeInTheDocument();
    });

    /** Each year is its own subtree: the trunk grows from the year, and the elbow closes ITS year. */
    it("branches are counted within a year: a corner in each group", async () => {
      vi.setSystemTime(new Date("2031-09-07T10:00:00Z"));
      getProjectsMock.mockResolvedValue([
        project({ title: "a", endYear: null }),
        project({ title: "b", endYear: 2031 }),
        project({ title: "c", endYear: 2024 }),
      ]);
      const { container } = render(<ProjectsTile edition="console" />);
      await screen.findByText("c");

      // Group 2031 = [a, b]: a head and an elbow. Group 2024 = [c]: a singleton, so no trunk.
      const branches = [...container.querySelectorAll(".project-branch")].map((b) => b.getAttribute("data-branch"));
      expect(branches).toEqual(["head", "corner", "only"]);
      // The year prints once per group: the second row's margin is empty.
      const years = [...container.querySelectorAll(".projects-year__gutter")].map((g) => g.textContent);
      expect(years).toEqual(["2031", "", "2024"]);
    });

    /**
     * Currency shows by brightness, not by a sign: the state travels as a row attribute and the
     * skin colours it (`ls --color`, not `-F`). A screen reader is told the same in words.
     */
    it("live and finished projects differ by the row's state", async () => {
      vi.setSystemTime(new Date("2031-09-07T10:00:00Z"));
      getProjectsMock.mockResolvedValue([
        project({ title: "a", endYear: null }),
        project({ title: "b", endYear: 2031 }),
      ]);
      const { container } = render(<ProjectsTile edition="console" />);
      await screen.findByText("b");

      const states = [...container.querySelectorAll(".project-console")].map((r) => r.getAttribute("data-state"));
      expect(states).toEqual(["live", "archived"]);
      expect(screen.getAllByText("завершён")).toHaveLength(1);
    });

    it("a project without links — not a single hyperlink in the row", async () => {
      getProjectsMock.mockResolvedValue([project({ url: null })]);
      const { container } = render(<ProjectsTile edition="console" />);
      await screen.findByText("danchuo.world");

      expect(container.querySelector(".project-console a")).toBeNull();
      expect(container.querySelector(".project-repo")).toBeNull();
    });

    /**
     * Rows hang off the branch and the elbow closes the list. We check the order of branch kinds
     * in the markup — the choice of kind itself is checked in `projectTree.test.ts`, and the lines
     * are drawn in CSS, so only this attribute survives into the markup.
     */
    it("rows hang on branches, the corner goes to the last one", async () => {
      getProjectsMock.mockResolvedValue([
        project({ title: "danchuo.world" }),
        project({ title: "proxemics" }),
        project({ title: "третий" }),
      ]);
      const { container } = render(<ProjectsTile edition="console" />);
      await screen.findByText("третий");

      // The year stands left of the first row and the trunk grows from it: `head`, not `tee`.
      const branches = [...container.querySelectorAll(".project-branch")].map((b) => b.getAttribute("data-branch"));
      expect(branches).toEqual(["head", "tee", "corner"]);
    });

    it("an unknown edition → the plain list, without the prompt and paths", async () => {
      getProjectsMock.mockResolvedValue([project()]);
      const { container } = render(<ProjectsTile edition="катушка" />);
      await screen.findByText("danchuo.world");

      expect(screen.queryByText("~/projects")).not.toBeInTheDocument();
      expect(container.querySelector(".project-console")).toBeNull();
      expect(container.querySelector(".projects-list")).toBeInTheDocument();
    });
  });

  it("an empty list → a quiet empty state", async () => {
    getProjectsMock.mockResolvedValue([]);
    render(<ProjectsTile />);
    expect(await screen.findByText("нет проектов")).toBeInTheDocument();
  });

  it("failure → error state", async () => {
    getProjectsMock.mockRejectedValue(new Error("boom"));
    render(<ProjectsTile />);
    await waitFor(() => expect(screen.getByText("не удалось загрузить")).toBeInTheDocument());
  });

  it("a failure with a cached copy → shows the copy, not emptiness/an error", async () => {
    // A previous successful load (as after a run of F5 with a rate limit on the retry).
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
