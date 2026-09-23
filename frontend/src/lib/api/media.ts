/** Prefix relative media paths with the API base for cross-port development; preserve absolute URLs and same-origin production paths. */

const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

export function mediaUrl(url: string): string {
  return url.startsWith("/") ? `${BASE}${url}` : url;
}

/** The optimizer's width is a ceiling and it never enlarges: the photo keeps its pixels. */
const PHOTO_CEILING = 3840;
/** Next encodes AVIF at `q − 20`: 90 is AVIF 70, where film grain still survives a 2× crop. PRD §8 */
const PHOTO_QUALITY = 90;

/**
 * A photo through Next's image optimizer: same pixels, AVIF for the browsers that take it and a
 * JPEG no worse than the source for the rest. Only our own origin is optimised. PRD §8
 */
export function photoUrl(url: string): string {
  if (!url.startsWith("/") || BASE) return mediaUrl(url);
  return `/_next/image?url=${encodeURIComponent(url)}&w=${PHOTO_CEILING}&q=${PHOTO_QUALITY}`;
}
