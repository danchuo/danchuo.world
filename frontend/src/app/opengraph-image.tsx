import { ImageResponse } from "next/og";

/**
 * OG-картинка соцпревью (PRD §12 M5). Генерится `next/og` в PNG (соцсети не рендерят SVG).
 * Текст — латиницей: дефолтный шрифт `next/og` без кириллицы рисовал бы тофу, а грузить
 * шрифт ради превью — лишняя зависимость. Палитра — волна 01 (персик/коралл).
 */
export const alt = "danchuo.world — life dashboard";
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
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf1eb",
          color: "#211a16",
        }}
      >
        <div style={{ display: "flex", fontSize: 110, letterSpacing: -2 }}>danchuo.world</div>
        <div style={{ display: "flex", marginTop: 20, fontSize: 38, color: "#6e635c" }}>
          life dashboard
        </div>
        <div style={{ display: "flex", marginTop: 48, gap: 12 }}>
          <div style={{ width: 28, height: 28, background: "#e2604c" }} />
          <div style={{ width: 28, height: 28, background: "#f4a52a" }} />
          <div style={{ width: 28, height: 28, background: "#3e9d77" }} />
        </div>
      </div>
    ),
    { ...size },
  );
}
