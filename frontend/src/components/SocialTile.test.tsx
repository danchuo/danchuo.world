import { render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SocialLinkView } from "@/lib/api/types";
import { SocialTile } from "./SocialTile";

vi.mock("@/lib/api/client", () => ({ getSocialLinks: vi.fn() }));
import { getSocialLinks } from "@/lib/api/client";
const getSocialLinksMock = vi.mocked(getSocialLinks);

afterEach(() => vi.clearAllMocks());

function link(platform: string): SocialLinkView {
  return {
    platform,
    name: platform,
    url: `https://example.com/${platform}`,
    icon: `/assets/social/${platform}.svg`,
  };
}

async function grid(platforms: string[]): Promise<HTMLElement> {
  getSocialLinksMock.mockResolvedValue(platforms.map(link));
  // Свой контейнер на каждый рендер: в одном тесте сетка строится несколько раз, и глобальный
  // поиск по документу нашёл бы ссылки предыдущей сетки.
  const { container } = render(<SocialTile />);
  await within(container).findByLabelText(platforms[0]);
  return container.querySelector(".social-grid") as HTMLElement;
}

describe("SocialTile", () => {
  /**
   * Число колонок приезжает ПЕРЕМЕННОЙ, а не inline-стилем `grid-template-columns`: в мобильном
   * стеке квадратная сетка становится одним рядом, а inline-стиль CSS не перебивает ничем,
   * кроме `!important` (тот же приём, что у ширины карточки музыки).
   */
  it("отдаёт квадратную сетку переменной --social-cols, а не inline-раскладкой", async () => {
    const el = await grid(["github", "telegram", "x", "instagram"]);
    expect(el.style.getPropertyValue("--social-cols")).toBe("2");
    expect(el.style.gridTemplateColumns).toBe("");
  });

  it("сетка остаётся квадратной: до 9 ссылок — три колонки, дальше четыре", async () => {
    expect((await grid(["a", "b", "c", "d", "e"])).style.getPropertyValue("--social-cols")).toBe("3");
    expect(
      (await grid(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"])).style.getPropertyValue(
        "--social-cols",
      ),
    ).toBe("4");
  });

  /** Одному ряду в стеке нужно САМО число ссылок — из числа колонок его не вывести. */
  it("отдаёт число ссылок переменной --social-count (ряд в мобильном стеке)", async () => {
    const el = await grid(["github", "telegram", "x", "instagram"]);
    expect(el.style.getPropertyValue("--social-count")).toBe("4");
  });
});
