import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DisciplineItemView, ReadingBookView } from "@/lib/api/types";
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

    // пункты с target=2 дают две остановки (occurrence 1 и 2)
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
    // Итога дня «N/7» на карте нет (решение владельца): счёт читается самой тропой.
    expect(screen.queryByTestId("quest-total")).not.toBeInTheDocument();
  });

  it("остановка done по счётчику ≥ occurrence; иначе pending (два состояния, без missed)", () => {
    // чтение закрыто целиком (обе остановки), растяжка нет → растяжка «не сделано» = pending
    render(<QuestMap items={[item("reading", 2, 2), item("stretch", 0, 1)]} monsterDrunk={false} />);

    expect(screen.getByTestId("quest-stop-reading-1")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("quest-stop-reading-2")).toHaveAttribute("data-done", "true");
    const stretch = screen.getByTestId("quest-stop-stretch-1");
    expect(stretch).toHaveAttribute("data-done", "false");
    // «пропущено» (missed) больше не выделяем — всё несделанное = pending
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
    // обе остановки пункта показывают общий прогресс пункта
    expect(screen.getByTestId("quest-frac-podcasts-1")).toHaveTextContent("1/2");
    expect(screen.getByTestId("quest-frac-podcasts-2")).toHaveTextContent("1/2");
    // пункта нет в данных — target выводится из числа его остановок на маршруте
    expect(screen.getByTestId("quest-frac-reading-1")).toHaveTextContent("0/2");
    expect(screen.getByTestId("quest-frac-stretch-1")).toHaveTextContent("0/1");
  });

  it("измеренные минуты вытесняют дробь у своей остановки", () => {
    render(
      <QuestMap items={[item("journal", 1, 1, undefined, 23)]} monsterDrunk={false} />,
    );
    expect(screen.getByTestId("quest-minutes-journal-1")).toHaveTextContent("23 мин");
    // дробь `1/1` у бинарного пункта не сообщает ничего сверх кольца — её место и занимаем
    expect(screen.queryByTestId("quest-frac-journal-1")).not.toBeInTheDocument();
    // соседние пункты не измеряются — у них дробь на месте
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
    // Празднование живёт классом маршрута, а не цифрой: итога на карте больше нет.
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
    // Регрессионный якорь полярности: выпитый монстр закрывал детур как «сделано» —
    // кольцо и тропа красились как достижение, хотя достижением был чистый день.
    const { rerender } = render(<QuestMap items={[]} monsterDrunk={true} />);
    let stop = screen.getByTestId("quest-stop-monster");
    expect(stop.getAttribute("class")).toContain("quest-stop--drunk");
    expect(stop.getAttribute("class")).not.toContain("quest-stop--done");

    rerender(<QuestMap items={[]} monsterDrunk={false} />);
    stop = screen.getByTestId("quest-stop-monster");
    expect(stop.getAttribute("class")).toContain("quest-stop--clean");
    // «Не пил» — это не «ещё не дошёл»: серым пунктиром незакрытого пункта не рисуем.
    expect(stop.getAttribute("class")).not.toContain("quest-stop--pending");
  });

  it("к монстру не ведёт тропа: он стоит отдельно от маршрута, без стрелки", () => {
    // Решение владельца: детур-ответвление снято совсем. Любая тропа к монстру говорила о
    // нём как об этапе дня («сходил туда»), а раскрасить её было нечем — «пройденная»
    // хвалила за выпитое, «непройденная» ругала за чистый день.
    const { rerender } = render(<QuestMap items={[]} monsterDrunk={true} />);
    expect(screen.queryByTestId("quest-seg-monster")).toBeNull();

    rerender(<QuestMap items={[]} monsterDrunk={false} />);
    expect(screen.queryByTestId("quest-seg-monster")).toBeNull();
    // Сегментов ровно столько, сколько промежутков между 7 остановками маршрута.
    expect(document.querySelectorAll(".quest-seg")).toHaveLength(6);
  });

  it("дроби «1/1» у монстра нет: она читалась как закрытый пункт, а вердикт словами точнее", () => {
    render(<QuestMap items={[]} monsterDrunk={true} />);
    expect(screen.queryByTestId("quest-frac-monster")).toBeNull();
  });

  it("нет данных за день — монстр серый, как любая незакрытая остановка, и без вердикта", () => {
    render(<QuestMap items={[]} monsterDrunk={null} />);
    // Подпись — просто «монстр», никакого глагола: отсутствие записи не выдаём за чистый день.
    expect(screen.getByTestId("quest-monster-verdict")).toHaveTextContent(/^монстр$/);
    expect(screen.queryByTestId("quest-monster-verb")).toBeNull();
    // Картинка — ровно как у остальных незакрытых пунктов маршрута.
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
    // Раньше про чистый день карта молчала, и для скринридера «не пил» было неотличимо
    // от «данных нет».
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
    // подкасты: серия ≥1 семь дней, ≥2 три дня → у остановки 1 огонёк 7, у остановки 2 — 3
    render(<QuestMap items={[item("podcasts", 2, 2, [7, 3])]} monsterDrunk={false} />);
    expect(screen.getByTestId("quest-streak-podcasts-1")).toHaveTextContent("7");
    expect(screen.getByTestId("quest-streak-podcasts-2")).toHaveTextContent("3");
    // тултип поясняет С ЧЕМ и сколько дней подряд (нативный SVG <title> = accessible-имя)
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
    // серия 1 — прячем
    expect(screen.queryByTestId("quest-streak-stretch-1")).toBeNull();
    // occurrenceStreaks нет вовсе (старый ответ/фикстура) — тоже прячем, без падения
    expect(screen.queryByTestId("quest-streak-journal-1")).toBeNull();
  });

  it("огонёк-стрик монстра: «дней чисто» от 2, иначе скрыт", () => {
    const { rerender } = render(
      <QuestMap items={[]} monsterDrunk={false} monsterCleanStreak={12} />,
    );
    expect(screen.getByTestId("quest-streak-monster")).toHaveTextContent("12");
    // Формулировка та же, что в подписи детура и в сводке календаря — один словарь на факт.
    expect(screen.getByTestId("quest-streak-monster")).toHaveAttribute(
      "aria-label",
      "не пил монстр: 12 дней подряд",
    );
    // Огонёк «чисто» горит зелёным — тем же цветом, что и вердикт под ним.
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
    dayMinutes = listened,
    startedAt = "2026-08-13T06:12:00Z",
  ) => ({
    episodeName: name,
    episodeUrl: `https://open.spotify.com/episode/${name}`,
    showName: `шоу ${name}`,
    showUrl: `https://open.spotify.com/show/${name}`,
    imageUrl: "https://i.scdn.co/image/cover.jpg",
    startedAt,
    listenedMinutes: listened,
    dayMinutes,
    durationMinutes: duration,
  });

  const withEpisodes = (episodes: ReturnType<typeof episode>[]): DisciplineItemView[] => [
    { key: "podcasts", label: "подкаст", icon: null, count: 2, target: 2, episodes },
  ];

  it("вешает по карточке на остановку и подписывает эпизод, шоу и время", () => {
    render(<QuestMap items={withEpisodes([episode("Утро", 47)])} monsterDrunk={false} />);

    expect(screen.getByText("Утро")).toBeInTheDocument();
    expect(screen.getByText("шоу Утро")).toBeInTheDocument();
    // Время начала стоит и у единственного захода: «когда я это слушал» — вопрос сам по себе.
    expect(screen.getByText("09:12 · 47 из 48 мин")).toBeInTheDocument();
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

  it("эпизод, взятый двумя заходами, различает карточки временем и минутами захода", () => {
    // 80 минут одного эпизода: утром 45, вечером 35. Оба кружка рассказывают своё, а строкой
    // ниже каждый возвращает то, что теряется от разложения, — сколько пройдено за день.
    render(
      <QuestMap
        items={withEpisodes([
          episode("Ошибки", 45, 85, 80, "2026-08-13T06:12:00Z"),
          episode("Ошибки", 35, 85, 80, "2026-08-13T16:40:00Z"),
        ])}
        monsterDrunk={false}
      />,
    );

    expect(screen.getAllByTestId("quest-card")).toHaveLength(2);
    expect(screen.getByText("09:12 · 45 мин")).toBeInTheDocument();
    expect(screen.getByText("19:40 · 35 мин")).toBeInTheDocument();
    expect(screen.getAllByText("80 из 85 мин за день")).toHaveLength(2);
    // И под самими кружками — минуты своего захода, а не все 80 под первым.
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

    // В SVG нет z-index: кто нарисован позже, тот и сверху. Монстр идёт после остановок, и
    // внутри своей остановки карточку перекрывал именно он.
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

    // Остановки подкаста стоят на y=45 (верхний ряд) и y=160 (нижний). Сверху у первой места
    // нет — карточка вылезала бы за viewBox и её срезало бы краем карты и датой в шапке.
    const [first, second] = screen.getAllByTestId("quest-card").map((card) =>
      Number(card.querySelector("foreignObject")?.getAttribute("y")),
    );

    expect(first).toBeGreaterThan(45);
    expect(second).toBeLessThan(160);
    // И обе — внутри viewBox по вертикали.
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
    // Сумма за сутки под кружками не показывается — она спорила бы с карточкой над ней.
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

    // «12 мин» под незакрытым кружком отвечает, почему порог не взят.
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
});

/**
 * Указатель мыши. React синтезирует `onPointerEnter` из всплывающего `pointerover`, поэтому
 * наведение шлём именно им; `pointerType` в jsdom нет вовсе (PointerEvent не реализован), и
 * компонент трактует его отсутствие как мышь.
 */
function hover(el: Element) {
  fireEvent.pointerOver(el);
}
function unhover(el: Element) {
  fireEvent.pointerOut(el, { relatedTarget: document.body });
}
/** Тап пальцем: `fireEvent` теряет `pointerType` (нет PointerEvent) — доклеиваем его руками. */
function tap(el: Element) {
  const ev = new Event("pointerdown", { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "pointerType", { value: "touch" });
  fireEvent(el, ev);
}
const isOpen = (card: Element) => card.getAttribute("class")?.includes("quest-card--open") ?? false;

describe("QuestMap — превью обложки у остановки подкаста", () => {
  const episode = (name: string) => ({
    episodeName: name,
    episodeUrl: `https://open.spotify.com/episode/${name}`,
    showName: `шоу ${name}`,
    showUrl: `https://open.spotify.com/show/${name}`,
    imageUrl: "https://i.scdn.co/image/cover.jpg",
    startedAt: "2026-08-13T06:12:00Z",
    listenedMinutes: 40,
    dayMinutes: 40,
    durationMinutes: 48,
  });
  const withEpisodes = (episodes: ReturnType<typeof episode>[]): DisciplineItemView[] => [
    { key: "podcasts", label: "подкаст", icon: null, count: 2, target: 2, episodes },
  ];

  it("превью появляется ровно там, где есть что показать в карточке", () => {
    const { rerender } = render(
      <QuestMap items={withEpisodes([episode("Утро")])} monsterDrunk={false} />,
    );
    expect(screen.getByTestId("quest-preview-podcasts-1")).toBeInTheDocument();
    // Второй остановке эпизода не досталось — карточки нет, и превью тоже.
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

    // Остановка подкаста №1 стоит в (140, 45), радиус диска 17.
    const [cx, cy] = [140, 45];
    // Тело превью — выше и левее центра остановки.
    expect(x + size).toBeLessThan(cx);
    expect(y + size).toBeLessThan(cy);
    // Нижний-правый угол при этом уходит ПОД диск, а не касается его снаружи.
    expect(Math.hypot(cx - (x + size), cy - (y + size))).toBeLessThan(17);
    // И целиком внутри viewBox.
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

    // Остановка — переключатель линзы календаря; проход указателя по маршруту карточку не зовёт.
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
      // Закрытие отложено: указателю надо успеть доехать до карточки со ссылками.
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

    // первая остановка того же ПУНКТА — отдельная линза, не подсвечена
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
 * Обложки книг у остановок чтения (§5.16). Механика общая с подкастами, поэтому здесь только
 * то, чем чтение от них ОТЛИЧАЕТСЯ: стороны у двух остановок разные, а карточка рассказывает
 * про пройденный кусок книги, а не про длительность эпизода.
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
    // Второй остановке сессии не досталось — карточки нет, и превью тоже.
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

    // Слева: правый край картинки не заходит правее центра диска. Справа — зеркально.
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
    // Потолок общий с карточкой подкаста: габариты двух пунктов расходиться не должны.
    expect(long).toBe(214);
  });

  it("карточка рассказывает книгу и пройденный кусок, но не часы", () => {
    render(<QuestMap items={withBooks([book("Хребты безумия")])} monsterDrunk={false} />);

    expect(screen.getByTestId("quest-book-title-1")).toHaveTextContent("Хребты безумия");
    expect(screen.getByText("35% → 42%")).toBeInTheDocument();
    // Часов у чтения нет ни в каком виде: единственное известное нам время — момент синка
    // полки, то есть конец захода с непредсказуемым лагом (см. `readingCard.ts`).
    expect(screen.queryByText(/19:04/)).toBeNull();
    expect(screen.queryByText(/·/)).toBeNull();
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

    // Иначе подпись спорила бы с карточкой прямо над ней (та же оговорка, что у подкастов).
    expect(screen.getByText("32 мин")).toBeInTheDocument();
    expect(screen.getByText("26 мин")).toBeInTheDocument();
    expect(screen.queryByText("58 мин")).toBeNull();
  });
});
