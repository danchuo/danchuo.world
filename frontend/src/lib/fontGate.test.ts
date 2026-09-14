// @vitest-environment jsdom
// Проекту `logic` положено окружение node (vitest.config.ts), но ворота живут в документе:
// проверять их без DOM нечем, поэтому окружение переопределено для одного файла.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FONT_GATE_SCRIPT, FONT_GATE_TIMEOUT_MS, onFontsReady } from "./fontGate";

/** Исполняем ровно ту строку, что уезжает в `<head>`. */
function runGate() {
  // eslint-disable-next-line no-new-func
  new Function(FONT_GATE_SCRIPT)();
}

function withFonts(ready: Promise<unknown> | undefined) {
  Object.defineProperty(document, "fonts", { value: ready ? { ready } : undefined, configurable: true });
}

const state = () => document.documentElement.getAttribute("data-fonts");

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.removeAttribute("data-fonts");
});

describe("ворота шрифта", () => {
  it("закрываются сразу, до всякой загрузки", () => {
    withFonts(new Promise(() => {}));
    runGate();
    expect(state()).toBe("pending");
  });

  it("открываются, когда шрифты приехали", async () => {
    let settle = () => {};
    withFonts(new Promise<void>((res) => (settle = res)));
    runGate();

    settle();
    await vi.waitFor(() => expect(state()).toBe("ready"));
  });

  it("открываются по таймауту, если шрифты не приехали никогда", () => {
    withFonts(new Promise(() => {}));
    runGate();
    expect(state()).toBe("pending");

    vi.advanceTimersByTime(FONT_GATE_TIMEOUT_MS);
    expect(state()).toBe("ready");
  });

  it("открываются, если загрузка шрифтов сорвалась", async () => {
    withFonts(Promise.reject(new Error("нет сети")));
    runGate();

    await vi.waitFor(() => expect(state()).toBe("ready"));
  });

  it("открываются сразу там, где браузер не знает document.fonts", () => {
    withFonts(undefined);
    runGate();
    expect(state()).toBe("ready");
  });
});

describe("ворота ждут первой раскладки", () => {
  /** Пока документ парсится, `document.fonts` пуст — ни один файл ещё не запрошен. */
  function withReadyState(value: DocumentReadyState) {
    Object.defineProperty(document, "readyState", { value, configurable: true });
  }

  let onAfter: (() => void) | null = null;
  afterEach(() => {
    withReadyState("complete");
    onAfter?.();
    onAfter = null;
  });

  it("не открываются по готовности шрифтов, снятой до разметки", async () => {
    withReadyState("loading");
    withFonts(Promise.resolve());
    runGate();

    // Обещание уже выполнено — если бы ворота подписались сразу, они бы открылись.
    await Promise.resolve();
    await Promise.resolve();
    expect(state()).toBe("pending");
  });

  it("открываются, когда разметка доехала и шрифты вместе с ней", async () => {
    withReadyState("loading");
    withFonts(Promise.resolve());
    runGate();

    document.dispatchEvent(new Event("DOMContentLoaded"));
    await vi.waitFor(() => expect(state()).toBe("ready"));
  });

  it("выжимают раскладку до опроса шрифтов — без неё файлы не запрошены", async () => {
    let measured = 0;
    Object.defineProperty(document.body, "offsetHeight", {
      configurable: true,
      get: () => (measured += 1),
    });
    // Снимаем подмену здесь же, а не после проверок: упавший тест иначе оставил бы её
    // соседям по файлу.
    onAfter = () => delete (document.body as unknown as Record<string, unknown>).offsetHeight;
    withFonts(Promise.resolve());
    runGate();

    await vi.waitFor(() => expect(state()).toBe("ready"));
    expect(measured).toBeGreaterThan(0);
  });
});

describe("подписка на ворота", () => {
  it("зовёт сразу, когда ворота уже открыты", () => {
    document.documentElement.setAttribute("data-fonts", "ready");
    const run = vi.fn();
    onFontsReady(run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("зовёт сразу там, где ворот нет вовсе (JS выключен на первой отрисовке)", () => {
    const run = vi.fn();
    onFontsReady(run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("ждёт, пока ворота закрыты, и зовёт на открытии", async () => {
    vi.useRealTimers();
    document.documentElement.setAttribute("data-fonts", "pending");
    const run = vi.fn();
    onFontsReady(run);
    expect(run).not.toHaveBeenCalled();

    document.documentElement.setAttribute("data-fonts", "ready");
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });

  it("отписка гасит вызов", async () => {
    vi.useRealTimers();
    document.documentElement.setAttribute("data-fonts", "pending");
    const run = vi.fn();
    onFontsReady(run)();

    document.documentElement.setAttribute("data-fonts", "ready");
    await new Promise((r) => setTimeout(r, 10));
    expect(run).not.toHaveBeenCalled();
  });
});
