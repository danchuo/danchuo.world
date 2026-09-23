import { ImageResponse } from "next/og";
import { ACTIVE_WAVE } from "@/lib/waves";

/** Use PNG for social previews and Latin text supported by the default font. PRD §12. */
export const alt = "danchuo.world";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Dressed in the display-default wave: a preview is the site's first look, so it wears the same. */
export default function OpengraphImage() {
  const { tokens } = ACTIVE_WAVE;
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
          color: tokens["accent"],
        }}
      >
        <div style={{ display: "flex", fontSize: 110, letterSpacing: -2 }}>danchuo.world</div>
      </div>
    ),
    { ...size },
  );
}
