import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBoxSize } from "./useBoxSize";

/**
 * A tile shows its content only once loaded (`TileShell`), so the measured node usually appears a
 * commit or two AFTER mount. The hook has to pick it up then, or the chart inside stays 0×0.
 */

/** jsdom has no ResizeObserver; this one reports whatever the test says the box is. */
class FakeResizeObserver {
  static boxes = new Map<Element, { width: number; height: number }>();
  static live = new Set<FakeResizeObserver>();
  constructor(private cb: ResizeObserverCallback) {
    FakeResizeObserver.live.add(this);
  }
  observe(el: Element) {
    const contentRect = FakeResizeObserver.boxes.get(el) ?? { width: 0, height: 0 };
    this.cb([{ contentRect } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {
    FakeResizeObserver.live.delete(this);
  }
}

/** The box shows up only once `ready` turns true — the shape `TileShell` gives every tile. */
function Late({ ready }: { ready: boolean }) {
  const [ref, { w, h }] = useBoxSize();
  return (
    <div>
      <span data-testid="size">{`${w}x${h}`}</span>
      {ready && (
        <div
          ref={(el) => {
            if (el) FakeResizeObserver.boxes.set(el, { width: 300, height: 120 });
            ref.current = el;
          }}
          data-testid="box"
        />
      )}
    </div>
  );
}

describe("useBoxSize", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeResizeObserver.boxes.clear();
    FakeResizeObserver.live.clear();
  });

  it("меряет узел, появившийся ПОСЛЕ монтирования — плитка отдаёт содержимое не сразу", () => {
    const { rerender } = render(<Late ready={false} />);
    expect(screen.getByTestId("size")).toHaveTextContent("0x0");

    rerender(<Late ready />);

    expect(screen.getByTestId("size")).toHaveTextContent("300x120");
  });

  it("узел тот же — наблюдателя не заводит заново", () => {
    const { rerender } = render(<Late ready />);
    const after = FakeResizeObserver.live.size;

    rerender(<Late ready />);
    rerender(<Late ready />);

    expect(FakeResizeObserver.live.size).toBe(after);
  });

  it("узел ушёл — наблюдатель отцеплен", () => {
    const { rerender } = render(<Late ready />);
    expect(FakeResizeObserver.live.size).toBe(1);

    rerender(<Late ready={false} />);

    expect(FakeResizeObserver.live.size).toBe(0);
  });
});
