import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FaviconSpinner } from "./FaviconSpinner";

/** An image does not load itself in jsdom — we fire onload right after src is assigned. */
function stubImage() {
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
}

function link() {
  return document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
}

beforeEach(() => {
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
    stubImage();
    render(<FaviconSpinner />);
    await waitFor(() => expect(link()?.href).toContain("/assets/favicon/frames/earth-spin-00.png"));
  });

  /* No canvas at all: `toDataURL` is the canvas-fingerprinting signature over which Safari offered
     the visitor to weaken privacy protection on the site. DESIGN §10.3 */
  it("does not read pixels from the canvas", async () => {
    const readback = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL");
    stubImage();
    render(<FaviconSpinner />);
    await waitFor(() => expect(link()?.href).toContain("earth-spin-00.png"));
    expect(readback).not.toHaveBeenCalled();
  });

  it("keeps turning the frames over time", async () => {
    stubImage();
    render(<FaviconSpinner />);
    await waitFor(() => expect(link()?.href).toContain("earth-spin-00.png"));
    // Slack in the timeout: a frame holds for 80ms, but timers drift under the shared run.
    await waitFor(() => expect(link()?.href).toContain("earth-spin-01.png"), { timeout: 3000 });
  });

  it("with prefers-reduced-motion keeps a single frame", async () => {
    stubImage();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<FaviconSpinner />);
    await waitFor(() => expect(link()?.href).toContain("earth-spin-00.png"));
    await new Promise((r) => setTimeout(r, 300)); // enough for three frames
    expect(link()?.href).toContain("earth-spin-00.png");
  });

  it("broken frames do not break the tab — the icon stays as it was", async () => {
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_v: string) {
          queueMicrotask(() => this.onerror?.());
        }
      },
    );
    render(<FaviconSpinner />);
    await new Promise((r) => setTimeout(r, 10));
    expect(link()?.href).toContain("/icon.png");
  });

  it("creates <link rel=icon> if head had none", async () => {
    document.head.innerHTML = "";
    stubImage();
    render(<FaviconSpinner />);
    await waitFor(() => expect(link()?.href).toContain("earth-spin-00.png"));
  });
});
