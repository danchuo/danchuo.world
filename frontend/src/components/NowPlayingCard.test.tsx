import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cover } from "./NowPlayingCard";

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const PLATE = <span data-testid="plate" />;

describe("Cover — обложка и её заглушка (§7.1)", () => {
  it("адреса нет вовсе ⇒ сразу заглушка", () => {
    const { queryByTestId, container } = render(<Cover url={null} alt="" fallback={PLATE} />);
    expect(queryByTestId("plate")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("картинка ответила ошибкой ⇒ заглушка, и плитке об этом сказано", () => {
    const onError = vi.fn();
    const { container, queryByTestId } = render(
      <Cover url="https://i.scdn.co/a.jpg" alt="" fallback={PLATE} onError={onError} />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(queryByTestId("plate")).toBeInTheDocument();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  /**
   * Несущий случай: CDN Spotify недоступен, соединение просто
   * ВИСИТ. Ошибки браузер не отдаёт, `onerror` не приходит никогда — и на месте обложки
   * оставалась пустота вместо заглушки. Ждём картинку не вечно.
   */
  it("картинка не приехала за отведённое время ⇒ та же заглушка, что и при ошибке", () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const { container, queryByTestId } = render(
      <Cover url="https://i.scdn.co/a.jpg" alt="" fallback={PLATE} onError={onError} />,
    );
    expect(queryByTestId("plate")).toBeNull();

    act(() => void vi.advanceTimersByTime(10_000));

    expect(queryByTestId("plate")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  /**
   * Порог ожидания — ТРИ секунды: он отвечает не на «сколько грузится картинка», а на «после
   * чего пустое место хуже заглушки», и восемь секунд дырки в виджете успевали прочитаться
   * поломкой.
   */
  it("порог ожидания — три секунды: до них ещё ждём, после них уже заглушка", () => {
    vi.useFakeTimers();
    const { queryByTestId } = render(<Cover url="https://i.scdn.co/a.jpg" alt="" fallback={PLATE} />);

    act(() => void vi.advanceTimersByTime(2_900));
    expect(queryByTestId("plate")).toBeNull();

    act(() => void vi.advanceTimersByTime(200));
    expect(queryByTestId("plate")).toBeInTheDocument();
  });

  it("картинка успела загрузиться ⇒ ожидание снимается, заглушка не подменяет её потом", () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const { container, queryByTestId } = render(
      <Cover url="https://i.scdn.co/a.jpg" alt="" fallback={PLATE} onError={onError} />,
    );
    fireEvent.load(container.querySelector("img")!);

    act(() => void vi.advanceTimersByTime(60_000));

    expect(container.querySelector("img")).toBeInTheDocument();
    expect(queryByTestId("plate")).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it("новый трек — новая попытка: ожидание считается для каждого адреса заново", () => {
    vi.useFakeTimers();
    const { container, queryByTestId, rerender } = render(
      <Cover url="https://i.scdn.co/a.jpg" alt="" fallback={PLATE} />,
    );
    act(() => void vi.advanceTimersByTime(10_000));
    expect(queryByTestId("plate")).toBeInTheDocument();

    rerender(<Cover url="https://i.scdn.co/b.jpg" alt="" fallback={PLATE} />);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://i.scdn.co/b.jpg");
  });
});
