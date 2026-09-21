import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom fetches no pictures at all, so `decode()` settles NEVER rather than either way, and a tile
// that waits for its bitmap (`useImageReady`) would hang on a promise no browser leaves pending.
HTMLImageElement.prototype.decode = () => Promise.resolve();

// jsdom ships no `PointerEvent`, so a fired pointer event arrives as a bare `Event` and loses
// `pointerType` — a component that tells a mouse from a finger then sees neither.
if (typeof window.PointerEvent === "undefined") {
  class JsdomPointerEvent extends MouseEvent {
    readonly pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? "";
    }
  }
  window.PointerEvent = JsdomPointerEvent as unknown as typeof PointerEvent;
}

// Размонтируем дерево между тестами — изоляция DOM. Чистим localStorage, чтобы кэш тайлов
// (stale-while-revalidate) одного теста не подменял пустое/ошибочное состояние в другом.
afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    /* без jsdom-localStorage — ничего чистить */
  }
});
