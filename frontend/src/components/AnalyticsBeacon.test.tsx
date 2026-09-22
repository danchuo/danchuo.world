import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsBeacon } from "./AnalyticsBeacon";

vi.mock("@/lib/api/client", () => ({ postBeacon: vi.fn(), postInteractions: vi.fn() }));
import { postBeacon, postInteractions } from "@/lib/api/client";
const postBeaconMock = vi.mocked(postBeacon);
const postInteractionsMock = vi.mocked(postInteractions);

/** jsdom fixes visibilityState; the beacon's whole exit path hangs off changing it. */
function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

/** jsdom gives every element a zero-sized box, and a zero-sized tile takes no clicks. */
function tileWithBox(el: HTMLElement) {
  el.getBoundingClientRect = () =>
    ({ left: 100, top: 100, width: 200, height: 100, right: 300, bottom: 200, x: 100, y: 100 }) as DOMRect;
}

function clickAt(target: Element, clientX: number, clientY: number) {
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX, clientY }));
}

let now = 0;

beforeEach(() => {
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  setVisibility("visible");
  window.history.replaceState({}, "", "/");
  document.documentElement.dataset.wave = "wave-03";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("AnalyticsBeacon", () => {
  it("sends a load beacon on mount with the path, visitId and visit measurements", async () => {
    window.history.replaceState({}, "", "/?utm_source=telegram&utm_medium=post&utm_campaign=tg-1");
    render(<AnalyticsBeacon />);

    await waitFor(() => expect(postBeaconMock).toHaveBeenCalledTimes(1));
    const payload = postBeaconMock.mock.calls[0][0];
    expect(payload.path).toBe("/");
    expect(typeof payload.visitId).toBe("string");
    expect(payload.visitId.length).toBeGreaterThan(0);
    expect(payload.utmSource).toBe("telegram");
    expect(payload.utmMedium).toBe("post");
    expect(payload.utmCampaign).toBe("tg-1");
    expect(payload.waveKey).toBe("wave-03");
    expect(payload.viewportW).toBe(window.innerWidth);
    expect(payload.viewportH).toBe(window.innerHeight);
  });

  it("does not track the admin", async () => {
    window.history.replaceState({}, "", "/admin");
    render(<AnalyticsBeacon />);
    await new Promise((r) => setTimeout(r, 0));
    expect(postBeaconMock).not.toHaveBeenCalled();
  });

  it("settles the time on EVERY exit, and the background does not get into it", async () => {
    render(<AnalyticsBeacon />);
    await waitFor(() => expect(postBeaconMock).toHaveBeenCalledTimes(1));

    now = 1000;
    setVisibility("hidden");
    expect(postBeaconMock).toHaveBeenCalledTimes(2);
    expect(postBeaconMock.mock.calls[1][0].dwellMs).toBe(1000);

    // Four seconds in the background must not accrue: engagement is foreground time.
    now = 5000;
    setVisibility("visible");
    now = 6000;
    setVisibility("hidden");

    expect(postBeaconMock).toHaveBeenCalledTimes(3);
    expect(postBeaconMock.mock.calls[2][0].dwellMs).toBe(2000);
  });

  it("sends only NEW clicks on each exit", async () => {
    const { container } = render(
      <div>
        <div data-tile-id="today">
          <span>внутри</span>
        </div>
        <AnalyticsBeacon />
      </div>,
    );
    const tile = container.querySelector<HTMLElement>("[data-tile-id]")!;
    tileWithBox(tile);
    await waitFor(() => expect(postBeaconMock).toHaveBeenCalledTimes(1));

    clickAt(tile.querySelector("span")!, 150, 150);
    setVisibility("hidden");
    expect(postInteractionsMock).toHaveBeenCalledTimes(1);
    expect(postInteractionsMock.mock.calls[0][0].clicks).toHaveLength(1);

    // A click after the first exit used to be lost forever: the flush was one-shot.
    setVisibility("visible");
    clickAt(tile, 200, 150);
    setVisibility("hidden");

    expect(postInteractionsMock).toHaveBeenCalledTimes(2);
    const second = postInteractionsMock.mock.calls[1][0].clicks;
    expect(second).toHaveLength(1);
    expect(second[0].offsetXPct).toBeCloseTo(0.5);
  });

  it("a click on a tile arrives as fractions INSIDE the tile", async () => {
    const { container } = render(
      <div>
        <div data-tile-id="music" />
        <AnalyticsBeacon />
      </div>,
    );
    const tile = container.querySelector<HTMLElement>("[data-tile-id]")!;
    tileWithBox(tile);
    await waitFor(() => expect(postBeaconMock).toHaveBeenCalledTimes(1));

    clickAt(tile, 150, 125);
    setVisibility("hidden");

    const click = postInteractionsMock.mock.calls[0][0].clicks[0];
    expect(click.tileId).toBe("music");
    expect(click.offsetXPct).toBeCloseTo(0.25);
    expect(click.offsetYPct).toBeCloseTo(0.25);
  });

  it("a click off the tiles goes out as fractions of the VIEWPORT", async () => {
    render(<AnalyticsBeacon />);
    await waitFor(() => expect(postBeaconMock).toHaveBeenCalledTimes(1));

    clickAt(document.body, window.innerWidth / 4, window.innerHeight / 2);
    setVisibility("hidden");

    const click = postInteractionsMock.mock.calls[0][0].clicks[0];
    expect(click.tileId).toBeNull();
    expect(click.offsetXPct).toBeCloseTo(0.25);
    expect(click.offsetYPct).toBeCloseTo(0.5);
  });
});
