// @vitest-environment jsdom
// The `logic` project runs in node (vitest.config.ts), but the gate lives in the document: there
// is no way to check it without a DOM, so the environment is overridden for this one file.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FONT_GATE_SCRIPT, FONT_GATE_TIMEOUT_MS, onFontsReady } from "./fontGate";

/** Execute exactly the line that goes into `<head>`. */
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
  /** While the document parses, `document.fonts` is empty — no file has been requested yet. */
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

    // The promise is already settled — had the gate subscribed at once, it would have opened.
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
    // The stub is removed here rather than after the assertions: a failing test would otherwise
    // leave it for its neighbours in the file.
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
