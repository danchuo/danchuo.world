import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FeedbackError } from "@/lib/api/client";
import { FeedbackModal } from "./FeedbackModal";

const postFeedback = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  postFeedback,
}));

const LIKED = "что здесь понравилось больше всего?";
const CHANGED = "что бы ты поменял первым?";

function open() {
  render(<FeedbackModal waveKey="wave-01" selectedDay="2026-09-21" onClose={() => {}} />);
}

/** Expands a question card and types into the textarea it becomes. */
function answer(question: string, text: string) {
  fireEvent.click(screen.getByRole("button", { name: question }));
  fireEvent.change(screen.getByLabelText(question), { target: { value: text } });
}

describe("FeedbackModal — записка автору (§5.19)", () => {
  beforeEach(() => {
    postFeedback.mockReset();
    postFeedback.mockResolvedValue(undefined);
  });

  it("вопросы сначала свёрнуты в карточки, по клику разворачиваются в поле", () => {
    open();
    expect(screen.getByRole("button", { name: LIKED })).toBeInTheDocument();
    expect(screen.queryByLabelText(LIKED)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: LIKED }));
    expect(screen.getByLabelText(LIKED)).toBeInTheDocument();
  });

  it("заполненная карточка остаётся развёрнутой, даже когда открыли другую", () => {
    open();
    answer(LIKED, "календарь");
    fireEvent.click(screen.getByRole("button", { name: CHANGED }));

    // Opening a second card must not swallow the first answer out of sight.
    expect(screen.getByLabelText(LIKED)).toHaveValue("календарь");
    expect(screen.getByLabelText(CHANGED)).toBeInTheDocument();
  });

  it("без единого ответа отправка заблокирована, с одним — доступна", () => {
    open();
    const send = screen.getByRole("button", { name: "отправить" });
    expect(send).toBeDisabled();

    answer(LIKED, "  ");
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByLabelText(LIKED), { target: { value: "календарь" } });
    expect(send).toBeEnabled();
  });

  it("отправляет ответы вместе с состоянием борда и пустой ловушкой", async () => {
    open();
    answer(CHANGED, "цвета");
    fireEvent.click(screen.getByRole("button", { name: "отправить" }));

    await waitFor(() => expect(postFeedback).toHaveBeenCalledTimes(1));
    const payload = postFeedback.mock.calls[0][0];
    expect(payload).toMatchObject({
      wouldChange: "цвета",
      waveKey: "wave-01",
      selectedDay: "2026-09-21",
      website: "",
    });
  });

  it("после успеха форма сменяется подтверждением", async () => {
    open();
    answer(LIKED, "всё");
    fireEvent.click(screen.getByRole("button", { name: "отправить" }));

    expect(await screen.findByText("долетело. спасибо!")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "отправить" })).not.toBeInTheDocument();
  });

  it("ошибка показывается внутри формы и НЕ стирает введённое", async () => {
    postFeedback.mockRejectedValue(new FeedbackError("rate_limited"));
    open();
    answer(LIKED, "очень длинный ответ про календарь");
    fireEvent.click(screen.getByRole("button", { name: "отправить" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/слишком часто/);
    expect(screen.getByLabelText(LIKED)).toHaveValue("очень длинный ответ про календарь");
    expect(screen.getByRole("button", { name: "отправить" })).toBeEnabled();
  });

  it("ловушка для ботов скрыта от скринридеров, но есть в DOM", () => {
    open();
    // aria-hidden keeps it out of the accessibility tree; a DOM-walking bot still finds it.
    const trap = document.querySelector(".feedback-modal__trap");
    expect(trap).toHaveAttribute("aria-hidden");
    expect(trap?.querySelector("input")).toBeTruthy();
  });
});
