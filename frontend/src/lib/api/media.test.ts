import { afterEach, describe, expect, it, vi } from "vitest";

/** BASE is read at import, so each case imports the module under its own environment. */
async function load(base?: string) {
  vi.resetModules();
  if (base === undefined) vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
  else vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", base);
  return import("./media");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("photoUrl", () => {
  it("routes a same-origin photo through the optimizer, query and all", async () => {
    const { photoUrl } = await load();
    expect(photoUrl("/api/days/2026-09-01/photo/web?v=17")).toBe(
      "/_next/image?url=%2Fapi%2Fdays%2F2026-09-01%2Fphoto%2Fweb%3Fv%3D17&w=3840&q=90",
    );
  });

  it("leaves an absolute URL alone: the optimizer only takes our own origin", async () => {
    const { photoUrl } = await load();
    expect(photoUrl("https://i.scdn.co/image/abc")).toBe("https://i.scdn.co/image/abc");
  });

  it("with a cross-port API base in development the photo goes straight to the backend", async () => {
    const { photoUrl } = await load("http://localhost:8080/");
    expect(photoUrl("/api/film-media/3/18/web.jpg")).toBe("http://localhost:8080/api/film-media/3/18/web.jpg");
  });
});
