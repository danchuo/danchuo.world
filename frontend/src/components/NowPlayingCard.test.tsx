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
   * The load-bearing case: Spotify's CDN is unreachable and the connection simply HANGS. The
   * browser reports no error, `onerror` never arrives, and the cover's place stayed empty instead
   * of showing the placeholder.
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
   * The wait threshold is THREE seconds: it answers not "how long does a picture take" but "after
   * what does empty space read worse than a placeholder", and eight seconds of a hole in the
   * widget was long enough to read as breakage.
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
