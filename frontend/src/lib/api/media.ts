/** Prefix relative media paths with the API base for cross-port development; preserve absolute URLs and same-origin production paths. */

const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

export function mediaUrl(url: string): string {
  return url.startsWith("/") ? `${BASE}${url}` : url;
}
