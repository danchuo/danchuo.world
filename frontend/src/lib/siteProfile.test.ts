import { describe, expect, it } from "vitest";
import { profileJsonLd, SITE_PROFILE } from "./siteProfile";

describe("profileJsonLd", () => {
  const ld = profileJsonLd("https://danchuo.world");

  it("describes the page as a profile of one person", () => {
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("ProfilePage");
    expect(ld.url).toBe("https://danchuo.world/");
    expect(ld.mainEntity["@type"]).toBe("Person");
    expect(ld.mainEntity.name).toBe(SITE_PROFILE.name);
    expect(ld.mainEntity.alternateName).toBe(SITE_PROFILE.handle);
  });

  it("links the person to every public profile", () => {
    expect(ld.mainEntity.sameAs).toEqual(SITE_PROFILE.sameAs);
    expect(ld.mainEntity.sameAs.every((u) => u.startsWith("https://"))).toBe(true);
  });

  it("keeps the site root canonical whatever trailing slash the base has", () => {
    expect(profileJsonLd("https://danchuo.world/").url).toBe("https://danchuo.world/");
  });
});

describe("serializeJsonLd", () => {
  it("escapes `<` so the payload cannot close its script tag", async () => {
    const { serializeJsonLd } = await import("./siteProfile");
    expect(serializeJsonLd({ a: "</script><b>" })).not.toContain("</script>");
    expect(JSON.parse(serializeJsonLd({ a: "</script>" }))).toEqual({ a: "</script>" });
  });
});
