import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RideMap } from "./RideMap";

/**
 * Framing the mini map (DESIGN §8.1). Zoom is "how many metres per pixel": fitted to one container
 * size, it keeps that scale as the container grows and simply shows more emptiness, so the points
 * converge. The contract is to refit on EVERY size change, not only on mount.
 */
const fitBounds = vi.fn();
const resize = vi.fn();
/** The options the map was built with: both the basemap choice and the gesture mode rest on them. */
const mapOptions = vi.fn();
const addControl = vi.fn();
/** The worker's address — without it the map parses no tiles at all, so it is under test too. */
const setWorkerUrl = vi.fn();

vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

vi.mock("maplibre-gl", () => {
  class Map {
    constructor(options: unknown) {
      mapOptions(options);
      // The real maplibre creates the provider attribution in the constructor and leaves it
      // EXPANDED, with links arriving as an HTML string from the style and no `target`. The mock
      // repeats exactly that — otherwise there would be nothing to check.
      const o = options as { container?: HTMLElement; attributionControl?: unknown };
      if (o.container && o.attributionControl) {
        const attrib = document.createElement("details");
        attrib.className = "maplibregl-ctrl maplibregl-ctrl-attrib maplibregl-compact maplibregl-compact-show";
        attrib.setAttribute("open", "");
        attrib.innerHTML =
          '<div class="maplibregl-ctrl-attrib-inner">' +
          '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' +
          "</div>";
        o.container.appendChild(attrib);
      }
    }
    fitBounds = fitBounds;
    resize = resize;
    addControl = addControl;
    addSource = () => {};
    addLayer = () => {};
    setLayoutProperty = () => {};
    getSource = () => undefined;
    remove = () => {};
    // The style does not load in tests, so `load` never fires: the layers and `onReady` live in
    // its handler, and everything this test checks happens BEFORE it.
    once = () => {};
    touchZoomRotate = { disableRotation: () => {} };
  }
  class LngLatBounds {
    extend = () => this;
  }
  class Marker {
    setLngLat = () => this;
    addTo = () => this;
  }
  class Popup {
    setText = () => this;
    setLngLat = () => this;
    addTo = () => this;
    remove = () => this;
  }
  class NavigationControl {}
  const api = { Map, LngLatBounds, Marker, Popup, NavigationControl, setWorkerUrl };
  return { ...api, default: api };
});

/** Capture the observer's callback so "the container changed" can be fired by hand. */
let fireResize: (() => void) | null = null;

