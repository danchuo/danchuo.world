import { ImageResponse } from "next/og";

/**
 * OG-картинка соцпревью (PRD §12 M5). Генерится `next/og` в PNG (соцсети не рендерят SVG).
 * Текст — латиницей: дефолтный шрифт `next/og` без кириллицы рисовал бы тофу, а грузить
 * шрифт ради превью — лишняя зависимость. Minimal by owner's request: only the domain,
 * centered on plain white — no tagline, no decor.
 */
export const alt = "danchuo.world";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          color: "#211a16",
        }}
      >
        <div style={{ display: "flex", fontSize: 110, letterSpacing: -2 }}>danchuo.world</div>
      </div>
    ),
    { ...size },
  );
}
