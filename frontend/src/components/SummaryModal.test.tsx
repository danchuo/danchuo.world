import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SummaryView } from "@/lib/api/types";
import type { SummarySubject } from "@/lib/summarySubject";

// The window fetches the retelling lazily (`getSummary`), so the client is mocked.
const getSummary = vi.fn<() => Promise<SummaryView>>(() =>
  Promise.resolve({
    bullets: ["Пауль уходит в пустыню.", "Появляется червь."],
    takeaway: "глава про то, как герой становится своим среди чужих.",
  }),
);
const requested: Array<[string, number]> = [];
vi.mock("@/lib/api/client", () => ({
  getSummary: (kind: string, sessionId: number) => {
    requested.push([kind, sessionId]);
    return getSummary();
  },
}));

import { SummaryModal } from "./SummaryModal";

/**
 * The "what was in this chunk" window (PRD §5.16.1). Pinned here: the header and the chunk show
 * at once, before the text arrives; bullets and the takeaway are rendered apart; a failure does
 * not pretend to be a retelling; and ONE window serves a book and an episode alike.
 */
describe("SummaryModal", () => {
  const book = (patch: Partial<SummarySubject> = {}): SummarySubject => ({
    kind: "reading",
    sessionId: 7,
    title: "Дюна",
    byline: "Фрэнк Герберт",
    titleUrl: null,
    bylineUrl: null,
    coverUrl: "/api/reading/cover/7",
    portrait: true,
    progressCaption: "прочитано за этот заход",
    progressValue: "48% → 53%",
    span: { from: 0.48, to: 0.53 },
    spanEnds: { from: "48%", to: "53%" },
    ariaLabel: "Что было в прочитанном куске: Дюна",
    ...patch,
  });

  const episode = (): SummarySubject => book({
    kind: "podcast",
    sessionId: 42,
    title: "How Feelings Make Us Smarter",
    byline: "Hidden Brain",
    titleUrl: "https://open.spotify.com/episode/x",
    bylineUrl: "https://open.spotify.com/show/y",
    coverUrl: "https://i.scdn.co/image/abc",
    portrait: false,
    progressCaption: "прослушано за этот заход",
    progressValue: "35 из 48 мин",
    ariaLabel: "Что было в прослушанном куске: How Feelings Make Us Smarter",
  });

  it("the item and the piece covered are visible at once, without waiting for the text", () => {
    render(<SummaryModal subject={book()} onClose={() => {}} />);

    expect(screen.getByText("Дюна")).toBeInTheDocument();
    expect(screen.getByText("Фрэнк Герберт")).toBeInTheDocument();
    expect(screen.getByTestId("summary-progress")).toHaveTextContent("48% → 53%");
  });

  it("items arrive as a list, and the total as a separate line", async () => {
    render(<SummaryModal subject={book()} onClose={() => {}} />);

    expect(await screen.findByText("Пауль уходит в пустыню.")).toBeInTheDocument();
    expect(screen.getByText("Появляется червь.")).toBeInTheDocument();
    expect(screen.getByTestId("summary-takeaway")).toHaveTextContent(
      "глава про то, как герой становится своим среди чужих.",
    );
  });

  it("an episode opens in the same window and asks for its own look", async () => {
    requested.length = 0;

    render(<SummaryModal subject={episode()} onClose={() => {}} />);

    expect(screen.getByText("How Feelings Make Us Smarter")).toBeInTheDocument();
    expect(screen.getByText("Hidden Brain")).toBeInTheDocument();
    expect(screen.getByTestId("summary-progress")).toHaveTextContent("35 из 48 мин");
    expect(requested).toEqual([["podcast", 42]]);
    // The answer reads the same — the window knows nothing of the subject beyond its header.
    expect(await screen.findByText("Пауль уходит в пустыню.")).toBeInTheDocument();
  });

  it("a retelling that did not come together says so instead of staying silent", async () => {
    getSummary.mockRejectedValueOnce(new Error("500"));

    render(<SummaryModal subject={book()} onClose={() => {}} />);

    expect(await screen.findByText("пересказ не собрался")).toBeInTheDocument();
  });

  it("an answer without items does not crash the window but reads as \"did not come together\"", async () => {
    // This is how the native image served a reply whose DTO lacked @RegisterForReflection: a 200
    // with the body `{}`. The old version went into `bullets.map` and took down the WHOLE board
    // with a client exception — Next replaces the page, not just this window.
    getSummary.mockResolvedValueOnce({} as never);

    render(<SummaryModal subject={book()} onClose={() => {}} />);

    expect(await screen.findByText("пересказ не собрался")).toBeInTheDocument();
    // The header is there: the window is alive rather than replaced by an error screen.
    expect(screen.getByText("Дюна")).toBeInTheDocument();
  });

  it("empty and broken items are filtered out instead of being drawn as empty rows", async () => {
    getSummary.mockResolvedValueOnce({
      bullets: ["  ", "Живой пункт.", null, 42],
      takeaway: "   ",
    } as never);

    render(<SummaryModal subject={book()} onClose={() => {}} />);

    expect(await screen.findByText("Живой пункт.")).toBeInTheDocument();
    expect(screen.queryByTestId("summary-takeaway")).toBeNull();
  });

  // The run is the same device the sheet's frame carries under its cover (DESIGN §4.3); a wave
  // that wants the chunk drawn rather than spelled out lights it up from here.
  it("places the covered chunk on a track as a lit run", () => {
    const { container } = render(<SummaryModal subject={book()} onClose={() => {}} />);

    const run = container.querySelector(".summary-modal__run") as HTMLElement;
    expect(parseFloat(run.style.left)).toBeCloseTo(48, 1);
    expect(parseFloat(run.style.width)).toBeCloseTo(5, 1);
  });

  // The numbers stand AT the run's ends instead of an arrow between them (DESIGN §4.3).
  it("prints the run's ends at the run's ends", () => {
    const { container } = render(<SummaryModal subject={book({ span: { from: 0.1, to: 0.9 } })} onClose={() => {}} />);

    const ends = Array.from(container.querySelectorAll(".summary-modal__end"));
    expect(ends.map((e) => e.textContent)).toEqual(["48%", "53%"]);
    expect(parseFloat((ends[0] as HTMLElement).style.left)).toBeCloseTo(10, 1);
    expect(parseFloat((ends[1] as HTMLElement).style.left)).toBeCloseTo(90, 1);
  });

  it("keeps both numbers on a narrow run by moving them OUTSIDE it", () => {
    // Under a hairline of a run the two labels would sit on top of each other; pushed to either
    // side of it they cannot collide, and neither number is lost.
    const { container } = render(<SummaryModal subject={book({ span: { from: 0.52, to: 0.55 } })} onClose={() => {}} />);

    const ends = Array.from(container.querySelectorAll(".summary-modal__end"));
    expect(ends.map((e) => e.textContent)).toEqual(["48%", "53%"]);
    expect(container.querySelector(".summary-modal__track")!.className).toContain("is-tight");
  });

  it("keeps a wide run's numbers under its own ends", () => {
    const { container } = render(<SummaryModal subject={book({ span: { from: 0.1, to: 0.9 } })} onClose={() => {}} />);

    expect(container.querySelector(".summary-modal__track")!.className).not.toContain("is-tight");
  });

  // An episode lives at Spotify: its cover and name lead to the episode, the byline to the show.
  // A book has no address, and then the header is text rather than a dead link. PRD §5.16.1
  it("makes an episode's header a door to Spotify, and a book's plain text", () => {
    const ep = render(<SummaryModal subject={episode()} onClose={() => {}} />);
    const links = Array.from(ep.container.querySelectorAll("a.is-away")) as HTMLAnchorElement[];

    expect(links.map((a) => a.href)).toEqual([
      "https://open.spotify.com/episode/x",
      "https://open.spotify.com/episode/x",
      "https://open.spotify.com/show/y",
    ]);
    expect(links.every((a) => a.rel === "noreferrer")).toBe(true);
    ep.unmount();

    const bk = render(<SummaryModal subject={book()} onClose={() => {}} />);
    expect(bk.container.querySelector("a.is-away")).toBeNull();
    expect(bk.container.querySelector(".summary-modal__name")!.textContent).toBe("Дюна");
  });

  // A cover that never arrives is the Spotify plate here by the same rule the sheet's frame
  // follows (DESIGN §4.3) — and only where the picture CAME from Spotify.
  it("puts the Spotify plate where an episode's cover never arrived", () => {
    const { container } = render(<SummaryModal subject={episode()} onClose={() => {}} />);

    fireEvent.error(container.querySelector("img")!);

    expect(container.querySelector(".cover-plate")).not.toBeNull();
  });

  it("leaves a book from the shelf the quiet blank, not a foreign mark", () => {
    const { container } = render(<SummaryModal subject={book()} onClose={() => {}} />);

    fireEvent.error(container.querySelector("img")!);

    expect(container.querySelector(".cover-plate")).toBeNull();
  });

  it("draws no track for a sitting with no place in the work", () => {
    const { container } = render(<SummaryModal subject={book({ span: null })} onClose={() => {}} />);

    expect(container.querySelector(".summary-modal__track")).toBeNull();
  });

  it("closes on Esc", async () => {
    const onClose = vi.fn();
    render(<SummaryModal subject={book()} onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
