import type { MetadataRoute } from "next";

/**
 * sitemap.xml (PRD §12 M5). v1 — одностраничный сайт (борд на `/`); галереи/архивы как
 * отдельные роуты появятся позже (бэклог) и допишутся сюда.
 */
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
