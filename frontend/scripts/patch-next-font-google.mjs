// Guards the one place where `next/font/google` assumes every font URL ends in a file extension.
// Google sometimes serves a font from an extension-less URL, and the loader then crashes the whole
// build with "Cannot read properties of null (reading '1')" (docs/pitfalls.md).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const loader = join(root, "node_modules", "next", "dist", "compiled", "@next", "font", "dist", "google", "loader.js");

// The extension only names the file emitted into the build; the loader asks Google with a Chrome
// user agent, so whatever arrives from an URL without one is woff2.
const UNGUARDED = ".exec(googleFontFileUrl)[1];";
const GUARDED = ".exec(googleFontFileUrl)?.[1] ?? 'woff2';";

const source = readFileSync(loader, "utf8");

if (source.includes(GUARDED)) {
  console.log("next/font: guard already in place");
} else if (source.includes(UNGUARDED)) {
  writeFileSync(loader, source.replace(UNGUARDED, () => GUARDED));
  console.log("next/font: extension-less Google font URLs guarded");
} else {
  // Loud on purpose: a silent no-op here returns the crash months later, as a red deploy with
  // nothing in the diff to explain it.
  console.error(
    "next/font: the Google loader no longer has the line this script patches.\n" +
      "Next has moved or fixed it - check upstream, then update or delete\n" +
      "frontend/scripts/patch-next-font-google.mjs (docs/pitfalls.md).",
  );
  process.exit(1);
}
