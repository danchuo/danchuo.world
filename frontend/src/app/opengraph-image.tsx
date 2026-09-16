import { ImageResponse } from "next/og";

/** Use PNG for social previews and Latin text supported by the default font. PRD §12. */
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
