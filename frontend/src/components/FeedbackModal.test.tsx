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

describe("FeedbackModal — a note to the author (§5.19)", () => {
  beforeEach(() => {
    postFeedback.mockReset();
    postFeedback.mockResolvedValue(undefined);
  });

  it("the questions start folded into cards and open into a field on click", () => {
    open();
    expect(screen.getByRole("button", { name: LIKED })).toBeInTheDocument();
    expect(screen.queryByLabelText(LIKED)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: LIKED }));
    expect(screen.getByLabelText(LIKED)).toBeInTheDocument();
  });

  it("a filled card stays open even when another one is opened", () => {
    open();
    answer(LIKED, "календарь");
    fireEvent.click(screen.getByRole("button", { name: CHANGED }));

    // Opening a second card must not swallow the first answer out of sight.
    expect(screen.getByLabelText(LIKED)).toHaveValue("календарь");
    expect(screen.getByLabelText(CHANGED)).toBeInTheDocument();
  });

  it("with no answer at all sending is blocked, with one it is allowed", () => {
    open();
    const send = screen.getByRole("button", { name: "отправить" });
    expect(send).toBeDisabled();

    answer(LIKED, "  ");
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByLabelText(LIKED), { target: { value: "календарь" } });
    expect(send).toBeEnabled();
  });

  it("sends the answers together with the board state and an empty trap", async () => {
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

  it("after success the form is replaced by a confirmation", async () => {
    open();
    answer(LIKED, "всё");
    fireEvent.click(screen.getByRole("button", { name: "отправить" }));

    expect(await screen.findByText("долетело. спасибо!")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "отправить" })).not.toBeInTheDocument();
  });

  it("the error is shown inside the form and does NOT erase the input", async () => {
    postFeedback.mockRejectedValue(new FeedbackError("rate_limited"));
    open();
    answer(LIKED, "очень длинный ответ про календарь");
    fireEvent.click(screen.getByRole("button", { name: "отправить" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/слишком часто/);
    expect(screen.getByLabelText(LIKED)).toHaveValue("очень длинный ответ про календарь");
    expect(screen.getByRole("button", { name: "отправить" })).toBeEnabled();
  });

  it("the bot trap is hidden from screen readers but present in the DOM", () => {
    open();
    // aria-hidden keeps it out of the accessibility tree; a DOM-walking bot still finds it.
    const trap = document.querySelector(".feedback-modal__trap");
    expect(trap).toHaveAttribute("aria-hidden");
    expect(trap?.querySelector("input")).toBeTruthy();
  });
});
