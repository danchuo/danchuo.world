import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SummaryView } from "@/lib/api/types";
import type { SummarySubject } from "@/lib/summarySubject";

// Пересказ окно тянет с бэка лениво (`getSummary`) — мокаем клиент.
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
 * Окно «что было в этом куске» (PRD §5.16.1).
 *
 * Проверяем то, ради чего оно существует и чем отличается от соседних модалок:
 * - **шапка и кусок видны сразу**, ещё до того как приедет текст: они у карточки уже есть,
 *   и держать окно пустым ради загрузки нечего (DESIGN §7);
 * - **пункты и итог** приезжают и рисуются раздельно — итог не шестой пункт;
 * - **сбой не притворяется пересказом**: не собралось — так и написано;
 * - **окно одно на книгу и на выпуск**: тот же контур, тот же запрос, отличается только вид
 *   в пути — иначе два похожих окна разошлись бы при первой правке одного из них;
 * - закрытие по `Esc` — общий контур модалок борда.
 */
describe("SummaryModal", () => {
  const book = (patch: Partial<SummarySubject> = {}): SummarySubject => ({
    kind: "reading",
    sessionId: 7,
    title: "Дюна",
    byline: "Фрэнк Герберт",
    coverUrl: "/api/reading/cover/7",
    portrait: true,
    progressCaption: "прочитано за этот заход",
    progressValue: "48% → 53%",
    ariaLabel: "Что было в прочитанном куске: Дюна",
    ...patch,
  });

  const episode = (): SummarySubject => book({
    kind: "podcast",
    sessionId: 42,
    title: "How Feelings Make Us Smarter",
    byline: "Hidden Brain",
    coverUrl: "https://i.scdn.co/image/abc",
    portrait: false,
    progressCaption: "прослушано за этот заход",
    progressValue: "35 из 48 мин",
    ariaLabel: "Что было в прослушанном куске: How Feelings Make Us Smarter",
  });

  it("предмет и пройденный кусок видны сразу, не дожидаясь текста", () => {
    render(<SummaryModal subject={book()} onClose={() => {}} />);

    expect(screen.getByText("Дюна")).toBeInTheDocument();
    expect(screen.getByText("Фрэнк Герберт")).toBeInTheDocument();
    expect(screen.getByTestId("summary-progress")).toHaveTextContent("48% → 53%");
  });

  it("пункты приезжают списком, а итог — отдельной строкой", async () => {
    render(<SummaryModal subject={book()} onClose={() => {}} />);

    expect(await screen.findByText("Пауль уходит в пустыню.")).toBeInTheDocument();
    expect(screen.getByText("Появляется червь.")).toBeInTheDocument();
    expect(screen.getByTestId("summary-takeaway")).toHaveTextContent(
      "глава про то, как герой становится своим среди чужих.",
    );
  });

  it("выпуск открывается тем же окном и спрашивает свой вид", async () => {
    requested.length = 0;

    render(<SummaryModal subject={episode()} onClose={() => {}} />);

    expect(screen.getByText("How Feelings Make Us Smarter")).toBeInTheDocument();
    expect(screen.getByText("Hidden Brain")).toBeInTheDocument();
    expect(screen.getByTestId("summary-progress")).toHaveTextContent("35 из 48 мин");
    expect(requested).toEqual([["podcast", 42]]);
    // Ответ читается так же — окно про предмет ничего не знает сверх шапки.
    expect(await screen.findByText("Пауль уходит в пустыню.")).toBeInTheDocument();
  });

  it("не собравшийся пересказ так и говорит, а не молчит пустотой", async () => {
    getSummary.mockRejectedValueOnce(new Error("500"));

    render(<SummaryModal subject={book()} onClose={() => {}} />);

    expect(await screen.findByText("пересказ не собрался")).toBeInTheDocument();
  });

  it("ответ без пунктов не роняет окно, а читается как «не собрался»", async () => {
    // Так native-образ отдавал ответ, у которого DTO не помечен @RegisterForReflection:
    // код 200, тело `{}`. Прежняя версия шла в `bullets.map` и валила клиентским исключением
    // ВЕСЬ борд — Next уносит страницу в error-экран, а не только это окно.
    getSummary.mockResolvedValueOnce({} as never);

    render(<SummaryModal subject={book()} onClose={() => {}} />);

    expect(await screen.findByText("пересказ не собрался")).toBeInTheDocument();
    // Шапка на месте: окно живо, а не заменено экраном ошибки.
    expect(screen.getByText("Дюна")).toBeInTheDocument();
  });

  it("пустые и битые пункты отсеиваются, а не рисуются пустыми строками", async () => {
    getSummary.mockResolvedValueOnce({
      bullets: ["  ", "Живой пункт.", null, 42],
      takeaway: "   ",
    } as never);

    render(<SummaryModal subject={book()} onClose={() => {}} />);

    expect(await screen.findByText("Живой пункт.")).toBeInTheDocument();
    expect(screen.queryByTestId("summary-takeaway")).toBeNull();
  });

  it("закрывается по Esc", async () => {
    const onClose = vi.fn();
    render(<SummaryModal subject={book()} onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
