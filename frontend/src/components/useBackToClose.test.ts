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

describe("useBackToClose — системное «Назад» закрывает всплывшее окно, а не уводит с сайта", () => {
  it("открытое окно кладёт в историю свою запись", () => {
    // This entry is the whole point: without it Back on Android leaves the site, because the
    // browser has nothing to close — the modal never entered the history.
    renderHook(() => useBackToClose(true, () => {}));

    expect(window.history.state).toMatchObject({ danchuoOverlay: 1 });
  });

  it("«Назад» закрывает окно", () => {
    const onClose = vi.fn();
    renderHook(() => useBackToClose(true, onClose));

    pressBack(null);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("закрыли крестиком — свою запись из истории снимаем сами", () => {
    // Otherwise the entry hangs around and the first Back after closing is an empty step: the
    // viewer presses the button and nothing on screen changes.
    const { unmount } = renderHook(() => useBackToClose(true, () => {}));

    unmount();

    expect(back).toHaveBeenCalledTimes(1);
  });

  it("закрыли самим «Назад» — второго шага назад не делаем", () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useBackToClose(true, onClose));

    pressBack(null);
    unmount(); // the overlay closed in response to popstate — its history entry is already gone

    expect(back).not.toHaveBeenCalled();
  });

  it("слои закрываются по одному: «Назад» гасит верхний, нижний остаётся", () => {
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

  it("закрытие верхнего слоя крестиком не гасит нижний", () => {
    // The top layer removes its own entry (`history.back`), and the `popstate` that follows must
    // not be read by the lower layer as "Back was pressed".
    const closeBottom = vi.fn();
    renderHook(() => useBackToClose(true, closeBottom));
    const top = renderHook(() => useBackToClose(true, () => {}));

    top.unmount();
    pressBack({ danchuoOverlay: 1 }); // the browser's answer to our own history.back()

    expect(closeBottom).not.toHaveBeenCalled();
  });

  it("окно не открыто — в историю не лезем вовсе", () => {
    renderHook(() => useBackToClose(false, () => {}));

    expect(window.history.state).toBeNull();
    expect(back).not.toHaveBeenCalled();
  });

  it("окно открылось не сразу (вложенный слой) — запись появляется в этот момент", () => {
    const { rerender } = renderHook(({ open }) => useBackToClose(open, () => {}), {
      initialProps: { open: false },
    });
    expect(window.history.state).toBeNull();

    rerender({ open: true });

    expect(window.history.state).toMatchObject({ danchuoOverlay: 1 });
  });

  it("чужие поля состояния истории сохраняются — роутер кладёт туда своё", () => {
    window.history.replaceState({ __NA: true, key: "abc" }, "");

    renderHook(() => useBackToClose(true, () => {}));

    expect(window.history.state).toMatchObject({ __NA: true, key: "abc", danchuoOverlay: 1 });
  });
});
