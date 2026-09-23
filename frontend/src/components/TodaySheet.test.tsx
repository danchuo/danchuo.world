import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DayView, DisciplineItemView, PodcastEpisodeView } from "@/lib/api/types";
import { TodaySheet } from "./TodaySheet";

function item(over: Partial<DisciplineItemView> & { key: string }): DisciplineItemView {
  return { label: over.key, icon: null, count: 0, target: 1, ...over };
}

function day(over: Partial<DayView> = {}): DayView {
  return {
    date: "2026-09-19",
    title: null,
    hasData: true,
    health: { steps: null, sleepMinutes: null },
    discipline: [],
    ...over,
  } as DayView;
}

const withBook = (over = {}) =>
  day({
    discipline: [
      item({
        key: "reading",
        label: "Чтение",
        target: 2,
        count: 1,
        books: [
          {
            title: "Пятая гора",
            author: "Пауло Коэльо",
            coverUrl: "https://i/book.jpg",
            startedAt: "2026-09-19T12:00:00Z",
            readMinutes: 24,
            startPercent: 0.43,
            endPercent: 0.58,
            sessionId: 11,
            hasSummary: true,
          },
        ],
      }),
    ],
    ...over,
  });

describe("TodaySheet", () => {
  it("prints the day in the ribbon's grammar rather than a split header", () => {
    render(<TodaySheet day={day({ title: "суббота длиною в год" })} today="2026-09-19" />);

    expect(screen.getByText("суббота 19.09")).toBeInTheDocument();
    expect(screen.getByText("суббота длиною в год")).toBeInTheDocument();
  });

  // The date closes the FOOT strip; the whole top is the day's name, which it may not compete
  // with. A named day does not also print "today" — the name has already said which day. §4.3
  it("stamps the date in the foot strip and gives the top to the name", () => {
    const { container } = render(<TodaySheet day={day({ title: "суббота длиною в год" })} today="2026-09-19" />);

    expect(container.querySelector(".today-sheet__foot .today-sheet__stamp")!.textContent).toBe("суббота 19.09");
    expect(container.querySelector(".today-sheet__voice")!.textContent).toBe("суббота длиною в год");
    expect(screen.queryByText("сегодня")).toBeNull();
  });

  it("gives the voice to the relative word when the day has no name", () => {
    const { container } = render(<TodaySheet day={day()} today="2026-09-19" />);

    expect(container.querySelector(".today-sheet__voice")!.textContent).toBe("сегодня");
    expect(container.querySelector(".today-sheet__foot .today-sheet__stamp")!.textContent).toBe("суббота 19.09");
  });

  // A sitting whose retelling never assembled is not a dead picture: the frame leads to the
  // episode at Spotify instead. A book has no such address and stays a picture. §4.3
  it("turns a frame with no retelling into a door to the episode", () => {
    const withEpisode = (over: Partial<PodcastEpisodeView>) =>
      day({
        discipline: [
          item({
            key: "podcasts",
            label: "Подкасты",
            target: 1,
            count: 1,
            episodes: [
              {
                episodeName: "Осада Вены",
                episodeUrl: "https://open.spotify.com/episode/x",
                showName: "The Rest Is History",
                showUrl: null,
                imageUrl: null,
                listenedMinutes: 20,
                startMinute: null,
                endMinute: null,
                sessionId: 9,
                hasSummary: false,
                startedAt: null,
                ...over,
              } as PodcastEpisodeView,
            ],
          }),
        ],
      });

    const { container } = render(<TodaySheet day={withEpisode({})} today="2026-09-19" />);
    const link = container.querySelector("a.today-sheet__frame") as HTMLAnchorElement;
    expect(link.href).toBe("https://open.spotify.com/episode/x");
    expect(link.getAttribute("rel")).toBe("noreferrer");

    const homeless = render(<TodaySheet day={withEpisode({ episodeUrl: null })} today="2026-09-19" />);
    expect(homeless.container.querySelector("a.today-sheet__frame")).toBeNull();
  });

  it("sizes the name from its own length, so a long one stays loud", () => {
    const short = render(<TodaySheet day={day({ title: "экстрадень" })} today="2026-09-19" />);
    const long = render(<TodaySheet day={day({ title: "т".repeat(74) })} today="2026-09-19" />);

    const size = (r: { container: HTMLElement }) =>
      (r.container.querySelector(".today-sheet__voice") as HTMLElement).style.fontSize;
    expect(size(short)).toContain("32px");
    expect(size(long)).toContain("cqw");
  });

  it("shows the covered chunk as a run on a track, not as percentages", () => {
    const { container } = render(<TodaySheet day={withBook()} today="2026-09-19" />);

    expect(screen.getByText("Пятая гора")).toBeInTheDocument();
    expect(screen.queryByText("43% → 58%")).toBeNull();
    const run = container.querySelector(".today-sheet__run") as HTMLElement;
    expect(parseFloat(run.style.left)).toBeCloseTo(43, 1);
    expect(parseFloat(run.style.width)).toBeCloseTo(15, 1);
  });

  it("speaks the covered chunk in the frame's label, since the track is decoration", () => {
    render(<TodaySheet day={withBook()} today="2026-09-19" />);

    expect(
      screen.getByRole("button", { name: "Что было в прочитанном куске: Пятая гора, 43% → 58%" }),
    ).toBeInTheDocument();
  });

  // Nothing is ever hidden from the fixed row: the item whose sittings became frames keeps its
  // socket and says so, rather than dropping out and shifting every socket to its right. §4.3
  it("keeps the socket of an item that already has a frame, marked as framed", () => {
    const { container } = render(<TodaySheet day={withBook()} today="2026-09-19" />);

    expect(screen.getByRole("button", { name: "Чтение: есть свои кадры" })).toBeInTheDocument();
    expect(container.querySelector(".today-sheet__cell.is-framed")).not.toBeNull();
  });

  it("opens a sitting that has a retelling, and leaves one without it unopenable", () => {
    const { unmount } = render(<TodaySheet day={withBook()} today="2026-09-19" />);
    expect(screen.getByRole("button", { name: /Что было в прочитанном куске/ })).toBeInTheDocument();
    unmount();

    const mute = day({
      discipline: [
        item({
          key: "reading",
          target: 2,
          count: 1,
          books: [
            {
              title: "Пятая гора",
              author: null,
              coverUrl: null,
              startedAt: null,
              readMinutes: 24,
              startPercent: null,
              endPercent: 0.58,
              sessionId: null,
              hasSummary: false,
            },
          ],
        }),
      ],
    });
    render(<TodaySheet day={mute} today="2026-09-19" />);

    expect(screen.queryByRole("button", { name: /Что было в прочитанном куске/ })).toBeNull();
    expect(screen.getByText("Пятая гора")).toBeInTheDocument();
  });

  // The monster is a frame of the row, so a day with no sittings still has one picture standing:
  // the row never collapses, and the sheet is never an empty rectangle. DESIGN §4.3
  it("keeps the frame row on a day with no sittings, the monster standing alone in it", () => {
    const { container } = render(
      <TodaySheet day={day({ discipline: [item({ key: "stretch", count: 1 })] })} today="2026-09-19" />,
    );

    const row = container.querySelector(".today-sheet__frames")!;
    expect(row.querySelectorAll(".today-sheet__frame")).toHaveLength(0);
    expect(row.querySelectorAll(".today-sheet__monster")).toHaveLength(1);
    expect(container.querySelectorAll(".today-sheet__sockets .today-sheet__cell")).toHaveLength(1);
  });

  // The monster CLOSES the row rather than floating away at its far right edge.
  it("puts the monster last in the frame row, after every sitting", () => {
    const { container } = render(<TodaySheet day={withBook()} today="2026-09-19" />);

    const kids = [...container.querySelector(".today-sheet__frames")!.children];
    expect(kids).toHaveLength(2);
    expect(kids[0].className).toContain("today-sheet__frame");
    expect(kids[1].className).toContain("today-sheet__monster");
  });

  it("stands the activities, then the day's photo, before the monster", () => {
    const photo = { thumbUrl: "/p/thumb", webUrl: "/p/web", width: 1600, height: 1200 };
    const { container } = render(
      <TodaySheet day={withBook({ activities: ["bouldering", "squash"], photo })} today="2026-09-19" />,
    );

    const kids = [...container.querySelector(".today-sheet__frames")!.children];
    expect(kids.map((k) => k.className.split(" ")[0])).toEqual([
      "today-sheet__frame",
      "today-sheet__activity",
      "today-sheet__activity",
      "today-sheet__photo",
      "today-sheet__monster",
    ]);
    expect(screen.getByText("болдеринг")).toBeInTheDocument();
    expect(screen.getByText("сквош")).toBeInTheDocument();
  });

  it("an activity card is a lens of its own: a press names it, a hover tries it on", async () => {
    const onLensChange = vi.fn();
    const onLensPreview = vi.fn();
    const lens = { key: "activity:squash", occurrence: 1, label: "сквош" };
    const { rerender } = render(
      <TodaySheet
        day={day({ activities: ["squash"] })}
        today="2026-09-19"
        onLensChange={onLensChange}
        onLensPreview={onLensPreview}
      />,
    );

    const card = screen.getByRole("button", { name: "сквош" });
    fireEvent.pointerOver(card, { pointerType: "mouse" });
    expect(onLensPreview).toHaveBeenLastCalledWith(lens);
    fireEvent.pointerOut(card, { pointerType: "mouse" });
    expect(onLensPreview).toHaveBeenLastCalledWith(null);

    await userEvent.click(card);
    expect(onLensChange).toHaveBeenCalledWith(lens);
    expect(card).toHaveAttribute("aria-pressed", "false");

    rerender(<TodaySheet day={day({ activities: ["squash"] })} today="2026-09-19" lens={lens} />);
    expect(screen.getByRole("button", { name: "сквош" })).toHaveAttribute("aria-pressed", "true");
  });

  it("no activity cards and no photo on a day without them", () => {
    const { container } = render(<TodaySheet day={withBook()} today="2026-09-19" />);
    expect(container.querySelector(".today-sheet__activity")).toBeNull();
    expect(container.querySelector(".today-sheet__photo")).toBeNull();
  });

  it("the photo opens at full size and closes again", async () => {
    const photo = { thumbUrl: "/p/thumb", webUrl: "/p/web", width: 1600, height: 1200 };
    render(<TodaySheet day={day({ photo })} today="2026-09-19" />);

    await userEvent.click(screen.getByRole("button", { name: "Фото дня" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("dialog").querySelector("img")!.getAttribute("src")).toBe("/p/web");

    await userEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // Esc and a click past the photo leave focus where it was: a ring left around it reads as a selection.
  it("closing the photo leaves no focus on its card", async () => {
    const photo = { thumbUrl: "/p/thumb", webUrl: "/p/web", width: 1600, height: 1200 };
    render(<TodaySheet day={day({ photo })} today="2026-09-19" />);

    await userEvent.click(screen.getByRole("button", { name: "Фото дня" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Фото дня" })).not.toHaveFocus();
  });

  it("the photo carries no caption: the whole card is the picture", () => {
    const photo = { thumbUrl: "/p/thumb", webUrl: "/p/web", width: 1600, height: 1200 };
    const { container } = render(<TodaySheet day={day({ photo })} today="2026-09-19" />);

    expect(screen.queryByText("фото дня")).toBeNull();
    expect(container.querySelector(".today-sheet__photo")!.children).toHaveLength(1);
  });

  // The row's shape is what the eye learns, so its column count follows the items rather than
  // letting a new one wrap onto a second row. DESIGN §4.3
  it("holds every item in the row, in order, and widens the row to fit them", () => {
    const { container } = render(
      <TodaySheet
        day={day({
          discipline: [
            item({ key: "stretch", label: "Растяжка", target: 1, count: 1 }),
            item({ key: "squash", label: "Сквош", target: 0, count: 0 }),
            item({ key: "office", label: "Офис", target: 1, count: 0 }),
          ],
        })}
        today="2026-09-19"
      />,
    );

    const names = [...container.querySelectorAll(".today-sheet__cellname")].map((n) => n.textContent);
    expect(names).toEqual(["растяжка", "Сквош", "офис"]);
    expect((container.querySelector(".today-sheet__sockets") as HTMLElement).style.getPropertyValue("--sheet-sockets")).toBe("3");
    expect(screen.getByRole("button", { name: "Сквош: не отмечен" })).toBeInTheDocument();
  });

  it("marks a not-yet-done item as open while keeping its live run beside it", () => {
    render(
      <TodaySheet
        day={day({
          discipline: [item({ key: "reading", label: "Чтение", target: 2, count: 1, occurrenceStreaks: [6, 0] })],
        })}
        today="2026-09-19"
      />,
    );

    expect(screen.getByRole("button", { name: "Чтение: не сделано, 6 дн. подряд" })).toBeInTheDocument();
    expect(screen.getByText("1/2 6д")).toBeInTheDocument();
  });

  it("spells the streak out in words for a screen reader", () => {
    render(
      <TodaySheet
        day={day({ discipline: [item({ key: "office", label: "Офис по расписанию", count: 1, occurrenceStreaks: [14] })] })}
        today="2026-09-19"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Офис по расписанию: сделано, 14 дн. подряд" }),
    ).toBeInTheDocument();
  });

  it("names its lens to the board from a ledge socket, on every press", async () => {
    const onLensChange = vi.fn();
    const lens = { key: "stretch", occurrence: 1, label: "растяжка" };
    const { rerender } = render(
      <TodaySheet
        day={day({ discipline: [item({ key: "stretch", label: "Растяжка", count: 1 })] })}
        today="2026-09-19"
        onLensChange={onLensChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Растяжка/ }));
    expect(onLensChange).toHaveBeenCalledWith(lens);

    rerender(
      <TodaySheet
        day={day({ discipline: [item({ key: "stretch", label: "Растяжка", count: 1 })] })}
        today="2026-09-19"
        lens={lens}
        onLensChange={onLensChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Растяжка/ }));
    // The socket NAMES its lens both times: whether that pins or lets go is the board's call, and
    // only the board knows the PINNED lens rather than the one being tried on (DESIGN §5.2).
    expect(onLensChange).toHaveBeenLastCalledWith(lens);
  });

  /* The try-on (DESIGN §5.2): a hovered socket offers its lens to the board without pinning it.
     Under a finger there is no hover to leave, so a tap stays the whole mechanic there. */
  it("offers a hovered socket's lens to the board, and ignores a finger", () => {
    const onLensPreview = vi.fn();
    render(
      <TodaySheet
        day={day({ discipline: [item({ key: "stretch", label: "Растяжка", count: 1 })] })}
        today="2026-09-19"
        onLensPreview={onLensPreview}
      />,
    );
    const socket = screen.getByRole("button", { name: /Растяжка/ });

    fireEvent.pointerOver(socket, { pointerType: "mouse" });
    expect(onLensPreview).toHaveBeenCalledWith({ key: "stretch", occurrence: 1, label: "растяжка" });

    fireEvent.pointerOut(socket, { pointerType: "mouse" });
    expect(onLensPreview).toHaveBeenLastCalledWith(null);

    onLensPreview.mockClear();
    fireEvent.pointerOver(socket, { pointerType: "touch" });
    expect(onLensPreview).not.toHaveBeenCalled();
  });

  /* Leaving is asked of the ROW, not of a socket: between two sockets the pointer leaves one and
     enters the next, and a drop in that gap would blink the whole field for a frame. §5.2 */
  it("keeps the try-on while the pointer sweeps the row, and drops it on leaving", () => {
    const onLensPreview = vi.fn();
    render(
      <TodaySheet
        day={day({
          discipline: [
            item({ key: "stretch", label: "Растяжка", count: 1 }),
            item({ key: "water", label: "Вода", count: 1 }),
          ],
        })}
        today="2026-09-19"
        onLensPreview={onLensPreview}
      />,
    );
    const stretch = screen.getByRole("button", { name: /Растяжка/ });
    const water = screen.getByRole("button", { name: /Вода/ });

    fireEvent.pointerOver(stretch, { pointerType: "mouse" });
    fireEvent.pointerOut(stretch, { pointerType: "mouse", relatedTarget: water });
    fireEvent.pointerOver(water, { pointerType: "mouse", relatedTarget: stretch });

    expect(onLensPreview).not.toHaveBeenCalledWith(null);
    expect(onLensPreview).toHaveBeenLastCalledWith({ key: "water", occurrence: 1, label: "Вода" });

    fireEvent.pointerOut(water, { pointerType: "mouse" });
    expect(onLensPreview).toHaveBeenLastCalledWith(null);
  });

  /* The monster's lens answers to the FIGURE, not to the square it stands in: most of that square
     is empty canvas, and hovering it offered a lens the cursor was nowhere near. DESIGN §4.3 */
  it("offers the monster's lens from the figure, not from the canvas around it", () => {
    const onLensPreview = vi.fn();
    const { container } = render(
      <TodaySheet day={day()} today="2026-09-19" onLensPreview={onLensPreview} />,
    );
    const shot = container.querySelector(".today-sheet__monster .today-sheet__shot") as HTMLElement;
    // jsdom lays nothing out, so the square states its own size.
    shot.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;

    // The canvas margin beside the can: the pointer is on the card, not on the monster.
    fireEvent.pointerMove(shot, { pointerType: "mouse", clientX: 5, clientY: 50 });
    expect(onLensPreview).not.toHaveBeenCalledWith(expect.objectContaining({ key: "monster" }));

    fireEvent.pointerMove(shot, { pointerType: "mouse", clientX: 50, clientY: 50 });
    expect(onLensPreview).toHaveBeenLastCalledWith({
      key: "monster",
      occurrence: 1,
      label: "монстр",
    });

    // Off the figure again, still on the square: the try-on dies here too.
    fireEvent.pointerMove(shot, { pointerType: "mouse", clientX: 95, clientY: 50 });
    expect(onLensPreview).toHaveBeenLastCalledWith(null);
  });

  // The monster is a card among the frames, not a socket: an unreported day shows the figure and
  // says "no data", because a silent monster is not a clean one (PRD §5.6).
  it("gives the monster a card of its own, naming the silence on a day with no record", () => {
    const { container, unmount } = render(<TodaySheet day={day()} today="2026-09-19" />);
    expect(screen.getByRole("button", { name: "Монстр: пока не пил" })).toBeInTheDocument();
    // The line under the figure NAMES the silence instead of standing empty.
    expect(screen.getByText("пока не пил")).toBeInTheDocument();
    expect(container.querySelector(".today-sheet__monster.is-unreported")).not.toBeNull();
    expect(container.querySelector(".today-sheet__monstersay")!.textContent).toBe("пока не пил");
    expect(container.querySelector(".today-sheet__cell.is-unreported")).toBeNull();
    unmount();

    const clean = render(
      <TodaySheet day={day({ monsterDrunk: false, monsterCleanStreak: 14 })} today="2026-09-19" />,
    );
    expect(clean.container.querySelector(".today-sheet__monstersay")!.textContent).toBe("14 дней не пил");

    const drunk = render(<TodaySheet day={day({ monsterDrunk: true })} today="2026-09-19" />);
    expect(drunk.container.querySelector(".today-sheet__monster.is-drunk")).not.toBeNull();
    expect(drunk.getByText("пил")).toBeInTheDocument();
  });
});
