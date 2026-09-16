import type { MetadataRoute } from "next";

/** Allow public pages; exclude API data and use an absolute sitemap URL. PRD §12. */
const SITE_URL = process.env.SITE_URL ?? "https://danchuo.world";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
