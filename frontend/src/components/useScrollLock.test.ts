import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useScrollLock } from "./useScrollLock";

const root = () => document.documentElement;

describe("useScrollLock — the page stays put under an overlay", () => {
  afterEach(() => {
    root().removeAttribute("data-scroll-locked");
  });

  it("locks the page while active and releases it on close", () => {
    const { rerender, unmount } = renderHook(({ on }) => useScrollLock(on), { initialProps: { on: true } });
    expect(root()).toHaveAttribute("data-scroll-locked");

    rerender({ on: false });
    expect(root()).not.toHaveAttribute("data-scroll-locked");
    unmount();
  });

  it("a nested overlay closing does not unlock the one still open under it", () => {
    const outer = renderHook(() => useScrollLock(true));
    const inner = renderHook(() => useScrollLock(true));

    inner.unmount();
    expect(root()).toHaveAttribute("data-scroll-locked");
    outer.unmount();
    expect(root()).not.toHaveAttribute("data-scroll-locked");
  });

  it("an inactive lock touches nothing", () => {
    renderHook(() => useScrollLock(false));
    expect(root()).not.toHaveAttribute("data-scroll-locked");
  });
});
