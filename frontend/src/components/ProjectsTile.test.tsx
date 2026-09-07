import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectView } from "@/lib/api/types";
import { ProjectsTile } from "./ProjectsTile";

// Сцену 3D-артефакта подменяем: в jsdom нет WebGL, а проверяем мы выбор ПОДАЧИ по адресу.
vi.mock("@/lib/artifact3dStage", () => ({
  mountArtifact: vi.fn(async () => ({ setSpinning: vi.fn(), resize: vi.fn(), dispose: vi.fn() })),
}));
vi.mock("@/lib/api/client", () => ({ getProjects: vi.fn() }));
import { getProjects } from "@/lib/api/client";
const getProjectsMock = vi.mocked(getProjects);

afterEach(() => {
  vi.clearAllMocks();
  // Часы подменяют тесты группировки по годам: год «сейчас» решает, куда ляжет проект с
  // открытым концом, и без фиксации прогон начал бы зависеть от даты запуска.
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

  it("волна просит объём — планета с моделью встаёт 3D-артефактом в том же слоте", async () => {
    getProjectsMock.mockResolvedValue([
      project({ iconUrl: "/assets/projects/danchuo-world-px.png", modelUrl: "/assets/3d/wireframe-globe.glb" }),
    ]);
    const { container } = render(<ProjectsTile planet="model" />);
    await screen.findByText("danchuo.world");

    const artifact = container.querySelector("canvas");
    expect(artifact).toHaveClass("project-artifact");
    // Тот же слот, что у плоских планет: тексты рядов начинаются с одного x независимо от
    // того, чем одета планета.
    expect(artifact?.parentElement).toHaveClass("project-slot");
    // Подача ровно одна: спрайт при этом не рисуется вторым слоем.
    expect(container.querySelector("img")).toBeNull();
  });

  it("старая волна объёма не просит — остаётся прежний плоский спрайт", async () => {
    getProjectsMock.mockResolvedValue([
      project({ iconUrl: "/assets/projects/danchuo-world-px.png", modelUrl: "/assets/3d/wireframe-globe.glb" }),
    ]);
    const { container } = render(<ProjectsTile />);
    await screen.findByText("danchuo.world");

    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("img")).toHaveClass("project-sprite");
  });

  it("волна просит объём, а модели у проекта нет — тихо остаётся спрайт", async () => {
    getProjectsMock.mockResolvedValue([
      project({ title: "proxemics", iconUrl: "/assets/projects/proxemics.png", modelUrl: null }),
    ]);
    const { container } = render(<ProjectsTile planet="model" />);
    await screen.findByText("proxemics");

    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("img")).toHaveClass("project-sprite--smooth");
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

  /**
   * Редакция `console` (DESIGN §7.8, волна 03): вывод `tree` вместо строки-ярлыка. Набор
   * редакций — знание тайла, а не реестра раскладки, поэтому незнакомое имя = дефолт.
   */
  describe("редакция console", () => {
    it("подпись плитки — приглашение оболочки, а не слово «проекты»", async () => {
      getProjectsMock.mockResolvedValue([project()]);
      render(<ProjectsTile edition="console" />);
      await screen.findByText("danchuo.world");
      expect(screen.getByText("~/projects")).toBeInTheDocument();
      expect(screen.getByText("tree -L 1")).toBeInTheDocument();
    });

    /**
     * Две ссылки разного назначения: показанный путь ведёт туда, куда показывает, а название
     * с картинкой — в «дом» проекта (у proxemics код на гитхабе, сам проект — бот).
     */
    it("название и картинка ведут в дом проекта, путь — по своему адресу", async () => {
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

    /** Дома отдельно нет ⇒ название и картинка ведут туда же, куда показанный путь. */
    it("без дома название ведёт по показанному пути", async () => {
      getProjectsMock.mockResolvedValue([
        project({ title: "danchuo.world", iconUrl: "/assets/projects/danchuo-world-px.png", url: "https://danchuo.world" }),
      ]);
      const { container } = render(<ProjectsTile edition="console" />);
      await screen.findByText("danchuo.world");

      expect(container.querySelector(".project-title")).toHaveAttribute("href", "https://danchuo.world");
      expect(container.querySelector("img")?.closest("a")).toHaveAttribute("href", "https://danchuo.world");
    });

    /**
     * Сайт, названный своим же адресом: вторая строка повторила бы название вторым голосом и
     * зелёным — и не сказала бы ничего нового. Её просто нет.
     */
    it("путь, дословно равный названию, второй строкой не печатается", async () => {
      getProjectsMock.mockResolvedValue([
        project({ title: "danchuo.world", url: "https://danchuo.world" }),
      ]);
      const { container } = render(<ProjectsTile edition="console" />);
      await screen.findByText("danchuo.world");

      expect(container.querySelector(".project-repo")).toBeNull();
    });

    /**
     * Время — левым полем строки, а не колонкой справа (DESIGN §7.8): правого столбца у строк
     * нет вовсе. Год берётся по ПОСЛЕДНЕЙ активности, поэтому открытый конец идёт в текущий.
     */
    it("год — в левом поле; колонки диапазона в строке нет", async () => {
      vi.setSystemTime(new Date("2031-09-07T10:00:00Z"));
      getProjectsMock.mockResolvedValue([
        project({ title: "danchuo.world", endYear: null }),
        project({ title: "proxemics", endYear: 2024, endQuarter: 2 }),
      ]);
      const { container } = render(<ProjectsTile edition="console" />);
      await screen.findByText("proxemics");

      const years = [...container.querySelectorAll(".projects-year__head")].map((h) => h.textContent);
      expect(years).toEqual(["2031", "2024"]);
      // Год связан со своим поддеревом горизонталью — по линии на каждый напечатанный год.
      expect(container.querySelectorAll(".projects-year__link")).toHaveLength(2);
      expect(container.querySelector(".projects-console .project-range")).toBeNull();
      expect(screen.queryByText(/Q\d/)).not.toBeInTheDocument();
    });

    /** Каждый год — своё поддерево: ствол растёт от года, угол закрывает СВОЙ год. */
    it("ветки считаются внутри года: угол в каждой группе", async () => {
      vi.setSystemTime(new Date("2031-09-07T10:00:00Z"));
      getProjectsMock.mockResolvedValue([
        project({ title: "a", endYear: null }),
        project({ title: "b", endYear: 2031 }),
        project({ title: "c", endYear: 2024 }),
      ]);
      const { container } = render(<ProjectsTile edition="console" />);
      await screen.findByText("c");

      // Группа 2031 = [a, b]: голова и угол. Группа 2024 = [c]: одиночка, ствола нет вовсе.
      const branches = [...container.querySelectorAll(".project-branch")].map((b) => b.getAttribute("data-branch"));
      expect(branches).toEqual(["head", "corner", "only"]);
      // Год печатается один раз на группу: у второй строки поле пустое.
      const years = [...container.querySelectorAll(".projects-year__gutter")].map((g) => g.textContent);
      expect(years).toEqual(["2031", "", "2024"]);
    });

    /**
     * Актуальность — яркостью, а не знаком: состояние едет атрибутом строки, красит его скин
     * (`ls --color`, не `-F`). Читалке то же самое сказано словом.
     */
    it("живой и завершённый проекты различаются состоянием строки", async () => {
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

    it("проект без ссылок — ни одной гиперссылки в строке", async () => {
      getProjectsMock.mockResolvedValue([project({ url: null })]);
      const { container } = render(<ProjectsTile edition="console" />);
      await screen.findByText("danchuo.world");

      expect(container.querySelector(".project-console a")).toBeNull();
      expect(container.querySelector(".project-repo")).toBeNull();
    });

    /**
     * Ветки дерева: строки висят на приглашении, а угол закрывает список. Проверяем порядок
     * видов в разметке — сам выбор вида проверен в `projectTree.test.ts`. Рисуются ветки
     * линиями в CSS, поэтому в разметке от них остаётся ровно этот атрибут.
     */
    it("строки висят на ветках, угол достаётся последней", async () => {
      getProjectsMock.mockResolvedValue([
        project({ title: "danchuo.world" }),
        project({ title: "proxemics" }),
        project({ title: "третий" }),
      ]);
      const { container } = render(<ProjectsTile edition="console" />);
      await screen.findByText("третий");

      // Год стоит слева на первой строке, и ствол начинается от него: у неё `head`, не `tee`.
      const branches = [...container.querySelectorAll(".project-branch")].map((b) => b.getAttribute("data-branch"));
      expect(branches).toEqual(["head", "tee", "corner"]);
    });

    it("незнакомая редакция → прежний список, без приглашения и путей", async () => {
      getProjectsMock.mockResolvedValue([project()]);
      const { container } = render(<ProjectsTile edition="катушка" />);
      await screen.findByText("danchuo.world");

      expect(screen.queryByText("~/projects")).not.toBeInTheDocument();
      expect(container.querySelector(".project-console")).toBeNull();
      expect(container.querySelector(".projects-list")).toBeInTheDocument();
    });
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
