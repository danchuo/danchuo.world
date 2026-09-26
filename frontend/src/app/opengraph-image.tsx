import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { WAVE_03 } from "@/lib/waves/wave-03";

/** Use PNG for social previews and Latin text supported by the embedded font. PRD §12. */
export const alt = "danchuo.world";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The board's mono face; satori reads woff, not woff2. Prerendered, so this runs at build time. */
function font(weight: 700): Promise<Buffer> {
  return readFile(join(process.cwd(), `node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-${weight}-normal.woff`));
}

/** A one-off snapshot of PRIME's ribbon: the live one needs the API, and a preview is built once. PRD §12 */
async function ground(): Promise<string> {
  const jpg = await readFile(join(process.cwd(), "public/og/prime-ground.jpg"));
  return `data:image/jpeg;base64,${jpg.toString("base64")}`;
}

/** A hex token with an alpha byte: glow layers fade the accent rather than bring a colour of their own. */
const alpha = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;

/** Dressed in PRIME to match its snapshot, whichever wave is active. PRD §12 */
export default async function OpengraphImage() {
  const { tokens } = WAVE_03;
  const accent = tokens["accent"];
  const ink = tokens["text-primary"];
  const page = tokens["bg-page"];
  const [bold, bg] = await Promise.all([font(700), ground()]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: page,
          backgroundImage: `radial-gradient(38% 30% at 50% 50%, ${alpha(page, 0.82)} 0%, ${alpha(page, 0.5)} 55%, ${alpha(page, 0)} 100%), url(${bg})`,
          backgroundSize: "100% 100%",
          fontFamily: "JetBrains Mono",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 112,
            fontWeight: 700,
            letterSpacing: -4,
            color: ink,
            textShadow: `0 0 5px ${alpha(accent, 0.4)}, 0 0 22px ${alpha(accent, 0.3)}, 0 0 56px ${alpha(accent, 0.22)}`,
          }}
        >
          danchuo
          <span style={{ color: accent, textShadow: `0 0 8px ${alpha(accent, 0.65)}, 0 0 28px ${alpha(accent, 0.48)}, 0 0 72px ${alpha(accent, 0.32)}` }}>
            .world
          </span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "JetBrains Mono", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
