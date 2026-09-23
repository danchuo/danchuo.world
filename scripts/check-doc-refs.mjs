#!/usr/bin/env node
// Doc reference check (CLAUDE.md "Text density"): every file path, code name, config key and CSS
// variable a document puts in backticks must exist in the repository. A doc copy of a code fact
// goes stale silently when the code moves; this makes the move turn the PR red instead.

// Usage: node scripts/check-doc-refs.mjs — report dangling references, exit 1 if any.
// Names that are meant to be absent (external APIs, removed code named in a rejected
// alternative) go into scripts/doc-refs-allow.txt with a reason.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const DOCS = [
  "CLAUDE.md",
  "docs/PRD-danchuoworld.md",
  "docs/DESIGN.md",
  "docs/pitfalls.md",
  "docs/deploy.md",
];
const ALLOW_FILE = "scripts/doc-refs-allow.txt";
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|glb|woff2?|ttf|otf|zip|jar|pdf|mp3|mp4|bin|lock)$/i;

const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
const trackedSet = new Set(tracked);
const basenames = new Set(tracked.map((f) => f.replace(/^.*\//, "").replace(/\..*$/, "")));

// Everything the code says, as one searchable corpus plus a set of its words.
const codeFiles = tracked.filter(
  (f) => !BINARY.test(f) && !f.endsWith(".md") && f !== ALLOW_FILE,
);
const corpus = codeFiles.map((f) => {
  try {
    return readFileSync(join(ROOT, f), "utf8");
  } catch {
    return "";
  }
}).join("\n");
const words = new Set(corpus.match(/[A-Za-z_$][\w$]*/g));

const allow = new Map();
for (const [i, raw] of readFileSync(join(ROOT, ALLOW_FILE), "utf8").split("\n").entries()) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const [name, reason] = line.split(/\s+—\s+/);
  if (!reason) fail(`${ALLOW_FILE}:${i + 1}: entry without a reason ("name — reason"): ${line}`);
  allow.set(name.trim(), { line: i + 1, used: false });
}

function globToRegex(p) {
  const esc = p.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    "(^|/)" + esc.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/<[^>]*>|NN/g, "[^/]+") + "$",
  );
}

function ignored(ref) {
  try {
    execFileSync("git", ["check-ignore", "-q", ref.replace(/^(\.\.?\/)+/, "")], { cwd: ROOT });
    return true;
  } catch {
    return false;
  }
}

function pathExists(ref) {
  const p = ref.replace(/^(\.\.?\/)+/, "").replace(/\/$/, "");
  if (/[*<]|NN/.test(p)) {
    const re = globToRegex(p);
    return tracked.some((f) => re.test(f));
  }
  if (trackedSet.has(p)) return true;
  if (!EXT.test(p) && tracked.some((f) => EXT.test(f) && f.replace(EXT, "").endsWith("/" + p))) return true;
  return tracked.some((f) => f.endsWith("/" + p) || f.startsWith(p + "/") || f.includes("/" + p + "/"));
}

const EXT = /\.(md|ts|tsx|kt|kts|css|mjs|js|json|ya?ml|xml|py|sh|html|properties)$/;
// Paths without an extension count only under a known root: `a/b` is otherwise prose ("1/2").
const ROOTS = /^(\.{1,2}\/)*(frontend|backend|docs|scripts|caddy|ops|webdav|\.github|src|lib|components|app|e2e|public|styles|db)\//;

// Returns why a backticked span is a reference worth checking, or null for plain text.
function classify(t) {
  if (/\s/.test(t) || t.length < 3) return null;
  if (/^https?:|:\/\/|^\/api\/|^@/.test(t)) return null;
  if (/^[a-z0-9-]+\.[a-z]{2,}(\/|$)/i.test(t) && !/\.(md|ts|tsx|kt|css|mjs|js|json|ya?ml|xml|py|sh|html|txt)(\/|$)/.test(t)) return null;
  if (/^danchuo\.[\w.*/-]+$/.test(t)) return "key";
  if (/^--[a-z][\w-]*$/.test(t)) return "cssvar";
  if (EXT.test(t) && /^[\w./*<>-]+$/.test(t)) return "path";
  if (ROOTS.test(t) && /^[\w./*<>{}-]+$/.test(t)) return "path";
  if (/^[A-Za-z_][\w]*(\.[A-Za-z_]\w*)*(\(\))?$/.test(t) && /[a-z][A-Z]|^[A-Z][a-z]+[A-Z]/.test(t)) return "name";
  return null;
}

function exists(kind, t) {
  switch (kind) {
    // `a.b.x/y/z` is shorthand for sibling keys: the shared prefix has to exist.
    case "key": return corpus.includes(t.replace(/[^.]*\/.*$/, "").replace(/[-*.]*\*.*$/, "").replace(/\.$/, ""));
    case "cssvar": return corpus.includes(t);
    // Not a tracked file: an import specifier (`next/font`), a name the code spells out, or an
    // ignored local file (`backend/.env`) — none of them is dangling.
    case "path": return pathExists(t) || corpus.includes(t.replace(/\/$/, "")) || ignored(t);
    case "name": return t.replace(/\(\)$/, "").split(".").every((part) => words.has(part) || basenames.has(part));
  }
}

const problems = [];
function fail(msg) {
  problems.push(msg);
}

for (const doc of DOCS) {
  let fenced = false;
  readFileSync(join(ROOT, doc), "utf8").split("\n").forEach((line, i) => {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (fenced) return;
    for (const [, t] of line.matchAll(/`([^`\n]+)`/g)) {
      const kind = classify(t);
      if (!kind || exists(kind, t)) continue;
      const entry = allow.get(t);
      if (entry) {
        entry.used = true;
        continue;
      }
      fail(`${doc}:${i + 1}: \`${t}\` (${kind}) is not in the code`);
    }
  });
}

// A stale allowance is a silent hole: the name came back, or no document mentions it any more.
for (const [name, { line, used }] of allow) {
  if (!used) fail(`${ALLOW_FILE}:${line}: \`${name}\` is allowed but not needed — remove the entry`);
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} dangling doc reference(s). Fix the doc, not the check — CLAUDE.md "Text density".`);
  process.exit(1);
}
console.log("doc references: ok");
