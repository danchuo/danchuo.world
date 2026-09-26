/**
 * Who the site belongs to, for search engines and link previews. Kept static: SSR makes no backend
 * call for the board, and the owner's handles change far less often than the social tile. PRD §12
 */
export const SITE_PROFILE = {
  name: "Данила",
  handle: "danchuo",
  title: "danchuo.world",
  description:
    "живая доска жизни: сон, шаги, музыка, git, фото и дневник каждого дня — в реальном времени",
  sameAs: [
    "https://instagram.com/danchuo_",
    "https://t.me/danchuo",
    "https://x.com/danchuo",
    "https://github.com/danchuo",
  ],
} as const;

export function profileJsonLd(siteUrl: string) {
  const url = new URL("/", siteUrl).href;
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url,
    name: SITE_PROFILE.title,
    inLanguage: "ru",
    mainEntity: {
      "@type": "Person",
      name: SITE_PROFILE.name,
      alternateName: SITE_PROFILE.handle,
      url,
      sameAs: [...SITE_PROFILE.sameAs],
    },
  };
}

/** JSON for an inline `<script>`: `<` is escaped so no value can close the tag early. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
