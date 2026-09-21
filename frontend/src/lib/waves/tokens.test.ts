import { describe, expect, it } from "vitest";
import { applyThemeTokens, serializeTokensToCss } from "./tokens";

describe("serializeTokensToCss", () => {
  it("оборачивает токены в :root с префиксом --", () => {
    const css = serializeTokensToCss({ "bg-page": "#faf1eb", accent: "#e2604c" });
    expect(css).toBe(":root{--bg-page:#faf1eb;--accent:#e2604c;}");
  });

  it("пустые токены → пустой :root", () => {
    expect(serializeTokensToCss({})).toBe(":root{}");
  });
});

describe("applyThemeTokens", () => {
  it("пишет каждый токен в :root как --<ключ>", () => {
    applyThemeTokens({ "bg-page": "#fff", accent: "#000" });
    expect(document.documentElement.style.getPropertyValue("--bg-page")).toBe("#fff");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#000");
  });
});