beforeEach(() => {
  fitBounds.mockClear();
  resize.mockClear();
  mapOptions.mockClear();
  addControl.mockClear();
  setWorkerUrl.mockClear();
  fireResize = null;
  // jsdom measures everything as zero, and a map cannot frame into a zero box — we supply a size.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 400,
    height: 300,
    top: 0,
    left: 0,
    right: 400,
    bottom: 300,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: () => void) {
        fireResize = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const coords = { startLat: 55.75, startLon: 37.61, finishLat: 55.76, finishLon: 37.63 };

describe("RideMap — framing", () => {
  it("fits the frame on mount", async () => {
    render(<RideMap {...coords} />);
    await vi.waitFor(() => expect(fitBounds).toHaveBeenCalledTimes(1));
  });

  it("refits the frame when the container resizes", async () => {
    render(<RideMap {...coords} />);
    await vi.waitFor(() => expect(fitBounds).toHaveBeenCalledTimes(1));
    fireResize?.();
    expect(fitBounds).toHaveBeenCalledTimes(2);
    // The resize MUST come before the fit, or the map computes from a stale box.
    expect(resize).toHaveBeenCalled();
  });
});

/**
 * The map in a tile and the map in a window are one component but different objects: there a
 * widget that is entirely a button, here a map that is panned and zoomed. The single prop
 * `interactivePins` separates them, and this test holds the whole set of consequences.
 */
describe("RideMap — gestures", () => {
  it("in the tile the map is static: the gesture goes to the button instead of moving the basemap", async () => {
    render(<RideMap {...coords} />);
    await vi.waitFor(() => expect(mapOptions).toHaveBeenCalled());
    const o = mapOptions.mock.calls[0][0] as Record<string, unknown>;
    expect(o.interactive).toBe(false);
    // Attribution in the corner of a tiny widget would be noise; in the window it is required.
    expect(o.attributionControl).toBe(false);
    expect(addControl).not.toHaveBeenCalled();
  });

  it("the provider credit is folded into an \"i\" and opens in a new tab", async () => {
    // maplibre serves the attribution expanded over the map as the window opens, and its links
    // would navigate away from the page. The component fixes both behaviours.
    const { container } = render(<RideMap {...coords} interactivePins />);
    const attrib = await vi.waitFor(() => {
      const node = container.querySelector(".maplibregl-ctrl-attrib");
      expect(node).not.toBeNull();
      return node!;
    });
    expect(attrib.classList.contains("maplibregl-compact-show")).toBe(false);
    expect(attrib.hasAttribute("open")).toBe(false);
    // The "i" circle itself stays: the attribution is collapsed, not removed.
    expect(attrib.classList.contains("maplibregl-compact")).toBe(true);
    const link = attrib.querySelector("a")!;
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noreferrer");
  });

  it("a credit rebuilt by the style again folds up and again opens in a new tab", async () => {
    const { container } = render(<RideMap {...coords} interactivePins />);
    const attrib = await vi.waitFor(() => {
      const node = container.querySelector(".maplibregl-ctrl-attrib");
      expect(node).not.toBeNull();
      return node!;
    });
    // maplibre redraws the source list on every style change — the fresh markup arrives expanded
    // again and again without `target`.
    attrib.classList.add("maplibregl-compact-show");
    attrib.setAttribute("open", "");
    attrib.innerHTML = '<div><a href="https://www.openstreetmap.org/copyright">OSM</a></div>';
    await vi.waitFor(() => {
      expect(attrib.classList.contains("maplibregl-compact-show")).toBe(false);
      expect(attrib.querySelector("a")!.target).toBe("_blank");
    });
  });

  it("in the window the map pans, zooms and credits the provider", async () => {
    render(<RideMap {...coords} interactivePins />);
    await vi.waitFor(() => expect(mapOptions).toHaveBeenCalled());
    const o = mapOptions.mock.calls[0][0] as Record<string, unknown>;
    expect(o.interactive).toBe(true);
    expect(o.attributionControl).not.toBe(false);
    // The zoomer stands beside the gesture: not everyone has a wheel, everyone has buttons.
    expect(addControl).toHaveBeenCalled();
  });

  it("the map neither tilts nor rotates, in the tile or in the window", async () => {
    render(<RideMap {...coords} interactivePins />);
    await vi.waitFor(() => expect(mapOptions).toHaveBeenCalled());
    const o = mapOptions.mock.calls[0][0] as Record<string, unknown>;
    expect(o.dragRotate).toBe(false);
    expect(o.pitchWithRotate).toBe(false);
  });
});

/**
 * The basemap is ONE for all waves and light (DESIGN §7.6): on light paper the roads and labels
 * are legible without peering, whatever the wave around the map. A dark style under a dark wave
 * was tried and dropped — it took the attention for itself.
 */
describe("RideMap — basemap", () => {
  it("the basemap is light and does not depend on the wave", async () => {
    const { rerender } = render(<RideMap {...coords} />);
    await vi.waitFor(() => expect(mapOptions).toHaveBeenCalled());
    expect((mapOptions.mock.calls[0][0] as { style: string }).style).toContain("colorful");

    rerender(<RideMap {...coords} wave="wave-03" />);
    await vi.waitFor(() => expect(mapOptions).toHaveBeenCalledTimes(2));
    expect((mapOptions.mock.calls[1][0] as { style: string }).style).toContain("colorful");
  });
});

/**
 * The "restore framing" button under the zoomer: a map in a window is panned by hand, and getting
 * back to the ride itself should be one gesture. In the tile the map is static and has neither.
 */
describe("RideMap — frame return", () => {
  it("the window has two controls (zoom and return), the tile none", async () => {
    const { unmount } = render(<RideMap {...coords} interactivePins />);
    await vi.waitFor(() => expect(addControl).toHaveBeenCalledTimes(2));
    unmount();

    addControl.mockClear();
    render(<RideMap {...coords} />);
    await vi.waitFor(() => expect(mapOptions).toHaveBeenCalled());
    expect(addControl).not.toHaveBeenCalled();
  });

  it("a press returns the map to the ride's framing — with a flight, not a jump", async () => {
    render(<RideMap {...coords} interactivePins />);
    await vi.waitFor(() => expect(addControl).toHaveBeenCalledTimes(2));
    const control = addControl.mock.calls[1][0] as { onAdd: () => HTMLElement };
    const node = control.onAdd();
    fitBounds.mockClear();
    node.querySelector("button")!.click();
    expect(fitBounds).toHaveBeenCalledTimes(1);
    expect((fitBounds.mock.calls[0][1] as { duration: number }).duration).toBeGreaterThan(0);
  });
});

/**
 * The MapLibre worker is a condition of the map working, not a detail: without it the map draws
 * the style's background and stops, silently and with no console error (docs/pitfalls.md). The
 * address must point into the site's statics, where `scripts/copy-maplibre-worker.mjs` puts it.
 */
describe("RideMap — worker", () => {
  it("the map gets the worker address from the site's statics", async () => {
    render(<RideMap {...coords} />);
    await vi.waitFor(() => expect(setWorkerUrl).toHaveBeenCalled());
    expect(setWorkerUrl.mock.calls[0][0]).toBe("/maplibre/maplibre-gl-worker.mjs");
  });
});
