import { describe, expect, it } from "vitest";
import { applyThemeTokens, serializeTokensToCss } from "./tokens";

describe("serializeTokensToCss", () => {
  it("wraps tokens into :root with the -- prefix", () => {
    const css = serializeTokensToCss({ "bg-page": "#faf1eb", accent: "#e2604c" });
    expect(css).toBe(":root{--bg-page:#faf1eb;--accent:#e2604c;}");
  });

  it("empty tokens → an empty :root", () => {
    expect(serializeTokensToCss({})).toBe(":root{}");
  });
});

describe("applyThemeTokens", () => {
  it("writes each token into :root as --<key>", () => {
    applyThemeTokens({ "bg-page": "#fff", accent: "#000" });
    expect(document.documentElement.style.getPropertyValue("--bg-page")).toBe("#fff");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#000");
  });
});
