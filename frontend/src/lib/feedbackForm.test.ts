import { describe, expect, it } from "vitest";
import {
  ANSWER_MAX,
  canSubmit,
  EMPTY_ANSWERS,
  FEEDBACK_QUESTIONS,
  feedbackErrorText,
  SIGNATURE_MAX,
} from "./feedbackForm";

describe("форма записки", () => {
  it("пустая форма не отправляется, одного ответа достаточно", () => {
    expect(canSubmit(EMPTY_ANSWERS)).toBe(false);
    expect(canSubmit({ ...EMPTY_ANSWERS, wouldChange: "   " })).toBe(false);
    expect(canSubmit({ ...EMPTY_ANSWERS, wouldChange: "календарь" })).toBe(true);
  });

  it("у каждого вопроса свой ключ и ключи уникальны", () => {
    const keys = FEEDBACK_QUESTIONS.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
    // The keys are the API's field names: a rename here silently drops the answer on the server.
    expect(keys).toEqual(["likedMost", "wouldChange", "missingBlock"]);
  });

  it("отказ сервера превращается в человеческую строку", () => {
    expect(feedbackErrorText("empty")).toMatch(/хотя бы один/);
    expect(feedbackErrorText("rate_limited")).toMatch(/слишком часто/);
    expect(feedbackErrorText("too_long", "signature")).toContain(String(SIGNATURE_MAX));
    expect(feedbackErrorText("too_long", "likedMost")).toContain(String(ANSWER_MAX));
  });

  it("незнакомый код не показывает посетителю код", () => {
    const text = feedbackErrorText("http_502");
    expect(text).not.toMatch(/502|unknown/);
    expect(text).toMatch(/не долетело/);
  });
});
