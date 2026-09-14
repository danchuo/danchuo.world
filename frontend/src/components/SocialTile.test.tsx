import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SocialLinkView } from "@/lib/api/types";
import { SocialTile } from "./SocialTile";

vi.mock("@/lib/api/client", () => ({ getSocialLinks: vi.fn(), getLatestInstagramPost: vi.fn() }));
import { getLatestInstagramPost, getSocialLinks } from "@/lib/api/client";
const getSocialLinksMock = vi.mocked(getSocialLinks);
const getPostMock = vi.mocked(getLatestInstagramPost);

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

  /**
   * Фирменную марку платформы компонент только ПУБЛИКУЕТ (адрес в `--social-brand` + метка
   * `social-icon--brand`); показать её или красить одноцветную маску токеном — дело скина
   * волны. Платформе без своей марки переменная не приезжает вовсе, иначе скин нарисовал бы
   * пустой фон вместо значка.
   */
  it("публикует фирменную марку платформы переменной, а решение оставляет скину", async () => {
    const el = await grid(["github", "telegram", "x", "instagram", "mastodon"]);
    const icon = (p: string) => el.querySelector<HTMLElement>(`[aria-label="${p}"] .social-icon`)!;

    for (const p of ["github", "telegram", "x", "instagram"]) {
      expect(icon(p)).toHaveClass("social-icon--brand");
      expect(icon(p).style.getPropertyValue("--social-brand")).toBe(`url(/assets/social/brand/${p}.svg)`);
      // Одноцветная маска остаётся при ней: волна вправе выбрать её, а не марку.
      expect(icon(p).style.getPropertyValue("--social-mask")).toBe(`url(/assets/social/${p}.svg)`);
    }
    expect(icon("mastodon")).not.toHaveClass("social-icon--brand");
    expect(icon("mastodon").style.getPropertyValue("--social-brand")).toBe("");
  });

  /** Одному ряду в стеке нужно САМО число ссылок — из числа колонок его не вывести. */
  it("отдаёт число ссылок переменной --social-count (ряд в мобильном стеке)", async () => {
    const el = await grid(["github", "telegram", "x", "instagram"]);
    expect(el.style.getPropertyValue("--social-count")).toBe("4");
  });
});

describe("SocialTile — превью последнего поста (редакция peek)", () => {
  const post = {
    username: "danchuo_",
    permalink: "https://instagram.com/p/abc",
    caption: "вечерний двор",
    mediaType: "IMAGE",
    imageUrl: "/api/instagram-media/post",
    avatarUrl: "/api/instagram-media/avatar",
    likes: 347,
    comments: 12,
    postedAt: "2026-09-11T18:00:00Z",
  };

  async function tile(edition?: string) {
    getSocialLinksMock.mockResolvedValue([link("instagram"), link("telegram")]);
    const { container } = render(<SocialTile edition={edition} />);
    await within(container).findByLabelText("instagram");
    return container;
  }

  it("без редакции пост не запрашивается вовсе: на других волнах это просто ряд ссылок", async () => {
    await tile();
    expect(getPostMock).not.toHaveBeenCalled();
  });

  it("в редакции peek карточка поста висит у марки Instagram", async () => {
    getPostMock.mockResolvedValue(post);
    await tile("peek");
    // Карточка живёт в ПОРТАЛЕ (плитка режет содержимое, см. HoverTip), поэтому ищем
    // её в документе, а не в контейнере плитки.
    const card = await screen.findByText("347 отметок «Нравится»");
    expect(card).not.toBeNull();
    expect(document.querySelector(".ig-peek")).not.toBeNull();
  });

  it("пустой источник карточку не рисует: марка остаётся обычной ссылкой", async () => {
    getPostMock.mockResolvedValue(null);
    const container = await tile("peek");
    expect(document.querySelector(".ig-peek")).toBeNull();
    expect(container.querySelector('a[aria-label="instagram"]')).not.toBeNull();
  });

  it("спрятанные владельцем счётчики не рисуются вовсе — ноль соврал бы", async () => {
    getPostMock.mockResolvedValue({ ...post, likes: null, comments: null });
    await tile("peek");
    await screen.findByText("вечерний двор", { exact: false });
    expect(screen.queryByText(/отметок/)).toBeNull();
    expect(screen.queryByText(/комментариев/)).toBeNull();
  });
});
