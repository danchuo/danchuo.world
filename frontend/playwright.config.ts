import { defineConfig } from "@playwright/test";

/**
 * Per-tile visual regression (PRD §12): it pins tile layout before a release, which jsdom units do
 * not catch. Two viewports, desktop (Full HD) and mobile (the stack). Baselines are taken in Docker
 * for stable font rendering (e2e/README.md); determinism of data and time is in e2e/fixtures.ts.
 */
const BASE_URL = process.env.PW_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  // Baselines are filed per project: e2e/__screenshots__/<desktop|mobile>/<tile>.png
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  /**
   * `reducedMotion` is a condition of determinism, not run cosmetics. The artifact rail (DESIGN §7.2)
   * travels frame by frame from JS and `animations: "disabled"` does not stop it — that flag is for
   * CSS animations. Under reduced motion the rail rests at its zero offset, so baselines reproduce.
   */
  use: { baseURL: BASE_URL, contextOptions: { reducedMotion: "reduce" } },
  expect: {
    // A small tolerance for subpixel antialiasing; a real layout regression is still caught.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide" },
  },
  projects: [
    // Full HD is the commonest desktop, and baselines should represent a typical visitor rather
    // than one machine. NB: this is NOT the §8.1 proportion reference, which is 1536 (the owner's
    // screen, where sizes were approved) and stays 1536; this is only the run's viewport.
    { name: "desktop", use: { viewport: { width: 1920, height: 1080 } } },
    // hasTouch is not cosmetic: board mode and ≥44px touch targets are decided by `pointer: coarse`
    // (DESIGN §8, §9). Without touch emulation the mobile project reported `pointer: fine` and
    // reached the stack only by the fallback width threshold, testing the wrong path.
    { name: "mobile", use: { viewport: { width: 375, height: 812 }, hasTouch: true } },
  ],
});
