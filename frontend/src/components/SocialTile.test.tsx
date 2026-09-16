import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SocialLinkView } from "@/lib/api/types";
import { SocialTile } from "./SocialTile";

vi.mock("@/lib/api/client", () => ({
  getSocialLinks: vi.fn(),
  getLatestInstagramPost: vi.fn(),
  getTelegramProfile: vi.fn(),
}));
import { getLatestInstagramPost, getSocialLinks, getTelegramProfile } from "@/lib/api/client";
const getSocialLinksMock = vi.mocked(getSocialLinks);
const getPostMock = vi.mocked(getLatestInstagramPost);
const getTelegramMock = vi.mocked(getTelegramProfile);

afterEach(() => vi.clearAllMocks());

// There are two preview sources and the tile asks both at once. Defaulting both to empty is
// required: an unmocked source returns `undefined` and the tile dies on it before the test
// reaches its own assertion.
beforeEach(() => {
  getPostMock.mockResolvedValue(null);
  getTelegramMock.mockResolvedValue(null);
});

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
  // A fresh container per render: one test builds the grid several times, and a document-wide
  // search would find the previous grid's links.
  const { container } = render(<SocialTile />);
  await within(container).findByLabelText(platforms[0]);
  return container.querySelector(".social-grid") as HTMLElement;
}

describe("SocialTile", () => {
  /**
   * The column count arrives as a VARIABLE rather than an inline `grid-template-columns`: in the
   * mobile stack the square grid becomes one row, and CSS cannot override an inline style without
   * `!important` (the same device as the music card's width).
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
   * The component only PUBLISHES a platform's brand mark (an address in `--social-brand` plus the
   * `social-icon--brand` flag); whether to show it is the wave skin's decision. A platform with no
   * mark gets no variable at all, or the skin would draw an empty background instead of an icon.
   */
  it("публикует фирменную марку платформы переменной, а решение оставляет скину", async () => {
    const el = await grid(["github", "telegram", "x", "instagram", "mastodon"]);
    const icon = (p: string) => el.querySelector<HTMLElement>(`[aria-label="${p}"] .social-icon`)!;

    for (const p of ["github", "telegram", "x", "instagram"]) {
      expect(icon(p)).toHaveClass("social-icon--brand");
      expect(icon(p).style.getPropertyValue("--social-brand")).toBe(`url(/assets/social/brand/${p}.svg)`);
      // The single-colour mask stays alongside: a wave may choose it instead of the brand mark.
      expect(icon(p).style.getPropertyValue("--social-mask")).toBe(`url(/assets/social/${p}.svg)`);
    }
    expect(icon("mastodon")).not.toHaveClass("social-icon--brand");
    expect(icon("mastodon").style.getPropertyValue("--social-brand")).toBe("");
  });

  /** A single row in the stack needs the link COUNT itself — it cannot be derived from columns. */
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
    // The card lives in a PORTAL (a tile clips its content, see HoverTip), so it is searched for
    // in the document rather than the tile's container.
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

  it("марка с карточкой стоит в ячейке так же, как марки без неё", async () => {
    // ⚠️ A production regression. The hint wrapper appears WITH the data — on one mark of four and
    // only once the post arrives. An `inline-block` wrapper collapsed the `w-full` link to zero and
    // the mark drifted out of its cell. The wrapper must be layout-neutral, because it comes and goes.
    getPostMock.mockResolvedValue(post);
    const container = await tile("peek");
    await screen.findByText("вечерний двор", { exact: false });

    const anchors = container.querySelectorAll(".hover-tip-anchor");
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toHaveClass("hover-tip-anchor--fill");
    // The link inside the wrapper is the same full-size card as its neighbours'.
    expect(anchors[0].querySelector("a")).toHaveClass("h-full", "w-full");
  });

});

