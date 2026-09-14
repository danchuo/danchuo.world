// @vitest-environment jsdom
// Проекту `logic` положено окружение node (vitest.config.ts), но ворота живут в документе:
// проверять их без DOM нечем, поэтому окружение переопределено для одного файла.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FONT_GATE_SCRIPT, FONT_GATE_TIMEOUT_MS } from "./fontGate";

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
