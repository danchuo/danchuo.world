/**
 * Абсолютизация media-URL кадров фото-дропа (B1). Бэкенд отдаёт относительные пути
 * `/api/film-media/...` (в проде фронт и API за одним origin — Caddy). В деве API на другом
 * порту (`NEXT_PUBLIC_API_BASE_URL`), поэтому относительный путь нужно префиксовать базой.
 * Пустая база ⇒ путь как есть (same-origin прод). Абсолютные URL (будущий CDN/S3) не трогаем.
 */

const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

export function mediaUrl(url: string): string {
  return url.startsWith("/") ? `${BASE}${url}` : url;
}
