import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBackToClose } from "./useBackToClose";

/** «Назад» системы: браузер снимает верхнюю запись и отдаёт состояние той, что под ней. */
function pressBack(state: unknown) {
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate", { state }));
  });
}

let back: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Историю страницы возвращаем к чистому листу: тесты кладут в неё свои записи.
  window.history.replaceState(null, "");
  // `back` подменяем: настоящий шаг назад в jsdom асинхронный и прислал бы свой `popstate`
  // поверх того, которым тест изображает нажатие кнопки.
  back = vi.spyOn(window.history, "back").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "");
});

describe("useBackToClose — системное «Назад» закрывает всплывшее окно, а не уводит с сайта", () => {
  it("открытое окно кладёт в историю свою запись", () => {
    // Ради этой записи всё и затевается: без неё «Назад» на андроиде уходит с сайта,
    // потому что закрывать браузеру нечего — модалка в историю не попадала.
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
    // Иначе запись остаётся висеть, и первое «Назад» после закрытия уходит в пустой шаг:
    // зритель жмёт кнопку, а на экране ничего не меняется.
    const { unmount } = renderHook(() => useBackToClose(true, () => {}));

    unmount();

    expect(back).toHaveBeenCalledTimes(1);
  });

  it("закрыли самим «Назад» — второго шага назад не делаем", () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useBackToClose(true, onClose));

    pressBack(null);
    unmount(); // окно закрылось в ответ на popstate — записи в истории уже нет

    expect(back).not.toHaveBeenCalled();
  });

  it("слои закрываются по одному: «Назад» гасит верхний, нижний остаётся", () => {
    // Кадр во весь экран поверх галереи дропа — ровно этот случай (§7.5): первое «Назад»
    // возвращает к сетке кадров, второе закрывает саму галерею.
    const closeBottom = vi.fn();
    const closeTop = vi.fn();
    renderHook(() => useBackToClose(true, closeBottom));
    renderHook(() => useBackToClose(true, closeTop));

    pressBack({ danchuoOverlay: 1 });

    expect(closeTop).toHaveBeenCalledTimes(1);
    expect(closeBottom).not.toHaveBeenCalled();
  });

  it("закрытие верхнего слоя крестиком не гасит нижний", () => {
    // Верхний слой снимает свою запись сам (`history.back`), и приходящий следом `popstate`
    // не должен читаться нижним слоем как «нажали Назад».
    const closeBottom = vi.fn();
    renderHook(() => useBackToClose(true, closeBottom));
    const top = renderHook(() => useBackToClose(true, () => {}));

    top.unmount();
    pressBack({ danchuoOverlay: 1 }); // ответ браузера на наш же history.back()

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
