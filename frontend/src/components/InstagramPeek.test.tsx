import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InstagramPostView } from "@/lib/api/types";
import { InstagramPeek } from "./InstagramPeek";

const PERMALINK = "https://www.instagram.com/p/DcnkVm1lwyY/";

function post(extra: Partial<InstagramPostView> = {}): InstagramPostView {
  return {
    username: "danchuo_",
    permalink: PERMALINK,
    caption: "Плёнка с прошлой недели",
    mediaType: "CAROUSEL_ALBUM",
    imageUrl: "/api/instagram-media/post?v=1",
    avatarUrl: "/api/instagram-media/avatar?v=1",
    likes: 137,
    comments: 2,
    postedAt: "2026-09-13T12:00:00Z",
    ...extra,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-14T08:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("InstagramPeek", () => {
  it("leads from the header to the owner's profile", () => {
    render(<InstagramPeek post={post()} />);
    expect(screen.getByLabelText("Профиль danchuo_")).toHaveAttribute(
      "href",
      "https://www.instagram.com/danchuo_/",
    );
  });

  /**
   * Like and bookmark lead to the post itself: Instagram has no address that likes or bookmarks on
   * navigation (see the note in `lib/instagram.ts`). A button must not promise more than the
   * platform can do.
   */
  it("like and bookmark lead to the post, comment to the comments", () => {
    render(<InstagramPeek post={post()} />);
    expect(screen.getByLabelText("Нравится")).toHaveAttribute("href", PERMALINK);
    expect(screen.getByLabelText("Сохранить")).toHaveAttribute("href", PERMALINK);
    expect(screen.getByLabelText("Комментировать")).toHaveAttribute(
      "href",
      "https://www.instagram.com/p/DcnkVm1lwyY/comments/",
    );
  });

  it("\"share\" copies the post link and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<InstagramPeek post={post()} />);
    fireEvent.click(screen.getByLabelText("Скопировать ссылку"));
    expect(writeText).toHaveBeenCalledWith(PERMALINK);
    expect(await screen.findByLabelText("Ссылка скопирована")).toBeInTheDocument();
  });

  /**
   * The card lives in a portal and is marked `aria-hidden` (see HoverTip), so focus inside it
   * would take tabbing to the end of the document, past the mark itself.
   */
  it("the card's controls are excluded from tabbing", () => {
    const { container } = render(<InstagramPeek post={post()} />);
    const controls = container.querySelectorAll("a, button");
    expect(controls.length).toBeGreaterThan(0);
    controls.forEach((el) => expect(el).toHaveAttribute("tabindex", "-1"));
  });

  it("writes the comment count with declension but does not show the comments themselves", () => {
    const { rerender } = render(<InstagramPeek post={post({ comments: 2 })} />);
    expect(screen.getByText("2 комментария")).toBeInTheDocument();
    expect(screen.queryByText(/Посмотреть/)).not.toBeInTheDocument();

    rerender(<InstagramPeek post={post({ comments: 1 })} />);
    expect(screen.getByText("1 комментарий")).toBeInTheDocument();

    rerender(<InstagramPeek post={post({ comments: 5 })} />);
    expect(screen.getByText("5 комментариев")).toBeInTheDocument();
  });

  it("a counter the owner hid draws no row at all", () => {
    render(<InstagramPeek post={post({ likes: null, comments: null })} />);
    expect(screen.queryByText(/Нравится/)).not.toBeInTheDocument();
    expect(screen.queryByText(/коммент/)).not.toBeInTheDocument();
  });

  it("the post's age is written once", () => {
    render(<InstagramPeek post={post()} />);
    expect(screen.getByText("20 ч назад")).toBeInTheDocument();
  });

  /** The media type is not the post's content: the caption repeated what is already visible. */
  it("does not caption the media type under the nickname", () => {
    render(<InstagramPeek post={post({ mediaType: "CAROUSEL_ALBUM" })} />);
    expect(screen.queryByText("несколько кадров")).not.toBeInTheDocument();
    expect(screen.queryByText("видео")).not.toBeInTheDocument();
  });
});
