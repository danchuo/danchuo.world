import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FaviconSpinner } from "./FaviconSpinner";

/** jsdom не умеет канвас — подменяем нарезку спрайта предсказуемыми data-URL. */
function stubCanvas() {
  const draw = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: draw,
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  let n = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => `data:frame-${n++}`);
  return draw;
}

/** Картинка в jsdom не грузится сама — дёргаем onload сразу после присвоения src. */
function stubImage() {
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 1536;
      height = 32;
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
  it("подменяет иконку вкладки нарезанным кадром спрайта", async () => {
    stubCanvas();
    stubImage();
    render(<FaviconSpinner />);
    await waitFor(() => expect(link()?.href).toContain("data:frame-0"));
  });

  it("крутит кадры дальше по времени", async () => {
    stubCanvas();
    stubImage();
    render(<FaviconSpinner />);
    await waitFor(() => expect(link()?.href).toContain("data:frame-0"));
    // Запас по времени: кадр держится 100мс, но под общим прогоном таймеры плывут.
    await waitFor(() => expect(link()?.href).toContain("data:frame-1"), { timeout: 3000 });
  });

  it("при prefers-reduced-motion оставляет один кадр", async () => {
    stubCanvas();
    stubImage();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<FaviconSpinner />);
    await waitFor(() => expect(link()?.href).toContain("data:frame-0"));
    await new Promise((r) => setTimeout(r, 300)); // хватило бы на три кадра
    expect(link()?.href).toContain("data:frame-0");
  });

  it("без канваса (старый браузер) молча оставляет статичную иконку", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    stubImage();
    render(<FaviconSpinner />);
    await new Promise((r) => setTimeout(r, 10));
    expect(link()?.href).toContain("/icon.png");
  });

  it("битый спрайт не ломает вкладку — иконка остаётся прежней", async () => {
    stubCanvas();
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
    stubCanvas();
    stubImage();
    render(<FaviconSpinner />);
    await waitFor(() => expect(link()?.href).toContain("data:frame-0"));
  });
});
