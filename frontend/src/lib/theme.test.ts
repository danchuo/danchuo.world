import { afterEach, describe, expect, it, vi } from "vitest";
import { INTERNAL_HEADER, applyThemeTokens, fetchBackendJson, serializeTokensToCss } from "./theme";

describe("serializeTokensToCss", () => {
  it("оборачивает токены в :root с префиксом --", () => {
    const css = serializeTokensToCss({ "bg-page": "#faf1eb", accent: "#e2604c" });
    expect(css).toBe(":root{--bg-page:#faf1eb;--accent:#e2604c;}");
  });

  it("пустые токены → пустой :root", () => {
    expect(serializeTokensToCss({})).toBe(":root{}");
  });
});

describe("fetchBackendJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Ловит один вызов fetch и отдаёт его аргументы. */
  function stubFetch(response: Partial<Response>) {
    const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}), ...response });
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  it("метит SSR-запрос доверенным заголовком — иначе весь серверный рендер сидит в общем бакете рейтлимитера", async () => {
    const spy = stubFetch({});
    await fetchBackendJson("/api/theme/active");

    const headers = spy.mock.calls[0][1].headers as Record<string, string>;
    expect(headers[INTERNAL_HEADER]).toBe("1");
  });

  it("не роняет борд, когда бэк недоступен, — отдаёт null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(fetchBackendJson("/api/theme/active")).resolves.toBeNull();
  });

  it("не-200 — тоже null, а не исключение", async () => {
    stubFetch({ ok: false });
    await expect(fetchBackendJson("/api/theme/active")).resolves.toBeNull();
  });
});

describe("applyThemeTokens", () => {
  it("пишет каждый токен в :root как --<ключ>", () => {
    applyThemeTokens({ "bg-page": "#fff", accent: "#000" });
    expect(document.documentElement.style.getPropertyValue("--bg-page")).toBe("#fff");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#000");
  });
});
