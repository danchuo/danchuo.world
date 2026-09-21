/**
 * A wave's tokens as CSS custom properties: SSR writes them into a `<style>` in the head, the
 * switcher writes them into `:root` on a live swap. Keys are stored WITHOUT the `--` prefix, and
 * fonts are never among them — `next/font` supplies those. DESIGN §10
 */

/** `{ "bg-page": "#faf1eb" }` → `:root{--bg-page:#faf1eb;…}`, one line, for a `<style>` tag. */
export function serializeTokensToCss(tokens: Record<string, string>): string {
  const body = Object.entries(tokens)
    .map(([k, v]) => `--${k}:${v};`)
    .join("");
  return `:root{${body}}`;
}

/** Client-side swap: writes a wave's tokens into `:root` (the wave switcher, DESIGN §2.6). */
export function applyThemeTokens(tokens: Record<string, string>): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(tokens)) {
    root.style.setProperty(`--${k}`, v);
  }
}
