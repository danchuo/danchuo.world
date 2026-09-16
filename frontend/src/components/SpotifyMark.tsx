import type { CSSProperties } from "react";
import { coverPlate } from "@/lib/coverPlate";

/**
 * The Spotify mark, a component of its own rather than a glyph in [Icon] because it is two-tone by
 * nature. Colours come from context, as the brand rule depends on the backdrop: green is allowed
 * ONLY on black or white, monochrome anywhere else. Hidden by default; a skin turns it on. §7.5
 */
export function SpotifyMark({
  size = 18,
  /**
   * The mark's class. The default `.spotify-mark` is the seam that is off in the base. Inside the
   * fallback cover [CoverPlate] the mark must be visible under any wave (or the plate is just a
   * coloured square), so it passes its own class.
   */
  className = "spotify-mark",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      /* ⚠️ A viewBox with padding rather than `0 0 24 24`: the mark's disc is `r=12` from centre
         `12,12`, so it TOUCHES all four edges of the frame, and rasterising clipped the tangent
         pixels. Half a step of padding gives the circle its whole edge; the arcs are untouched. */
      viewBox="-0.6 -0.6 25.2 25.2"
      role="img"
      aria-label="Spotify"
      style={{ flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="12" fill="currentColor" />
      {/* The three arcs are FILLED to the mark's real geometry rather than stroked by estimate. A
          round-capped stroke draws an arc of constant thickness, while the mark's arcs taper to
          nothing; at 16px that read as a soapy edge. */}
      <g fill="var(--spotify-mark-hole, #121212)">
        <path d="M17.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02" />
        <path d="M18.961 14.04c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2" />
        <path d="M19.081 10.68C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3" />
      </g>
    </svg>
  );
}

/**
 * The fallback cover: the Spotify mark on its brand field, used wherever an image is missing. CSS
 * paints it by `[data-plate]` so the arcs take the plate's BACKGROUND colour and read as cut out
 * of the disc. The side travels as a variable, or an inline width would outrank the skin. §7.1
 */
export function CoverPlate({ seed, size }: { seed: string | null; size: number }) {
  return (
    <span
      className="cover-plate"
      data-plate={coverPlate(seed)}
      style={{ "--cover-plate-size": `${size}px` } as CSSProperties}
      aria-hidden
    >
      {/* The mark takes a little over half the side: Spotify's guidelines require clear space
          around the logo, so it must not stand flush to the square's edge. */}
      <SpotifyMark size={Math.round(size * 0.54)} className="plate-mark" />
    </span>
  );
}
