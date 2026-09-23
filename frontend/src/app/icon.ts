import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultFaviconFrame } from "@/lib/favicon";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Built from the active wave's first frame, so a new display default cannot leave a stale icon. §10.3 */
export default async function Icon(): Promise<Response> {
  const file = await readFile(join(process.cwd(), "public", defaultFaviconFrame()));
  // `s-maxage` alone let no browser keep it, and every refetch went to the edge. A day, not
  // `immutable`: the `?hash` follows this file's source, not the active wave's picture. §10.3
  return new Response(new Uint8Array(file), {
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=86400" },
  });
}
