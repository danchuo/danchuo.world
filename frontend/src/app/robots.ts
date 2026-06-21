import type { MetadataRoute } from "next";

/**
 * robots.txt (PRD §12 M5). Контент публичен на чтение (PRD §3) — индексировать можно;
 * закрываем только `/api/*` (это данные для фронта, не страницы). Sitemap — абсолютным URL.
 */
const SITE_URL = process.env.SITE_URL ?? "https://danchuo.world";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
