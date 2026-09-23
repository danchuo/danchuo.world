import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SocialLinkView } from "@/lib/api/types";
import { SocialTile } from "./SocialTile";
import { forgetTileAnswers } from "./useTileData";

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
  // Each call is a different server answer, so the previous render's fresh one must not serve it.
  forgetTileAnswers();
  // A fresh container per render: one test builds the grid several times, and a document-wide
  // search would find the previous grid's links.
  const { container } = render(<SocialTile />);
  await within(container).findByLabelText(platforms[0]);
  return container.querySelector(".social-grid") as HTMLElement;
}

describe("SocialTile", () => {
  it("a wave's platform list keeps only those marks, in the data's order", async () => {
    getSocialLinksMock.mockResolvedValue(["github", "telegram", "x", "instagram"].map(link));
    const { container } = render(<SocialTile platforms={["instagram", "telegram"]} />);
    await within(container).findByLabelText("telegram");
    const labels = [...container.querySelectorAll("a")].map((a) => a.getAttribute("aria-label"));
    expect(labels).toEqual(["telegram", "instagram"]);
  });

  /**
   * The column count arrives as a VARIABLE rather than an inline `grid-template-columns`: in the
   * mobile stack the square grid becomes one row, and CSS cannot override an inline style without
   * `!important` (the same device as the music card's width).
   */
  it("returns the square grid as the --social-cols variable, not as an inline layout", async () => {
    const el = await grid(["github", "telegram", "x", "instagram"]);
    expect(el.style.getPropertyValue("--social-cols")).toBe("2");
    expect(el.style.gridTemplateColumns).toBe("");
  });

  it("the grid stays square: up to 9 links three columns, beyond that four", async () => {
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
  it("publishes the platform's brand mark as a variable and leaves the decision to the skin", async () => {
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
  it("returns the link count as the --social-count variable (the row in the mobile stack)", async () => {
    const el = await grid(["github", "telegram", "x", "instagram"]);
    expect(el.style.getPropertyValue("--social-count")).toBe("4");
  });
});

describe("SocialTile — latest post preview (peek edition)", () => {
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

  it("without the edition the post is not requested at all: on other waves it is just a row of links", async () => {
    await tile();
    expect(getPostMock).not.toHaveBeenCalled();
  });

  it("in the peek edition the post card hangs at the Instagram mark", async () => {
    getPostMock.mockResolvedValue(post);
    await tile("peek");
    // The card lives in a PORTAL (a tile clips its content, see HoverTip), so it is searched for
    // in the document rather than the tile's container.
    const card = await screen.findByText("347 отметок «Нравится»");
    expect(card).not.toBeNull();
    expect(document.querySelector(".ig-peek")).not.toBeNull();
  });

  it("an empty source draws no card: the mark stays an ordinary link", async () => {
    getPostMock.mockResolvedValue(null);
    const container = await tile("peek");
    expect(document.querySelector(".ig-peek")).toBeNull();
    expect(container.querySelector('a[aria-label="instagram"]')).not.toBeNull();
  });

  it("counters the owner hid are not drawn at all — a zero would lie", async () => {
    getPostMock.mockResolvedValue({ ...post, likes: null, comments: null });
    await tile("peek");
    await screen.findByText("вечерний двор", { exact: false });
    expect(screen.queryByText(/отметок/)).toBeNull();
    expect(screen.queryByText(/комментариев/)).toBeNull();
  });

  it("only the mark itself opens the card, and the link keeps the cell's size", async () => {
    getPostMock.mockResolvedValue(post);
    const container = await tile("peek");
    await screen.findByText("вечерний двор", { exact: false });

    const link = container.querySelector('a[aria-label="instagram"]')!;
    const trigger = link.querySelector(".hover-tip-anchor")!;
    expect(link).toHaveClass("h-full", "w-full");
    expect(trigger).not.toHaveClass("hover-tip-anchor--fill");
    expect(trigger.querySelector(".social-icon")).not.toBeNull();

    const tip = document.querySelector(".ig-peek")!.closest(".hover-tip")!;
    fireEvent.pointerEnter(link);
    expect(tip).not.toHaveAttribute("data-open");
    fireEvent.pointerEnter(trigger);
    expect(tip).toHaveAttribute("data-open", "true");
  });

});

describe("SocialTile — Telegram card (peek edition)", () => {
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

  it("without the edition the card is not requested at all", async () => {
    await tile();
    expect(getTelegramMock).not.toHaveBeenCalled();
  });

  it("in the peek edition the card hangs at the Telegram mark", async () => {
    getTelegramMock.mockResolvedValue(profile);
    await tile("peek");
    // The card lives in a PORTAL (a tile clips its content, see HoverTip) — search the document.
    await screen.findByText("Данила");
    expect(screen.getByText("@danchuo")).not.toBeNull();
    expect(screen.getByText("keep")).not.toBeNull();
    expect(document.querySelector(".tg-peek")).not.toBeNull();
  });

  /** Both hyperlinks lead where the mark itself does: the board has ONE profile address. */
  it("the avatar and the button lead to the mark's own address", async () => {
    getTelegramMock.mockResolvedValue(profile);
    await tile("peek");
    await screen.findByText("Данила");

    const hrefs = [...document.querySelectorAll<HTMLAnchorElement>(".tg-peek a")].map((a) => a.href);
    expect(hrefs).toHaveLength(2);
    expect(new Set(hrefs)).toEqual(new Set(["https://example.com/telegram"]));
  });

  it("an empty source draws no card: the mark stays an ordinary link", async () => {
    getTelegramMock.mockResolvedValue(null);
    const container = await tile("peek");
    expect(document.querySelector(".tg-peek")).toBeNull();
    expect(container.querySelector('a[aria-label="telegram"]')).not.toBeNull();
  });

  /** An empty status is a legitimate account state: the line is simply absent, with no dash. */
  it("an account without a status draws no status line", async () => {
    getTelegramMock.mockResolvedValue({ ...profile, bio: null });
    await tile("peek");
    await screen.findByText("Данила");
    expect(document.querySelector(".tg-peek__bio")).toBeNull();
  });

  /** There may be no avatar — a standard grey circle takes its place, not a hole in the layout. */
  it("an account without an avatar keeps the circle in place", async () => {
    getTelegramMock.mockResolvedValue({ ...profile, avatarUrl: null });
    await tile("peek");
    await screen.findByText("Данила");
    expect(document.querySelector(".tg-peek img")).toBeNull();
    expect(document.querySelector(".tg-peek__image--blank")).not.toBeNull();
  });
});

describe("SocialTile — moving the cursor from mark to mark", () => {
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
  it("the previous mark's card goes out at once without sitting out the delay", async () => {
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
  it("moving onto the card itself does not close it", async () => {
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
