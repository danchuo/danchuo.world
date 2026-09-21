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
  it("подменяет иконку вкладки готовым файлом кадра", async () => {
    stubImage();
    render(<FaviconSpinner />);
    await waitFor(() => expect(link()?.href).toContain("/assets/favicon/frames/earth-spin-00.png"));
  });

  /* No canvas at all: `toDataURL` is the canvas-fingerprinting signature over which Safari offered
     the visitor to weaken privacy protection on the site. DESIGN §10.3 */
  it("не читает пиксели с канваса", async () => {
    const readback = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL");
    stubImage();
    render(<FaviconSpinner />);
    await waitFor(() => expect(link()?.href).toContain("earth-spin-00.png"));
    expect(readback).not.toHaveBeenCalled();
  });

  it("крутит кадры дальше по времени", async () => {
    stubImage();
    render(<FaviconSpinner />);
    await waitFor(() => expect(link()?.href).toContain("earth-spin-00.png"));
    // Slack in the timeout: a frame holds for 80ms, but timers drift under the shared run.
    await waitFor(() => expect(link()?.href).toContain("earth-spin-01.png"), { timeout: 3000 });
  });

  it("при prefers-reduced-motion оставляет один кадр", async () => {
    stubImage();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<FaviconSpinner />);
    await waitFor(() => expect(link()?.href).toContain("earth-spin-00.png"));
    await new Promise((r) => setTimeout(r, 300)); // enough for three frames
    expect(link()?.href).toContain("earth-spin-00.png");
  });

  it("битые кадры не ломают вкладку — иконка остаётся прежней", async () => {
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

  it("заводит <link rel=icon>, если его в head не было", async () => {
    document.head.innerHTML = "";
    stubImage();
    render(<FaviconSpinner />);
    await waitFor(() => expect(link()?.href).toContain("earth-spin-00.png"));
  });
});
