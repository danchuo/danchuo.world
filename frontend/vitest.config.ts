import { defineConfig, defaultExclude } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * Two runs instead of one, split by whether a test needs a browser. The measurement behind it:
 * pure-logic tests execute in 0.29s for 154 of them, while raising jsdom under them cost 35s across
 * workers. `src/lib` on node instead of jsdom: 7.53s → 2.85s.
 */

/**
 * The split is BY DIRECTORY, not by extension: `src/lib` holds pure modules, which need no DOM by
 * the nature of the layer. Everything else stays in jsdom, so a new test anywhere outside `src/lib`
 * behaves exactly as before and nobody has to remember the split.
 */

/**
 * NB: `environmentMatchGlobs` is deliberately NOT used — it is `@deprecated` in Vitest 3.2 and
 * leaves in v4; the supported replacement is `projects`.
 */

/** The one module in `src/lib` that needs a real DOM: it writes wave tokens into `:root`.
 *  The extglob exception is held as a single constant, or the set would have to be maintained
 *  in two places and a file falling out of both projects would silently stop running. */
const LOGIC_TESTS = "src/lib/**/!(tokens).test.ts";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    // Dots locally: fifty lines of "✓ file" on a green run say nothing, and a failing test prints
    // in full under any reporter. In CI the log is read after the fact with nobody to ask, so
    // there the by-name list stays.
    reporters: process.env.CI ? ["default"] : ["dot"],
    // Console output of PASSING tests is dropped. The main noise of a green run is not the file
    // list but React `act(...)` warnings from tests that are green anyway: they ask nothing of
    // the reader and train them to skim. A failing test keeps its logs in full.
    silent: "passed-only",
    projects: [
      {
        // extends: true — the project inherits plugins and resolve from this file, without which
        // the `@` alias and the react plugin would never reach it.
        extends: true,
        test: {
          name: "logic",
          environment: "node",
          include: [LOGIC_TESTS],
          // No setupFiles on purpose: it pulls in jest-dom and React cleanup, which are neither
          // needed nor loadable under node.
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          // Catch everything else rather than enumerate: a test that lands in no project does not
          // fail, it simply never runs, which is the worst outcome available.
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: [...defaultExclude, LOGIC_TESTS],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});
