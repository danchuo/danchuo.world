import { describe, expect, it } from "vitest";
import {
  ANSWER_MAX,
  canSubmit,
  EMPTY_ANSWERS,
  FEEDBACK_QUESTIONS,
  feedbackErrorText,
  SIGNATURE_MAX,
} from "./feedbackForm";

describe("note form", () => {
  it("an empty form is not sent, one answer is enough", () => {
    expect(canSubmit(EMPTY_ANSWERS)).toBe(false);
    expect(canSubmit({ ...EMPTY_ANSWERS, wouldChange: "   " })).toBe(false);
    expect(canSubmit({ ...EMPTY_ANSWERS, wouldChange: "календарь" })).toBe(true);
  });

  it("each question has its own key and the keys are unique", () => {
    const keys = FEEDBACK_QUESTIONS.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
    // The keys are the API's field names: a rename here silently drops the answer on the server.
    expect(keys).toEqual(["likedMost", "wouldChange", "missingBlock"]);
  });

  it("a server rejection becomes a human-readable line", () => {
    expect(feedbackErrorText("empty")).toMatch(/хотя бы один/);
    expect(feedbackErrorText("rate_limited")).toMatch(/слишком часто/);
    expect(feedbackErrorText("too_long", "signature")).toContain(String(SIGNATURE_MAX));
    expect(feedbackErrorText("too_long", "likedMost")).toContain(String(ANSWER_MAX));
  });

  it("an unknown code does not show the code to the visitor", () => {
    const text = feedbackErrorText("http_502");
    expect(text).not.toMatch(/502|unknown/);
    expect(text).toMatch(/не долетело/);
  });
});
