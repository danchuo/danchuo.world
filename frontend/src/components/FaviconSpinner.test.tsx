import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A fresh module per test: the spinner remembers warmed frames for the page's lifetime.
let FaviconSpinner: typeof import("./FaviconSpinner").FaviconSpinner;

/** Frames arrive by fetch; each becomes an object URL that still names its file, for asserts. */
function stubFrames(ok = true) {
  const fetchFrame = vi.fn(async (url: string) => ({ ok, blob: async () => ({ url }) }));
  vi.stubGlobal("fetch", fetchFrame);
  // jsdom has no object URLs at all, so the method is provided rather than spied on.
  URL.createObjectURL = vi.fn((blob: Blob) => `blob:${(blob as unknown as { url: string }).url}`);
  return fetchFrame;
}

function link() {
  return document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
}

beforeEach(async () => {
  vi.resetModules();
  ({ FaviconSpinner } = await import("./FaviconSpinner"));
  document.head.innerHTML = '<link rel="icon" href="/icon.png" />';
  document.documentElement.removeAttribute("data-wave");
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("FaviconSpinner", () => {
  it("replaces the tab icon with a ready frame file", async () => {
    stubFrames();
    render(<FaviconSpinner />);
    await waitFor(() => expect(link()?.href).toContain("/assets/favicon/frames/earth-spin-00.png"));
  });

  /* No canvas at all: `toDataURL` is the canvas-fingerprinting signature over which Safari offered
     the visitor to weaken privacy protection on the site. DESIGN §10.3 */
  it("does not read pixels from the canvas", async () => {
    const readback = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL");
    stubFrames();
    render(<FaviconSpinner />);
    await waitFor(() => expect(link()?.href).toContain("earth-spin-00.png"));
    expect(readback).not.toHaveBeenCalled();
  });

  it("keeps turning the frames over time", async () => {
    stubFrames();
    render(<FaviconSpinner />);
    await waitFor(() => expect(link()?.href).toContain("earth-spin-00.png"));
    // Slack in the timeout: a frame holds for 80ms, but timers drift under the shared run.
    await waitFor(() => expect(link()?.href).toContain("earth-spin-01.png"), { timeout: 3000 });
  });

  it("with prefers-reduced-motion keeps a single frame", async () => {
    stubFrames();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<FaviconSpinner />);
    await waitFor(() => expect(link()?.href).toContain("earth-spin-00.png"));
    await new Promise((r) => setTimeout(r, 300)); // enough for three frames
    expect(link()?.href).toContain("earth-spin-00.png");
  });

  it("broken frames do not break the tab — the icon stays as it was", async () => {
    stubFrames(false);
    render(<FaviconSpinner />);
    await new Promise((r) => setTimeout(r, 10));
    expect(link()?.href).toContain("/icon.png");
  });

  /* A frame href that is a network URL is revalidated on EVERY swap: ten requests a second per
     tab, enough for the edge to 429 the whole site. DESIGN §10.3 */
  it("turns the planet without touching the network: each frame is fetched once", async () => {
    const fetchFrame = stubFrames();
    render(<FaviconSpinner />);
    await waitFor(() => expect(link()?.href).toMatch(/^blob:.*earth-spin-01\.png$/), { timeout: 3000 });
    expect(fetchFrame).toHaveBeenCalledTimes(48);
    expect(new Set(fetchFrame.mock.calls.map(([url]) => url)).size).toBe(48);
  });

  it("creates <link rel=icon> if head had none", async () => {
    document.head.innerHTML = "";
    stubFrames();
    render(<FaviconSpinner />);
    await waitFor(() => expect(link()?.href).toContain("earth-spin-00.png"));
  });
});
