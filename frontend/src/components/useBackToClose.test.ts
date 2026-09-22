import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBackToClose } from "./useBackToClose";

/** The system Back: the browser drops the top entry and returns the state of the one below. */
function pressBack(state: unknown) {
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate", { state }));
  });
}

let back: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // The page history is reset to a clean slate: the tests put their own entries in it.
  window.history.replaceState(null, "");
  // `back` is stubbed: a real step back in jsdom is asynchronous and would send its own `popstate`
  // over the one the test uses to play the button press.
  back = vi.spyOn(window.history, "back").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "");
});

describe("useBackToClose — the system Back closes the pop-up instead of leaving the site", () => {
  it("an open window puts its own entry into the history", () => {
    // This entry is the whole point: without it Back on Android leaves the site, because the
    // browser has nothing to close — the modal never entered the history.
    renderHook(() => useBackToClose(true, () => {}));

    expect(window.history.state).toMatchObject({ danchuoOverlay: 1 });
  });

  it("Back closes the window", () => {
    const onClose = vi.fn();
    renderHook(() => useBackToClose(true, onClose));

    pressBack(null);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closed with the cross — we remove our own history entry ourselves", () => {
    // Otherwise the entry hangs around and the first Back after closing is an empty step: the
    // viewer presses the button and nothing on screen changes.
    const { unmount } = renderHook(() => useBackToClose(true, () => {}));

    unmount();

    expect(back).toHaveBeenCalledTimes(1);
  });

  it("closed with Back itself — no second step back", () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useBackToClose(true, onClose));

    pressBack(null);
    unmount(); // the overlay closed in response to popstate — its history entry is already gone

    expect(back).not.toHaveBeenCalled();
  });

  it("layers close one at a time: Back closes the top one, the lower stays", () => {
    // A fullscreen frame over a drop gallery is exactly this case (§7.5): the first Back returns
    // to the frame grid, the second closes the gallery itself.
    const closeBottom = vi.fn();
    const closeTop = vi.fn();
    renderHook(() => useBackToClose(true, closeBottom));
    renderHook(() => useBackToClose(true, closeTop));

    pressBack({ danchuoOverlay: 1 });

    expect(closeTop).toHaveBeenCalledTimes(1);
    expect(closeBottom).not.toHaveBeenCalled();
  });

  it("closing the top layer with the cross does not close the one below", () => {
    // The top layer removes its own entry (`history.back`), and the `popstate` that follows must
    // not be read by the lower layer as "Back was pressed".
    const closeBottom = vi.fn();
    renderHook(() => useBackToClose(true, closeBottom));
    const top = renderHook(() => useBackToClose(true, () => {}));

    top.unmount();
    pressBack({ danchuoOverlay: 1 }); // the browser's answer to our own history.back()

    expect(closeBottom).not.toHaveBeenCalled();
  });

  it("the window is not open — we do not touch the history at all", () => {
    renderHook(() => useBackToClose(false, () => {}));

    expect(window.history.state).toBeNull();
    expect(back).not.toHaveBeenCalled();
  });

  it("the window did not open at once (a nested layer) — the entry appears at that moment", () => {
    const { rerender } = renderHook(({ open }) => useBackToClose(open, () => {}), {
      initialProps: { open: false },
    });
    expect(window.history.state).toBeNull();

    rerender({ open: true });

    expect(window.history.state).toMatchObject({ danchuoOverlay: 1 });
  });

  it("other history state fields are kept — the router puts its own there", () => {
    window.history.replaceState({ __NA: true, key: "abc" }, "");

    renderHook(() => useBackToClose(true, () => {}));

    expect(window.history.state).toMatchObject({ __NA: true, key: "abc", danchuoOverlay: 1 });
  });
});
