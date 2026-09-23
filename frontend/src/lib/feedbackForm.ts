/** The note form's pure part: its questions, when it may be sent, and what a refusal reads as. */

/** Answer limits, equal to `FeedbackLimits` on the server — the form must refuse before the API. */
export const ANSWER_MAX = 2000;
export const SIGNATURE_MAX = 120;

/** The three questions, in asking order. The key is the field the answer travels in. */
export const FEEDBACK_QUESTIONS = [
  { key: "likedMost", question: "что здесь понравилось больше всего?" },
  { key: "wouldChange", question: "что бы ты поменял первым?" },
  {
    key: "missingBlock",
    question: "если бы это был дашборд про тебя, какой блок ты бы обязательно добавил?",
  },
] as const;

export type AnswerKey = (typeof FEEDBACK_QUESTIONS)[number]["key"];

export type Answers = Record<AnswerKey, string>;

export const EMPTY_ANSWERS: Answers = { likedMost: "", wouldChange: "", missingBlock: "" };

/** Whitespace, format characters (zero-width, BOM) and the blank-looking fillers `trim()` keeps. */
const INVISIBLE = /[\s\p{Cf}ᅟᅠ⠀ㅤﾠ]/gu;

/** One answer with a visible character is the whole bar: a signature alone is not a note. PRD §5.19. */
export function canSubmit(answers: Answers): boolean {
  return Object.values(answers).some((value) => value.replace(INVISIBLE, "").length > 0);
}

/**
 * A server refusal as a line for the visitor. The default is deliberately not "unknown error":
 * whoever wrote a note cares whether it arrived, not which code came back. PRD §5.19.
 */
export function feedbackErrorText(code: string, field?: string): string {
  switch (code) {
    case "empty":
      return "напиши хотя бы один ответ — иначе нечего отправлять";
    case "too_long":
      return field === "signature"
        ? `подпись длиннее ${SIGNATURE_MAX} символов`
        : `ответ длиннее ${ANSWER_MAX} символов`;
    case "rate_limited":
      return "слишком часто — попробуй через несколько минут";
    case "missing_field":
      return "что-то пошло не так со страницей — обнови её и попробуй снова";
    default:
      return "не долетело. попробуй ещё раз";
  }
}
