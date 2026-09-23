#!/usr/bin/env node
// Comment budget check (CLAUDE.md "Comments in code"): a comment block carries at most
// MAX_LINES lines of prose, and never Cyrillic. Both rules are mechanical on purpose —
// a comment style reproduces itself by imitation, and only a failing check breaks that loop.

// Usage: node scripts/check-comment-budget.mjs [--list]
//   (default) report violations, exit 1 if any
//   --list    worklist: files by comment weight, heaviest first

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const MAX_LINES = 3;
const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const CYRILLIC = /[Ѐ-ӿ]/;

// Two comment dialects. `slash` has `//` lines and `/* */` spans; `hash` has `#` lines.
const TREES = [
  { dir: "frontend/src", ext: [".ts", ".tsx"], lang: "slash" },
  { dir: "frontend/src", ext: [".css"], lang: "slash" },
  { dir: "frontend/e2e", ext: [".ts"], lang: "slash" },
  { dir: "backend/src", ext: [".kt"], lang: "slash" },
  { dir: "scripts", ext: [".mjs", ".js"], lang: "slash" },
  { dir: "scripts", ext: [".py", ".sh"], lang: "hash" },
  { dir: "backend/src/main/resources", ext: [".properties"], lang: "hash" },
  { dir: ".github/workflows", ext: [".yml", ".yaml"], lang: "hash" },
];

// Single files that carry comments but sit outside any tree.
const FILES = [
  { path: "docker-compose.yml", lang: "hash" },
  { path: "docker-compose.prod.yml", lang: "hash" },
  { path: "Caddyfile", lang: "hash" },
  { path: "ops/backup.sh", lang: "hash" },
  { path: "frontend/next.config.ts", lang: "slash" },
  { path: "frontend/vitest.config.ts", lang: "slash" },
  { path: "frontend/playwright.config.ts", lang: "slash" },
  { path: "backend/build.gradle.kts", lang: "slash" },
  { path: "backend/settings.gradle.kts", lang: "slash" },
  { path: "backend/gradle.properties", lang: "hash" },
];

function walk(dir, ext, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, ext, out);
    else if (ext.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

// Prose lines only: the `*/` terminator and empty `*` spacers are punctuation, not budget.
function prose(line) {
  return line
    .replace(/^\s*(\/\/+|\{\s*\/\*+|\/\*+|\*\/|\*|#+)/, "")
    .replace(/\*\/\s*\}?\s*$/, "")
    .trim();
}

// A comment that trails code on its own line. Both forms hide from the block scan — a `//` after
// an expression, and a one-line JSX `{/* … */}` — so the language rule is checked here separately.
// A URL's `//` is excluded by the preceding character.
const TRAILING = /(?:^|[^:])\/\/(.*)$|\{\s*\/\*(.*?)\*\/\s*\}/;

// Whether a `/* … */` span is open after this line. An open span closes on the first `*/`; a closed
// one opens only on a `/*` that this line never closes, and a `//` line opens nothing at all.
function spanOpen(line, open) {
  if (open) return !line.includes("*/");
  const at = line.indexOf("/*");
  const slash = line.indexOf("//");
  if (at < 0 || (slash >= 0 && slash < at)) return false;
  return !line.slice(at + 2).includes("*/");
}

// A block is a run of adjacent comment lines. A `/* … */` span counts WHOLE, including
// continuation lines that carry no leading `*` — otherwise dropping that asterisk would
// hide an arbitrarily long comment from the budget.
function blocks(text, lang) {
  const found = [];
  let cur = null;
  let open = false;
  // A bare `*` line never OPENS a block: inside a `/* … */` the open span already covers it, and
  // outside one it is ordinary text — a bullet in a raw string, say. Letting it open a block made
  // fixture text look like a comment and swallowed the line after it.
  const lineStart = lang === "hash" ? /^\s*#/ : /^\s*(\/\/|\{\s*\/\*|\/\*)/;

  text.split("\n").forEach((line, i) => {
    const isComment = open || lineStart.test(line);
    if (isComment) {
      cur ??= { start: i + 1, lines: [] };
      cur.lines.push(line);
      // ⚠️ Delimiters are looked for only where they can actually open or close a span: a `//` line
      // never opens one, and inside a `/* … */` the text itself may hold `/*` (a path like
      // `/api/*`). Counting those swallowed the rest of the file into one block.
      if (lang === "slash") open = spanOpen(line, open);
    } else if (cur) {
      found.push(cur);
      cur = null;
    }
  });
  if (cur) found.push(cur);
  return found;
}

const files = [
  ...TREES.flatMap(({ dir, ext, lang }) =>
    walk(join(ROOT, dir), ext).map((path) => ({ path, lang })),
  ),
  ...FILES.map(({ path, lang }) => ({ path: join(ROOT, path), lang })).filter((f) =>
    existsSync(f.path),
  ),
];

const report = [];

for (const { path, lang } of files) {
  const text = readFileSync(path, "utf8");
  const rel = relative(ROOT, path).split(sep).join("/");
  const long = [];
  const cyrillic = [];
  let weight = 0;

  const inBlock = new Set();
  for (const block of blocks(text, lang)) {
    const body = block.lines.map(prose).filter(Boolean);
    weight += body.join("\n").length;
    block.lines.forEach((_, i) => inBlock.add(block.start + i));
    if (body.length > MAX_LINES) long.push({ line: block.start, count: body.length });
    if (block.lines.some((l) => CYRILLIC.test(l))) cyrillic.push(block.start);
  }

  if (lang === "slash") {
    text.split("\n").forEach((line, i) => {
      if (inBlock.has(i + 1) || !CYRILLIC.test(line)) return;
      const m = TRAILING.exec(line);
      if (m && CYRILLIC.test(m[1] ?? m[2] ?? "")) cyrillic.push(i + 1);
    });
    cyrillic.sort((a, b) => a - b);
  }

  if (long.length || cyrillic.length) report.push({ rel, long, cyrillic, weight });
}

if (process.argv.includes("--list")) {
  for (const f of report.sort((a, b) => b.weight - a.weight)) {
    console.log(
      `${String(f.weight).padStart(6)} ch  ${String(f.long.length).padStart(3)} long  ` +
        `${String(f.cyrillic.length).padStart(3)} ru  ${f.rel}`,
    );
  }
  console.log(`\n${report.length} files remaining`);
  process.exit(0);
}

if (!report.length) process.exit(0);

for (const f of report.sort((a, b) => b.weight - a.weight)) {
  console.error(f.rel);
  for (const { line, count } of f.long) {
    console.error(`  ${f.rel}:${line}  block of ${count} lines (max ${MAX_LINES})`);
  }
  for (const line of f.cyrillic) console.error(`  ${f.rel}:${line}  Cyrillic in comment`);
}

const longTotal = report.reduce((n, f) => n + f.long.length, 0);
const ruTotal = report.reduce((n, f) => n + f.cyrillic.length, 0);
console.error(
  `\n${report.length} files: ${longTotal} oversized blocks, ${ruTotal} non-English blocks`,
);
process.exit(1);