describe("SocialTile — визитка Telegram (редакция peek)", () => {
  const profile = {
    name: "Данила",
    username: "danchuo",
    bio: "keep",
    avatarUrl: "/api/telegram/avatar?v=7",
  };

  async function tile(edition?: string) {
    getSocialLinksMock.mockResolvedValue([link("instagram"), link("telegram")]);
    const { container } = render(<SocialTile edition={edition} />);
    await within(container).findByLabelText("telegram");
    return container;
  }

  it("без редакции визитка не запрашивается вовсе", async () => {
    await tile();
    expect(getTelegramMock).not.toHaveBeenCalled();
  });

  it("в редакции peek визитка висит у марки Telegram", async () => {
    getTelegramMock.mockResolvedValue(profile);
    await tile("peek");
    // The card lives in a PORTAL (a tile clips its content, see HoverTip) — search the document.
    await screen.findByText("Данила");
    expect(screen.getByText("@danchuo")).not.toBeNull();
    expect(screen.getByText("keep")).not.toBeNull();
    expect(document.querySelector(".tg-peek")).not.toBeNull();
  });

  /** Both hyperlinks lead where the mark itself does: the board has ONE profile address. */
  it("аватар и кнопка ведут по адресу самой марки", async () => {
    getTelegramMock.mockResolvedValue(profile);
    await tile("peek");
    await screen.findByText("Данила");

    const hrefs = [...document.querySelectorAll<HTMLAnchorElement>(".tg-peek a")].map((a) => a.href);
    expect(hrefs).toHaveLength(2);
    expect(new Set(hrefs)).toEqual(new Set(["https://example.com/telegram"]));
  });

  it("пустой источник карточку не рисует: марка остаётся обычной ссылкой", async () => {
    getTelegramMock.mockResolvedValue(null);
    const container = await tile("peek");
    expect(document.querySelector(".tg-peek")).toBeNull();
    expect(container.querySelector('a[aria-label="telegram"]')).not.toBeNull();
  });

  /** An empty status is a legitimate account state: the line is simply absent, with no dash. */
  it("аккаунт без статуса не рисует строку статуса", async () => {
    getTelegramMock.mockResolvedValue({ ...profile, bio: null });
    await tile("peek");
    await screen.findByText("Данила");
    expect(document.querySelector(".tg-peek__bio")).toBeNull();
  });

  /** There may be no avatar — a standard grey circle takes its place, not a hole in the layout. */
  it("аккаунт без аватара оставляет круг на месте", async () => {
    getTelegramMock.mockResolvedValue({ ...profile, avatarUrl: null });
    await tile("peek");
    await screen.findByText("Данила");
    expect(document.querySelector(".tg-peek img")).toBeNull();
    expect(document.querySelector(".tg-peek__image--blank")).not.toBeNull();
  });
});

describe("SocialTile — переезд курсора с марки на марку", () => {
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
  const profile = { name: "Данила", username: "danchuo", bio: "keep", avatarUrl: null };

  /**
   * ⚠️ A production regression. The marks stand flush, so moving from one to its neighbour is a
   * leave and an enter in the same moment. Leaving a card is delayed (the cursor must cross the
   * gap), so the previous card sat out its delay under the new one: two overlapped for an instant.
   */
  it("карточка предыдущей марки гаснет сразу, не досиживая отсрочку", async () => {
    getPostMock.mockResolvedValue(post);
    getTelegramMock.mockResolvedValue(profile);
    getSocialLinksMock.mockResolvedValue([link("instagram"), link("telegram")]);
    const { container } = render(<SocialTile edition="peek" />);
    await screen.findByText("вечерний двор", { exact: false });

    const [igAnchor, tgAnchor] = [...container.querySelectorAll(".hover-tip-anchor")];
    const tipOf = (cls: string) => document.querySelector(cls)!.closest(".hover-tip")!;

    fireEvent.pointerEnter(igAnchor);
    expect(tipOf(".ig-peek")).toHaveAttribute("data-open", "true");

    // Exactly how a pointer behaves: it leaves the first mark and arrives at the second at once.
    fireEvent.pointerLeave(igAnchor);
    fireEvent.pointerEnter(tgAnchor);

    expect(tipOf(".tg-peek")).toHaveAttribute("data-open", "true");
    expect(tipOf(".ig-peek")).not.toHaveAttribute("data-open");
  });

  /** Moving from a mark ONTO its own card does not cancel the delay — or the links are unreachable. */
  it("переезд на саму карточку её не гасит", async () => {
    getPostMock.mockResolvedValue(post);
    getSocialLinksMock.mockResolvedValue([link("instagram")]);
    const { container } = render(<SocialTile edition="peek" />);
    await screen.findByText("вечерний двор", { exact: false });

    const anchor = container.querySelector(".hover-tip-anchor")!;
    const tip = document.querySelector(".ig-peek")!.closest(".hover-tip")!;

    fireEvent.pointerEnter(anchor);
    fireEvent.pointerLeave(anchor);
    fireEvent.pointerEnter(tip);
    expect(tip).toHaveAttribute("data-open", "true");
  });
});
