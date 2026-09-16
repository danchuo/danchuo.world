import type { MetadataRoute } from "next";

/** The public board is the only indexable route. PRD §12. */
const SITE_URL = process.env.SITE_URL ?? "https://danchuo.world";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
