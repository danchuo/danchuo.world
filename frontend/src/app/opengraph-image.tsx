import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { ACTIVE_WAVE } from "@/lib/waves";

/** Use PNG for social previews and Latin text supported by the embedded font. PRD §12. */
export const alt = "danchuo.world";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The board's mono face; satori reads woff, not woff2. Prerendered, so this runs at build time. */
function font(weight: 400 | 700): Promise<Buffer> {
  return readFile(join(process.cwd(), `node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-${weight}-normal.woff`));
}

/** A hex token with an alpha byte: glow layers fade the accent rather than bring a colour of their own. */
const alpha = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;

/** Dressed in the display-default wave: a preview is the site's first look, so it wears the same. DESIGN §10.2 */
export default async function OpengraphImage() {
  const { tokens } = ACTIVE_WAVE;
  const accent = tokens["accent"];
  const ink = tokens["text-primary"] ?? "#ffffff";
  const edge = tokens["glass-edge"] ?? alpha(accent, 0.2);
  const [regular, bold] = await Promise.all([font(400), font(700)]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: tokens["bg-page"],
          backgroundImage: tokens["og-ground"],
          fontFamily: "JetBrains Mono",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "58px 84px 54px",
            borderRadius: 32,
            border: `1px solid ${edge}`,
            backgroundColor: tokens["glass-tint"] ?? alpha(accent, 0.06),
            backgroundImage: `linear-gradient(180deg, ${tokens["glass-sheen"] ?? alpha(ink, 0.12)} 0%, rgba(255, 255, 255, 0) 38%)`,
            boxShadow: `0 30px 80px rgba(0, 0, 0, 0.55), 0 0 120px ${alpha(accent, 0.12)}`,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 112,
              fontWeight: 700,
              letterSpacing: -4,
              color: ink,
              textShadow: `0 0 6px ${alpha(accent, 0.55)}, 0 0 28px ${alpha(accent, 0.45)}, 0 0 72px ${alpha(accent, 0.35)}`,
            }}
          >
            danchuo
            <span style={{ color: accent, textShadow: `0 0 10px ${alpha(accent, 0.9)}, 0 0 36px ${alpha(accent, 0.7)}, 0 0 96px ${alpha(accent, 0.5)}` }}>
              .world
            </span>
          </div>
          <div
            style={{
              display: "flex",
              width: 640,
              height: 2,
              marginTop: 26,
              backgroundImage: `linear-gradient(90deg, ${alpha(accent, 0)} 0%, ${accent} 50%, ${alpha(accent, 0)} 100%)`,
              boxShadow: `0 0 18px ${alpha(accent, 0.8)}`,
            }}
          />
          <div style={{ display: "flex", marginTop: 26, fontSize: 28, letterSpacing: 1, color: alpha(ink, 0.62) }}>
            public real-time bento board of my life
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "JetBrains Mono", data: regular, weight: 400, style: "normal" },
        { name: "JetBrains Mono", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
