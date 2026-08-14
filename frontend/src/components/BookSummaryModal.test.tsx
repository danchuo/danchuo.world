import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReadingBookView, ReadingSummaryView } from "@/lib/api/types";

// Пересказ окно тянет с бэка лениво (`getReadingSummary`) — мокаем клиент.
const getReadingSummary = vi.fn<() => Promise<ReadingSummaryView>>(() =>
  Promise.resolve({
    bullets: ["Пауль уходит в пустыню.", "Появляется червь."],
    takeaway: "глава про то, как герой становится своим среди чужих.",
  }),
);
vi.mock("@/lib/api/client", () => ({
  getReadingSummary: () => getReadingSummary(),
}));

import { BookSummaryModal } from "./BookSummaryModal";

/**
 * Окно «что было в этом куске» (PRD §5.16).
 *
 * Проверяем то, ради чего оно существует и чем отличается от соседних модалок:
 * - **шапка и проценты видны сразу**, ещё до того как приедет текст: они у карточки уже есть,
 *   и держать окно пустым ради загрузки нечего (DESIGN §7);
 * - **пункты и итог** приезжают и рисуются раздельно — итог не шестой пункт;
 * - **сбой не притворяется пересказом**: не собралось — так и написано;
 * - закрытие по `Esc` — общий контур модалок борда.
 */
describe("BookSummaryModal", () => {
  const book = (patch: Partial<ReadingBookView> = {}): ReadingBookView => ({
    title: "Дюна",
    author: "Фрэнк Герберт",
    coverUrl: "/api/reading/cover/7",
    startedAt: "2026-08-13T16:04:00Z",
    readMinutes: 32,
    startPercent: 0.48,
    endPercent: 0.53,
    sessionId: 7,
    hasSummary: true,
    ...patch,
  });

  it("книга и пройденный кусок видны сразу, не дожидаясь текста", () => {
    render(<BookSummaryModal book={book()} onClose={() => {}} />);

    expect(screen.getByText("Дюна")).toBeInTheDocument();
    expect(screen.getByText("Фрэнк Герберт")).toBeInTheDocument();
    expect(screen.getByTestId("book-summary-progress")).toHaveTextContent("48% → 53%");
  });

  it("пункты приезжают списком, а итог — отдельной строкой", async () => {
    render(<BookSummaryModal book={book()} onClose={() => {}} />);

    expect(await screen.findByText("Пауль уходит в пустыню.")).toBeInTheDocument();
    expect(screen.getByText("Появляется червь.")).toBeInTheDocument();
    expect(screen.getByTestId("book-summary-takeaway")).toHaveTextContent(
      "глава про то, как герой становится своим среди чужих.",
    );
  });

  it("не собравшийся пересказ так и говорит, а не молчит пустотой", async () => {
    getReadingSummary.mockRejectedValueOnce(new Error("500"));

    render(<BookSummaryModal book={book()} onClose={() => {}} />);

    expect(await screen.findByText("пересказ не собрался")).toBeInTheDocument();
  });

  it("ответ без пунктов не роняет окно, а читается как «не собрался»", async () => {
    // Так native-образ отдавал ответ, у которого DTO не помечен @RegisterForReflection:
    // код 200, тело `{}`. Прежняя версия шла в `bullets.map` и валила клиентским исключением
    // ВЕСЬ борд — Next уносит страницу в error-экран, а не только это окно.
    getReadingSummary.mockResolvedValueOnce({} as never);

    render(<BookSummaryModal book={book()} onClose={() => {}} />);

    expect(await screen.findByText("пересказ не собрался")).toBeInTheDocument();
    // Шапка на месте: окно живо, а не заменено экраном ошибки.
    expect(screen.getByText("Дюна")).toBeInTheDocument();
  });

  it("пустые и битые пункты отсеиваются, а не рисуются пустыми строками", async () => {
    getReadingSummary.mockResolvedValueOnce({
      bullets: ["  ", "Живой пункт.", null, 42],
      takeaway: "   ",
    } as never);

    render(<BookSummaryModal book={book()} onClose={() => {}} />);

    expect(await screen.findByText("Живой пункт.")).toBeInTheDocument();
    expect(screen.queryByTestId("book-summary-takeaway")).toBeNull();
  });

  it("закрывается по Esc", async () => {
    const onClose = vi.fn();
    render(<BookSummaryModal book={book()} onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
