import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DisciplineItemView, PodcastEpisodeView, ReadingBookView } from "@/lib/api/types";
import { QuestMap } from "./QuestMap";

function item(
  key: string,
  count: number,
  target: number,
  occurrenceStreaks?: number[],
  measuredMinutes?: number | null,
): DisciplineItemView {
  return { key, label: key, icon: null, count, target, occurrenceStreaks, measuredMinutes };
}

const ALL_DONE: DisciplineItemView[] = [
  item("stretch", 1, 1),
  item("podcasts", 2, 2),
  item("office", 1, 1),
  item("reading", 2, 2),
  item("journal", 1, 1),
];

describe("QuestMap", () => {
  it("рендерит 7 остановок маршрута, детур монстра и итог дня", () => {
    render(<QuestMap items={[]} monsterDrunk={false} />);

    // items with target=2 give two stops (occurrence 1 and 2)
    for (const id of [
      "quest-stop-stretch-1",
      "quest-stop-podcasts-1",
      "quest-stop-office-1",
      "quest-stop-reading-1",
      "quest-stop-podcasts-2",
      "quest-stop-reading-2",
      "quest-stop-journal-1",
      "quest-stop-monster",
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    // There is no "N/7" day total on the map: the trail itself reads as the count.
    expect(screen.queryByTestId("quest-total")).not.toBeInTheDocument();
  });

  it("остановка done по счётчику ≥ occurrence; иначе pending (два состояния, без missed)", () => {
    // reading is fully closed (both stops), stretching is not → stretching is pending
    render(<QuestMap items={[item("reading", 2, 2), item("stretch", 0, 1)]} monsterDrunk={false} />);

    expect(screen.getByTestId("quest-stop-reading-1")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("quest-stop-reading-2")).toHaveAttribute("data-done", "true");
    const stretch = screen.getByTestId("quest-stop-stretch-1");
    expect(stretch).toHaveAttribute("data-done", "false");
    // "missed" is no longer singled out — everything undone is pending
    expect(stretch.getAttribute("class")).toContain("quest-stop--pending");
    expect(stretch.getAttribute("class")).not.toContain("quest-stop--missed");
    expect(screen.getByTestId("quest-stop-journal-1").getAttribute("class")).toContain(
      "quest-stop--pending",
    );
    expect(screen.queryByTestId("quest-total")).not.toBeInTheDocument();
  });

  it("частичный прогресс пункта закрывает только первую его остановку", () => {
    render(<QuestMap items={[item("podcasts", 1, 2)]} monsterDrunk={false} />);
    expect(screen.getByTestId("quest-stop-podcasts-1")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("quest-stop-podcasts-2")).toHaveAttribute("data-done", "false");
  });

  it("дроби прогресса (для скинов со счётчиками): из данных пункта, фолбэк — по маршруту", () => {
    render(<QuestMap items={[item("podcasts", 1, 2)]} monsterDrunk={false} />);
    // both stops of an item show the item's overall progress
    expect(screen.getByTestId("quest-frac-podcasts-1")).toHaveTextContent("1/2");
    expect(screen.getByTestId("quest-frac-podcasts-2")).toHaveTextContent("1/2");
    // the item is absent from the data — target is derived from its stop count on the route
    expect(screen.getByTestId("quest-frac-reading-1")).toHaveTextContent("0/2");
    expect(screen.getByTestId("quest-frac-stretch-1")).toHaveTextContent("0/1");
  });

  it("измеренные минуты вытесняют дробь у своей остановки", () => {
    render(
      <QuestMap items={[item("journal", 1, 1, undefined, 23)]} monsterDrunk={false} />,
    );
    expect(screen.getByTestId("quest-minutes-journal-1")).toHaveTextContent("23 мин");
    // a `1/1` fraction on a binary item adds nothing to the ring, so its place is taken
    expect(screen.queryByTestId("quest-frac-journal-1")).not.toBeInTheDocument();
    // neighbouring items are not measured — their fraction stays
    expect(screen.getByTestId("quest-frac-stretch-1")).toBeInTheDocument();
  });

  it("минуты показываются и когда порог не взят — они объясняют пустую остановку", () => {
    render(
      <QuestMap items={[item("journal", 0, 1, undefined, 6)]} monsterDrunk={false} />,
    );
    expect(screen.getByTestId("quest-stop-journal-1")).toHaveAttribute("data-done", "false");
    expect(screen.getByTestId("quest-minutes-journal-1")).toHaveTextContent("6 мин");
  });

  it("без измерения строка остаётся дробью (ручная отметка, старые дни)", () => {
    render(<QuestMap items={[item("journal", 1, 1)]} monsterDrunk={false} />);
    expect(screen.queryByTestId("quest-minutes-journal-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("quest-frac-journal-1")).toHaveTextContent("1/1");
  });

  it("измеренный ноль — это не «не мерили»: цифра рисуется", () => {
    render(<QuestMap items={[item("journal", 0, 1, undefined, 0)]} monsterDrunk={false} />);
    expect(screen.getByTestId("quest-minutes-journal-1")).toHaveTextContent("0 мин");
  });

  it("все 7 остановок закрыты — маршрут в perfect-подсветке (монстр не обязателен)", () => {
    render(<QuestMap items={ALL_DONE} monsterDrunk={false} />);
    expect(screen.getByTestId("quest-map").getAttribute("class")).toContain("quest-map--perfect");
    // The celebration lives in the route's class rather than a number: there is no total any more.
    expect(screen.queryByTestId("quest-total")).not.toBeInTheDocument();
  });

  it("детур монстра отражает «пил/не пил»", () => {
    render(<QuestMap items={[]} monsterDrunk={true} />);
    expect(screen.getByTestId("quest-stop-monster")).toHaveAttribute("data-done", "true");
  });

  it("подпись монстра называет вердикт словами, а не одним словом «монстр»", () => {
    const { rerender } = render(<QuestMap items={[]} monsterDrunk={true} />);
    expect(screen.getByTestId("quest-monster-verdict")).toHaveTextContent("пил монстр");

    rerender(<QuestMap items={[]} monsterDrunk={false} />);
    expect(screen.getByTestId("quest-monster-verdict")).toHaveTextContent("не пил монстр");
  });

  it("глагол вердикта красится своим токеном: «не пил» зелёным, «пил» тревожным", () => {
    const verb = (drunk: boolean) => {
      const { unmount } = render(<QuestMap items={[]} monsterDrunk={drunk} />);
      const style = screen.getByTestId("quest-monster-verb").getAttribute("style") ?? "";
      unmount();
      return style;
    };
    expect(verb(false)).toContain("--accent-clean");
    expect(verb(true)).toContain("--danger");
  });

  it("детур не притворяется пунктом дисциплины: у монстра свои состояния clean/drunk", () => {
    // A regression anchor on polarity: a drunk monster used to close the detour as "done", so the
    // ring and trail were painted as an achievement when the achievement was a clean day.
    const { rerender } = render(<QuestMap items={[]} monsterDrunk={true} />);
    let stop = screen.getByTestId("quest-stop-monster");
    expect(stop.getAttribute("class")).toContain("quest-stop--drunk");
    expect(stop.getAttribute("class")).not.toContain("quest-stop--done");

    rerender(<QuestMap items={[]} monsterDrunk={false} />);
    stop = screen.getByTestId("quest-stop-monster");
    expect(stop.getAttribute("class")).toContain("quest-stop--clean");
    // "Not drunk" is not "not reached yet": it is not drawn as an unclosed item's grey dashes.
    expect(stop.getAttribute("class")).not.toContain("quest-stop--pending");
  });

  it("к монстру не ведёт тропа: он стоит отдельно от маршрута, без стрелки", () => {
    // The detour branch is gone entirely. Any trail to the monster spoke of it as a stage of the
    // day, and there was no way to colour it: "walked" praised drinking, "not walked" scolded a
    // clean day.
    const { rerender } = render(<QuestMap items={[]} monsterDrunk={true} />);
    expect(screen.queryByTestId("quest-seg-monster")).toBeNull();

    rerender(<QuestMap items={[]} monsterDrunk={false} />);
    expect(screen.queryByTestId("quest-seg-monster")).toBeNull();
    // As many segments as there are gaps between the route's 7 stops.
    expect(document.querySelectorAll(".quest-seg")).toHaveLength(6);
  });

  it("дроби «1/1» у монстра нет: она читалась как закрытый пункт, а вердикт словами точнее", () => {
    render(<QuestMap items={[]} monsterDrunk={true} />);
    expect(screen.queryByTestId("quest-frac-monster")).toBeNull();
  });

  it("нет данных за день — монстр серый, как любая незакрытая остановка, и без вердикта", () => {
    render(<QuestMap items={[]} monsterDrunk={null} />);
    // The caption is just the noun, with no verb: no record is not passed off as a clean day.
    expect(screen.getByTestId("quest-monster-verdict")).toHaveTextContent(/^монстр$/);
    expect(screen.queryByTestId("quest-monster-verb")).toBeNull();
    // The picture is exactly that of the route's other unclosed items.
    const stop = screen.getByTestId("quest-stop-monster");
    expect(stop.getAttribute("class")).toContain("quest-stop--pending");
    expect(stop.getAttribute("class")).not.toContain("quest-stop--clean");
    expect(stop.getAttribute("class")).not.toContain("quest-stop--drunk");
  });

  it("запись за день есть, вкуса нет — это честное «не пил», а не «нет данных»", () => {
    render(<QuestMap items={[]} monsterDrunk={false} />);
    expect(screen.getByTestId("quest-monster-verdict")).toHaveTextContent("не пил монстр");
    expect(screen.getByTestId("quest-stop-monster").getAttribute("class")).toContain(
      "quest-stop--clean",
    );
  });

  it("описание карты и без данных не врёт: «нет данных о монстре», а не «не пил»", () => {
    render(<QuestMap items={[]} monsterDrunk={null} />);
    expect(screen.getByTestId("quest-map")).toHaveAttribute(
      "aria-label",
      "Дисциплина: 0 из 7, нет данных о монстре",
    );
  });

  it("описание карты всегда называет монстра — и чистый день тоже", () => {
    // The map used to say nothing about a clean day, so for a screen reader "not drunk" was
    // indistinguishable from "no data".
    const { rerender } = render(<QuestMap items={[]} monsterDrunk={false} />);
    expect(screen.getByTestId("quest-map")).toHaveAttribute(
      "aria-label",
      "Дисциплина: 0 из 7, не пил монстр",
    );

    rerender(<QuestMap items={ALL_DONE} monsterDrunk={true} />);
    expect(screen.getByTestId("quest-map")).toHaveAttribute(
      "aria-label",
      "Дисциплина: 7 из 7, пил монстр",
    );
  });

  it("огонёк-стрик пункта: показывается от 2, по своей остановке (occurrence)", () => {
    // podcasts: a run of ≥1 for seven days, ≥2 for three → stop 1 shows 7, stop 2 shows 3
    render(<QuestMap items={[item("podcasts", 2, 2, [7, 3])]} monsterDrunk={false} />);
    expect(screen.getByTestId("quest-streak-podcasts-1")).toHaveTextContent("7");
    expect(screen.getByTestId("quest-streak-podcasts-2")).toHaveTextContent("3");
    // the tooltip says WHAT and how many days running (a native SVG <title> is the accessible name)
    expect(screen.getByTestId("quest-streak-podcasts-1")).toHaveAttribute(
      "aria-label",
      "подкаст: 7 дней подряд",
    );
  });

  it("стрик < 2 и без данных о стрике — значок не рисуется (шум на карте)", () => {
    render(
      <QuestMap
        items={[item("stretch", 1, 1, [1]), item("journal", 1, 1)]}
        monsterDrunk={false}
      />,
    );
    // a run of 1 is hidden
    expect(screen.queryByTestId("quest-streak-stretch-1")).toBeNull();
    // no occurrenceStreaks at all (an old reply or fixture) — hidden too, without failing
    expect(screen.queryByTestId("quest-streak-journal-1")).toBeNull();
  });

  it("огонёк-стрик монстра: «дней чисто» от 2, иначе скрыт", () => {
    const { rerender } = render(
      <QuestMap items={[]} monsterDrunk={false} monsterCleanStreak={12} />,
    );
    expect(screen.getByTestId("quest-streak-monster")).toHaveTextContent("12");
    // The same wording as the detour caption and the calendar summary — one vocabulary per fact.
    expect(screen.getByTestId("quest-streak-monster")).toHaveAttribute(
      "aria-label",
      "не пил монстр: 12 дней подряд",
    );
    // The "clean" flame burns green, the same colour as the verdict beneath it.
    expect(screen.getByTestId("quest-streak-monster").getAttribute("class")).toContain(
      "quest-streak--clean",
    );

    rerender(<QuestMap items={[]} monsterDrunk={false} monsterCleanStreak={1} />);
    expect(screen.queryByTestId("quest-streak-monster")).toBeNull();
  });
});

describe("QuestMap — карточки прослушанных подкастов", () => {
  const episode = (
    name: string,
    listened: number,
    duration: number | null = 48,
    patch: Partial<PodcastEpisodeView> = {},
  ): PodcastEpisodeView => ({
    episodeName: name,
    episodeUrl: `https://open.spotify.com/episode/${name}`,
    showName: `шоу ${name}`,
    showUrl: `https://open.spotify.com/show/${name}`,
    imageUrl: "https://i.scdn.co/image/cover.jpg",
    listenedMinutes: listened,
    startMinute: 0,
    endMinute: listened,
    durationMinutes: duration,
    ...patch,
  });

  const withEpisodes = (episodes: PodcastEpisodeView[]): DisciplineItemView[] => [
    { key: "podcasts", label: "подкаст", icon: null, count: 2, target: 2, episodes },
  ];

  it("вешает по карточке на остановку и подписывает эпизод, шоу и минуты", () => {
    render(<QuestMap items={withEpisodes([episode("Утро", 47)])} monsterDrunk={false} />);

    expect(screen.getByText("Утро")).toBeInTheDocument();
    expect(screen.getByText("шоу Утро")).toBeInTheDocument();
    // There is no start time on the card: it answers "what it was, how much of it and which chunk",
    // not "when I pressed play".
    const card = screen.getAllByTestId("quest-card")[0];
    expect(card).toHaveTextContent("47 мин");
    expect(card).toHaveTextContent("0 → 47 мин");
  });

  /**
   * When an episode cover does not arrive (Spotify's CDN hangs), the same Spotify fallback plate
   * as in the music tile stands in its place, not a blank rectangle. The stop's preview and the
   * card show the refusal IDENTICALLY: it is one cover of one episode.
   */
  it("обложка эпизода не приехала ⇒ плашка Spotify и в карточке, и в превью у остановки", () => {
    vi.useFakeTimers();
    const { container } = render(
      <QuestMap items={withEpisodes([episode("Утро", 47)])} monsterDrunk={false} />,
    );

    act(() => void vi.advanceTimersByTime(3_000));

    const card = screen.getAllByTestId("quest-card")[0];
    expect(card.querySelector(".cover-plate")).not.toBeNull();
    const preview = container.querySelector('[data-testid="quest-preview-podcasts-1"]');
    expect(preview!.querySelector(".cover-plate")).not.toBeNull();
    vi.useRealTimers();
  });

  it("кусок горит зелёным целиком — вместе с единицей", () => {
    render(<QuestMap items={withEpisodes([episode("Утро", 47)])} monsterDrunk={false} />);

    const card = screen.getAllByTestId("quest-card")[0];
    // One line, one colour: the unit is inseparable from the digits it stands with, so there is no
    // separate element for it — nothing to colour apart.
    expect(card.querySelector(".quest-card__progress-value")).toHaveTextContent("0 → 47 мин");
    expect(card.querySelector(".quest-card__progress-unit")).toBeNull();
  });

  it("ведёт ссылками на эпизод и на шоу", () => {
    render(<QuestMap items={withEpisodes([episode("Утро", 47)])} monsterDrunk={false} />);

    expect(screen.getByText("Утро").closest("a")).toHaveAttribute(
      "href",
      "https://open.spotify.com/episode/Утро",
    );
    expect(screen.getByText("шоу Утро").closest("a")).toHaveAttribute(
      "href",
      "https://open.spotify.com/show/Утро",
    );
  });

  it("один длинный эпизод закрывает обе остановки, но карточка остаётся одна", () => {
    render(<QuestMap items={withEpisodes([episode("Длинный", 120)])} monsterDrunk={false} />);

    expect(screen.getAllByTestId("quest-card")).toHaveLength(1);
  });

  it("эпизод, взятый двумя заходами, различает карточки СВОИМ куском выпуска", () => {
    // 80 minutes of one episode: 0→45 in the morning, 45→80 in the evening. That is what the second
    // line is for — bare minutes do not say the evening continued rather than restarted.
    render(
      <QuestMap
        items={withEpisodes([
          episode("Ошибки", 45, 85, { startMinute: 0, endMinute: 45 }),
          episode("Ошибки", 35, 85, { startMinute: 45, endMinute: 80 }),
        ])}
        monsterDrunk={false}
      />,
    );

    // Checked inside their own cards: the sitting's line matches the caption under the circle, and
    // a document-wide search would find both.
    const cards = screen.getAllByTestId("quest-card");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("45 мин");
    expect(cards[0]).toHaveTextContent("0 → 45 мин");
    expect(cards[1]).toHaveTextContent("35 мин");
    expect(cards[1]).toHaveTextContent("45 → 80 мин");
    // The episode's daily total is gone from the card — the chunk answers that itself.
    expect(screen.queryByText(/за день/)).toBeNull();
    // And under the circles: each sitting's own minutes, not all 80 under the first.
    expect(screen.getByTestId("quest-minutes-podcasts-1")).toHaveTextContent("45 мин");
    expect(screen.getByTestId("quest-minutes-podcasts-2")).toHaveTextContent("35 мин");
  });

  it("два эпизода дают две карточки", () => {
    render(
      <QuestMap items={withEpisodes([episode("Утро", 40), episode("Вечер", 40)])} monsterDrunk={false} />,
    );

    expect(screen.getAllByTestId("quest-card")).toHaveLength(2);
    expect(screen.getByText("Вечер")).toBeInTheDocument();
  });

  it("карточки — последний слой карты, поверх монстра и всего остального", () => {
    render(<QuestMap items={withEpisodes([episode("Утро", 40)])} monsterDrunk />);

    // SVG has no z-index: whatever is drawn later is on top. The monster comes after the stops, and
    // inside its own stop it was the one covering the card.
    const svg = document.querySelector("svg.quest-map")!;
    const nodes = Array.from(svg.children);
    const cards = nodes.findIndex((n) => n.classList.contains("quest-cards"));
    const monster = nodes.findIndex((n) => n.classList.contains("quest-stop--monster"));

    expect(cards).toBeGreaterThan(-1);
    expect(cards).toBeGreaterThan(monster);
    expect(cards).toBe(nodes.length - 1);
  });

  it("у верхнего ряда карточка падает ПОД остановку, у нижнего — встаёт над ней", () => {
    render(
      <QuestMap items={withEpisodes([episode("Утро", 40), episode("Вечер", 40)])} monsterDrunk={false} />,
    );

    // The podcast stops sit at y=45 (top row) and y=160 (bottom). There is no room above the first,
    // so its card would leave the viewBox and be cut by the map's edge and the header date.
    const [first, second] = screen.getAllByTestId("quest-card").map((card) =>
      Number(card.querySelector("foreignObject")?.getAttribute("y")),
    );

    expect(first).toBeGreaterThan(45);
    expect(second).toBeLessThan(160);
    // And both are inside the viewBox vertically.
    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBeGreaterThanOrEqual(0);
  });

  it("под каждой остановкой стоят минуты ЕЁ эпизода, а не сумма за сутки", () => {
    render(
      <QuestMap
        items={[
          {
            key: "podcasts", label: "подкаст", icon: null, count: 2, target: 2,
            measuredMinutes: 62,
            episodes: [episode("Утро", 30), episode("Вечер", 28)],
          },
        ]}
        monsterDrunk={false}
      />,
    );

    expect(screen.getByTestId("quest-minutes-podcasts-1")).toHaveTextContent("30 мин");
    expect(screen.getByTestId("quest-minutes-podcasts-2")).toHaveTextContent("28 мин");
    // The day's sum is not shown under the circles — it would argue with the card above it.
    expect(screen.queryByText("62 мин")).toBeNull();
  });

  it("без карточки остановка возвращается к сумме за сутки у первой и к дроби у второй", () => {
    render(
      <QuestMap
        items={[
          {
            key: "podcasts", label: "подкаст", icon: null, count: 0, target: 2,
            measuredMinutes: 12,
            episodes: [],
          },
        ]}
        monsterDrunk={false}
      />,
    );

    // "12 min" under an unclosed circle answers why the threshold was not reached.
    expect(screen.getByTestId("quest-minutes-podcasts-1")).toHaveTextContent("12 мин");
    expect(screen.getByTestId("quest-frac-podcasts-2")).toHaveTextContent("0/2");
  });

  it("без прослушанного карточек нет вовсе", () => {
    render(<QuestMap items={ALL_DONE} monsterDrunk={false} />);

    expect(screen.queryByTestId("quest-card")).toBeNull();
  });

  it("ссылки карточки лежат ВНЕ кнопки-остановки (вложенная интерактивность недоступна)", () => {
    render(
      <QuestMap
        items={withEpisodes([episode("Утро", 47)])}
        monsterDrunk={false}
        onLensChange={vi.fn()}
      />,
    );

    const link = screen.getByText("Утро").closest("a");
    expect(link?.closest('[role="button"]')).toBeNull();
  });

  it("кнопка пересказа есть только там, где есть что рассказать, и окно у неё общее с книгой", async () => {
    render(
      <QuestMap
        items={withEpisodes([
          { ...episode("Первый", 47), sessionId: 11, hasSummary: true },
          { ...episode("Второй", 30), sessionId: 12, hasSummary: false },
        ])}
        monsterDrunk={false}
      />,
    );

    expect(screen.getByTestId("quest-episode-retell-1")).toBeInTheDocument();
    // An episode may have no text source, and then there is no window to promise (§5.16.1).
    expect(screen.queryByTestId("quest-episode-retell-2")).toBeNull();

    await userEvent.click(screen.getByTestId("quest-episode-retell-1"));
    // ONE window for a book and an episode: the same outline, the same answer, only the header differs.
    expect(screen.getByTestId("summary-modal")).toBeInTheDocument();
    expect(screen.getByTestId("summary-progress")).toHaveTextContent("прослушано за этот заход");
    // The chunk uses the same arrow as a book's percentages: one question, one answer shape.
    expect(screen.getByTestId("summary-progress")).toHaveTextContent("0 → 47 мин");
  });
});

/**
 * A mouse pointer. React synthesises `onPointerEnter` from a bubbling `pointerover`, so hovering is
 * sent as that; jsdom has no `pointerType` at all (no PointerEvent), and the component reads its
 * absence as a mouse.
 */
function hover(el: Element) {
  fireEvent.pointerOver(el);
}
function unhover(el: Element) {
  fireEvent.pointerOut(el, { relatedTarget: document.body });
}
/** A finger tap: `fireEvent` loses `pointerType` (no PointerEvent), so we glue it back on. */
function tap(el: Element) {
  const ev = new Event("pointerdown", { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "pointerType", { value: "touch" });
  fireEvent(el, ev);
}
const isOpen = (card: Element) => card.getAttribute("class")?.includes("quest-card--open") ?? false;

describe("QuestMap — превью обложки у остановки подкаста", () => {
  const episode = (name: string): PodcastEpisodeView => ({
    episodeName: name,
    episodeUrl: `https://open.spotify.com/episode/${name}`,
    showName: `шоу ${name}`,
    showUrl: `https://open.spotify.com/show/${name}`,
    imageUrl: "https://i.scdn.co/image/cover.jpg",
    listenedMinutes: 40,
    startMinute: 0,
    endMinute: 40,
    durationMinutes: 48,
  });
  const withEpisodes = (episodes: PodcastEpisodeView[]): DisciplineItemView[] => [
    { key: "podcasts", label: "подкаст", icon: null, count: 2, target: 2, episodes },
  ];

  it("превью появляется ровно там, где есть что показать в карточке", () => {
    const { rerender } = render(
      <QuestMap items={withEpisodes([episode("Утро")])} monsterDrunk={false} />,
    );
    expect(screen.getByTestId("quest-preview-podcasts-1")).toBeInTheDocument();
    // The episode's second stop got nothing — no card, and so no preview either.
    expect(screen.queryByTestId("quest-preview-podcasts-2")).toBeNull();

    rerender(<QuestMap items={ALL_DONE} monsterDrunk={false} />);
    expect(screen.queryByTestId("quest-preview-podcasts-1")).toBeNull();
  });

  it("превью стоит сверху-слева, а его угол заходит ЗА диск остановки", () => {
    render(<QuestMap items={withEpisodes([episode("Утро")])} monsterDrunk={false} />);

    const preview = screen.getByTestId("quest-preview-podcasts-1");
    const fo = preview.querySelector("foreignObject")!;
    const x = Number(fo.getAttribute("x"));
    const y = Number(fo.getAttribute("y"));
    const size = Number(fo.getAttribute("width"));

    // Podcast stop №1 sits at (140, 45) with a disc radius of 17.
    const [cx, cy] = [140, 45];
    // The preview's body is above and left of the stop's centre.
    expect(x + size).toBeLessThan(cx);
    expect(y + size).toBeLessThan(cy);
    // Its bottom right corner goes UNDER the disc rather than touching it from outside.
    expect(Math.hypot(cx - (x + size), cy - (y + size))).toBeLessThan(17);
    // And entirely inside the viewBox.
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
  });

  it("превью нарисовано ДО остановки — иначе угол лёг бы поверх диска, а не под ним", () => {
    render(<QuestMap items={withEpisodes([episode("Утро")])} monsterDrunk={false} />);

    const preview = screen.getByTestId("quest-preview-podcasts-1");
    const kids = Array.from(preview.parentElement!.children);
    const stop = kids.findIndex((n) => n.classList.contains("quest-stop"));
    expect(stop).toBeGreaterThan(-1);
    expect(kids.indexOf(preview)).toBeLessThan(stop);
  });

  it("карточку раскрывает наведение на превью, а не на саму остановку", () => {
    render(<QuestMap items={withEpisodes([episode("Утро")])} monsterDrunk={false} />);
    const card = screen.getByTestId("quest-card");

    // A stop is the calendar lens's switch; a pointer crossing the route does not summon a card.
    hover(screen.getByTestId("quest-stop-podcasts-1"));
    expect(isOpen(card)).toBe(false);

    hover(screen.getByTestId("quest-preview-podcasts-1"));
    expect(isOpen(card)).toBe(true);
  });

  it("указатель, ушедший с остановки совсем, закрывает карточку", () => {
    vi.useFakeTimers();
    try {
      render(<QuestMap items={withEpisodes([episode("Утро")])} monsterDrunk={false} />);
      const card = screen.getByTestId("quest-card");
      const preview = screen.getByTestId("quest-preview-podcasts-1");

      hover(preview);
      expect(isOpen(card)).toBe(true);

      unhover(preview);
      // Closing is delayed: the pointer needs time to reach the card and its links.
      expect(isOpen(card)).toBe(true);
      act(() => {
        vi.runAllTimers();
      });
      expect(isOpen(card)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("на тач карточку показывает и прячет тап по превью", () => {
    render(<QuestMap items={withEpisodes([episode("Утро")])} monsterDrunk={false} />);
    const card = screen.getByTestId("quest-card");
    const preview = screen.getByTestId("quest-preview-podcasts-1");

    tap(preview);
    expect(isOpen(card)).toBe(true);
    tap(preview);
    expect(isOpen(card)).toBe(false);
  });

  it("тап мимо карточки закрывает её", () => {
    render(<QuestMap items={withEpisodes([episode("Утро")])} monsterDrunk={false} />);
    const card = screen.getByTestId("quest-card");

    tap(screen.getByTestId("quest-preview-podcasts-1"));
    expect(isOpen(card)).toBe(true);

    tap(document.body);
    expect(isOpen(card)).toBe(false);
  });

  it("тап внутри карточки её не закрывает — там живые ссылки", () => {
    render(<QuestMap items={withEpisodes([episode("Утро")])} monsterDrunk={false} />);
    const card = screen.getByTestId("quest-card");

    tap(screen.getByTestId("quest-preview-podcasts-1"));
    tap(screen.getByText("Утро"));
    expect(isOpen(card)).toBe(true);
  });

  it("превью лежит ВНЕ кнопки-остановки: тап по нему не переключает линзу календаря", () => {
    const onLensChange = vi.fn();
    render(
      <QuestMap
        items={withEpisodes([episode("Утро")])}
        monsterDrunk={false}
        onLensChange={onLensChange}
      />,
    );

    const preview = screen.getByTestId("quest-preview-podcasts-1");
    expect(preview.closest('[role="button"]')).toBeNull();
    tap(preview);
    expect(onLensChange).not.toHaveBeenCalled();
  });
});

describe("QuestMap — линза календаря", () => {
  it("без обработчика остановки не интерактивны (карта прежняя)", () => {
    render(<QuestMap items={ALL_DONE} monsterDrunk={false} />);
    const stop = screen.getByTestId("quest-stop-stretch-1");
    expect(stop).not.toHaveAttribute("role", "button");
    expect(stop).not.toHaveAttribute("aria-pressed");
  });

  it("клик по остановке включает линзу этой остановки (ключ + occurrence)", async () => {
    const onLensChange = vi.fn();
    render(<QuestMap items={ALL_DONE} monsterDrunk={false} onLensChange={onLensChange} />);

    await userEvent.click(screen.getByTestId("quest-stop-podcasts-2"));
    expect(onLensChange).toHaveBeenCalledWith({ key: "podcasts", occurrence: 2, label: "подкаст" });
  });

  it("повторный клик по выбранной остановке снимает линзу", async () => {
    const onLensChange = vi.fn();
    render(
      <QuestMap
        items={ALL_DONE}
        monsterDrunk={false}
        lens={{ key: "stretch", occurrence: 1, label: "растяжка" }}
        onLensChange={onLensChange}
      />,
    );
    await userEvent.click(screen.getByTestId("quest-stop-stretch-1"));
    expect(onLensChange).toHaveBeenCalledWith(null);
  });

  it("выбранная остановка приподнята и озвучена; соседняя — нет", () => {
    render(
      <QuestMap
        items={ALL_DONE}
        monsterDrunk={false}
        lens={{ key: "reading", occurrence: 2, label: "чтение" }}
        onLensChange={() => {}}
      />,
    );
    const focused = screen.getByTestId("quest-stop-reading-2");
    expect(focused).toHaveAttribute("data-focused", "true");
    expect(focused.getAttribute("class")).toContain("quest-stop--focused");
    expect(focused).toHaveAttribute("aria-pressed", "true");

    // the same ITEM's first stop is a separate lens and is not highlighted
    const sibling = screen.getByTestId("quest-stop-reading-1");
    expect(sibling).not.toHaveAttribute("data-focused");
    expect(sibling).toHaveAttribute("aria-pressed", "false");
  });

  it("монстр тоже включает линзу — со своим ключом", async () => {
    const onLensChange = vi.fn();
    render(<QuestMap items={[]} monsterDrunk={true} onLensChange={onLensChange} />);
    await userEvent.click(screen.getByTestId("quest-stop-monster"));
    expect(onLensChange).toHaveBeenCalledWith({ key: "monster", occurrence: 1, label: "монстр" });
  });

  it("кнопка-детур озвучивает вердикт: aria-label кнопки перекрывает подпись, и без него «пил/не пил» до скринридера не доходит", async () => {
    render(<QuestMap items={[]} monsterDrunk={true} onLensChange={() => {}} />);
    expect(screen.getByTestId("quest-stop-monster")).toHaveAttribute(
      "aria-label",
      "пил монстр: показать в календаре",
    );
  });

  it("остановка доступна с клавиатуры (Enter)", async () => {
    const onLensChange = vi.fn();
    render(<QuestMap items={ALL_DONE} monsterDrunk={false} onLensChange={onLensChange} />);
    const stop = screen.getByTestId("quest-stop-office-1");
    stop.focus();
    await userEvent.keyboard("{Enter}");
    expect(onLensChange).toHaveBeenCalledWith({ key: "office", occurrence: 1, label: "офис" });
  });
});

/**
 * Book covers at reading stops (§5.16). The mechanics are shared with podcasts, so only the
 * DIFFERENCES are here: the two stops take different sides, and the card tells about the chunk of
 * the book covered rather than an episode's duration.
 */
describe("QuestMap · чтение", () => {
  const book = (title: string, patch: Partial<ReadingBookView> = {}): ReadingBookView => ({
    title,
    author: "Лавкрафт",
    coverUrl: "/api/reading/cover/1",
    startedAt: "2026-08-13T16:04:00Z",
    readMinutes: 32,
    startPercent: 0.35,
    endPercent: 0.42,
    ...patch,
  });
  const withBooks = (books: ReadingBookView[]): DisciplineItemView[] => [
    { key: "reading", label: "чтение", icon: null, count: 2, target: 2, books },
  ];

  it("превью появляется ровно там, где есть что показать в карточке", () => {
    render(<QuestMap items={withBooks([book("Хребты безумия")])} monsterDrunk={false} />);

    expect(screen.getByTestId("quest-preview-reading-1")).toBeInTheDocument();
    // The session's second stop got nothing — no card, and so no preview either.
    expect(screen.queryByTestId("quest-preview-reading-2")).toBeNull();
  });

  it("у верхней остановки обложка слева, у нижней справа", () => {
    render(
      <QuestMap items={withBooks([book("Первая"), book("Вторая")])} monsterDrunk={false} />,
    );

    const boxOf = (occurrence: number) =>
      screen.getByTestId(`quest-preview-reading-${occurrence}`).querySelector("foreignObject")!;
    const stopOf = (occurrence: number) =>
      screen.getByTestId(`quest-stop-reading-${occurrence}`).querySelector("circle")!;

    // On the left: the picture's right edge does not pass the disc's centre. Mirrored on the right.
    const first = Number(boxOf(1).getAttribute("x")) + Number(boxOf(1).getAttribute("width"));
    expect(first).toBeLessThan(Number(stopOf(1).getAttribute("cx")));
    expect(Number(boxOf(2).getAttribute("x"))).toBeGreaterThan(Number(stopOf(2).getAttribute("cx")));
  });

  it("карточка жмётся под короткое название и не тянет за собой пустоту", () => {
    const widthOf = (title: string) => {
      const { unmount } = render(
        <QuestMap items={withBooks([book(title)])} monsterDrunk={false} />,
      );
      const fo = screen
        .getAllByTestId("quest-card")[0]
        .querySelector("foreignObject")!;
      const w = Number(fo.getAttribute("width"));
      unmount();
      return w;
    };

    const short = widthOf("Дюна");
    const long = widthOf("Хребты безумия и другие истории о невыразимом ужасе");

    expect(short).toBeLessThan(long);
    // The ceiling is shared with the podcast card: the two items' sizes must not diverge.
    expect(long).toBe(214);
  });

  it("ширину карточки книги оценивает по МОНОШИРИННОЙ доле — им набран весь её текст", () => {
    // The width estimate must reckon with the face the line will be SET in: the title and author
    // are now monospaced like the podcast card's, and a monospaced glyph is wider. With the old
    // proportional ratio the estimate came out 11 units short and the title scrolled needlessly.
    render(
      <QuestMap items={withBooks([book("АБВГДЕЖЗИКЛМНОПРСТУФ")])} monsterDrunk={false} />,
    );

    const fo = screen.getAllByTestId("quest-card")[0].querySelector("foreignObject")!;
    expect(Number(fo.getAttribute("width"))).toBe(206);
  });

  it("кнопка пересказа есть только там, где есть что рассказать", async () => {
    render(
      <QuestMap
        items={withBooks([
          book("Первая", { sessionId: 1, hasSummary: true }),
          book("Вторая", { sessionId: 2, hasSummary: false }),
        ])}
        monsterDrunk={false}
      />,
    );

    expect(screen.getByTestId("quest-book-retell-1")).toBeInTheDocument();
    // The retelling is built in the background from the book's text; until it exists there is no
    // window to promise (§5.16).
    expect(screen.queryByTestId("quest-book-retell-2")).toBeNull();

    await userEvent.click(screen.getByTestId("quest-book-retell-1"));
    expect(screen.getByTestId("summary-modal")).toBeInTheDocument();
  });


  it("огонёк стрика уходит влево от остановки, чью обложку он бы накрыл", () => {
    render(
      <QuestMap
        items={[
          {
            key: "reading",
            label: "чтение",
            icon: null,
            count: 2,
            target: 2,
            occurrenceStreaks: [4, 4],
            books: [book("Первая"), book("Вторая")],
          },
        ]}
        monsterDrunk={false}
      />,
    );

    const xOf = (testId: string) =>
      Number(screen.getByTestId(testId).getAttribute("transform")!.match(/translate\((-?[\d.]+)/)![1]);
    const cxOf = (occurrence: number) =>
      Number(screen.getByTestId(`quest-stop-reading-${occurrence}`).querySelector("circle")!.getAttribute("cx"));

    // The first stop's cover is on the left, so the flame stays on the right, as everywhere.
    expect(xOf("quest-streak-reading-1")).toBeGreaterThan(cxOf(1));
    // The second's cover is on the right, and the flame gives way rather than hiding under it.
    expect(xOf("quest-streak-reading-2")).toBeLessThan(cxOf(2));
  });

  it("карточка рассказывает книгу и пройденный кусок, но не часы", () => {
    render(<QuestMap items={withBooks([book("Хребты безумия")])} monsterDrunk={false} />);

    expect(screen.getByTestId("quest-book-title-1")).toHaveTextContent("Хребты безумия");
    expect(screen.getByText("35% → 42%")).toBeInTheDocument();
    // The digits are labelled with a word, which explains what the percentages are.
    expect(screen.getByText(/прочитано/)).toBeInTheDocument();
    // Reading carries no clock at all: the only time we know is the shelf's sync, that is the end
    // of a sitting with an unpredictable lag (see `readingCard.ts`).
    expect(screen.queryByText(/19:04/)).toBeNull();
    expect(screen.queryByText(/·/)).toBeNull();
  });

  it("проценты книги зеленеют тем же классом, что минуты выпуска", () => {
    render(<QuestMap items={withBooks([book("Хребты безумия")])} monsterDrunk={false} />);

    const card = screen.getAllByTestId("quest-card")[0];
    expect(card.querySelector(".quest-card__progress-value")).toHaveTextContent("35% → 42%");
  });

  it("под остановкой стоят минуты своей сессии, а не сумма за сутки", () => {
    render(
      <QuestMap
        items={[
          {
            key: "reading",
            label: "чтение",
            icon: null,
            count: 2,
            target: 2,
            measuredMinutes: 58,
            books: [book("Первая", { readMinutes: 32 }), book("Вторая", { readMinutes: 26 })],
          },
        ]}
        monsterDrunk={false}
      />,
    );

    // Otherwise the caption would argue with the card right above it (as for podcasts).
    expect(screen.getByText("32 мин")).toBeInTheDocument();
    expect(screen.getByText("26 мин")).toBeInTheDocument();
    expect(screen.queryByText("58 мин")).toBeNull();
  });
});
