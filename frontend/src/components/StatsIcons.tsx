/**
 * Metric icons for the stats tile: pixel PNGs extracted from the owner's mock-up. The steps shoe is
 * baked onto the tile's light surface while the months stay transparent. Fixed colours rather than
 * tokens — this is wave 01's own set. Replacing an asset means bumping [V]. DESIGN §12.4
 */

const BASE = "/assets/waves/wave-01/stats";
const V = "1";

/**
 * A pixel icon from a PNG: height in px, width by natural ratio, crisp. ⚠️ A real `img`, not a
 * background on an empty span — in mobile Safari the bed's background never painted, and an
 * element with actual content also cannot be squeezed to nothing by a narrow flex row.
 */
function PixelImg({ src, height, aspect }: { src: string; height: number; aspect: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${src}?v=${V}`}
      alt=""
      aria-hidden
      width={Math.round(height * aspect)}
      height={height}
      style={{
        display: "inline-block",
        flexShrink: 0,
        objectFit: "contain",
        imageRendering: "pixelated",
      }}
    />
  );
}

/** A trainer from the side — "steps". */
export function StepsIcon({ height = 16 }: { height?: number }) {
  return <PixelImg src={`${BASE}/sneaker.png`} height={height} aspect={336 / 312} />;
}

/** A dark crescent — "sleep" (the stats label). */
export function SleepIcon({ height = 15 }: { height?: number }) {
  return <PixelImg src={`${BASE}/moon.png`} height={height} aspect={1} />;
}

/** An orange crescent with "Zz" — the large sleep widget icon (§7.7). */
export function SleepBigIcon({ height = 28 }: { height?: number }) {
  return <PixelImg src={`${BASE}/moon-zzz.png`} height={height} aspect={728 / 632} />;
}

/** A pixel bed — the "sleep" empty state (§7.7). */
export function BedIcon({ height = 60 }: { height?: number }) {
  return <PixelImg src={`${BASE}/bed.png`} height={height} aspect={621 / 441} />;
}
