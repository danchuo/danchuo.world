"use client";

import { useId, useState } from "react";
import { moonLightAzimuth, moonLitPath, moonPhase } from "@/lib/moonPhase";
import { Artifact3D } from "./Artifact3D";
import { useImageReady } from "./useImageReady";

const MOON_R = 6;
const PHOTO_MOON_R = 7;

/**
 * How much of the photograph each side keeps. The lit side is toned DOWN and the shadowed one up:
 * at sign size the photograph's own range reads as a blown highlight beside a hole. DESIGN §7.7
 */
const SURFACE_LIT = 0.8;
const SURFACE_SHADOW = 0.26;

/** The full Moon under the date's phase mask (MIT `miksrv/moon-widget`). DESIGN §7.7 */
export const MOON_PHOTO_SRC = "/assets/sleep/moon-widget.png";

/** The Moon as a body, for the empty night of the echo edition. DESIGN §7.7, §12.5 */
export const MOON_MODEL_SRC = "/assets/3d/the-moon.glb";

/** Night around it, so the terminator is the only light the sphere gets. */
const MOON_AMBIENT = 0.26;

/** Slower than a hand-sized artifact: a body this large turning at the board's pace looks flung. */
const MOON_RPM = 3;

/** Moon rock is dark stone: at studio strength the lit side came out grey rather than lit. */
const MOON_KEY = 3.8;

/* The stage frames by the sphere around the bounding BOX, so a ball comes out √3 smaller than its
   slot. The Moon IS a ball: fitting it by its own radius makes the slot the body, and the halo then
   has an edge to hug instead of a guessed one. DESIGN §7.7 */
const MOON_FIT = 1 / Math.sqrt(3);

/** Engraved moon: gradients and grain, for editions whose graphics are drawn rather than shot. */
function SleepMoonDrawn({ date, className }: { date: string; className: string }) {
  const phase = moonPhase(date);
  const uid = useId().replace(/[^a-z0-9]/gi, "");
  if (!phase) return null;
  const id = (part: string) => `sleep-moon-${uid}-${part}`;
  const lit = moonLitPath(phase.cycle, MOON_R);
  return (
    <svg className={className} viewBox="-8 -8 16 16" aria-hidden data-testid="sleep-moon">
      <defs>
        <radialGradient id={id("dark")} cx="0.78" cy="0.4" r="0.95">
          <stop offset="0" stopColor="var(--text-secondary)" stopOpacity="0.2" />
          <stop offset="0.5" stopColor="var(--text-tertiary)" stopOpacity="0.12" />
          <stop offset="1" stopColor="var(--text-tertiary)" stopOpacity="0.05" />
        </radialGradient>
        <radialGradient id={id("lit")} cx="0.6" cy="0.36" r="0.78">
          <stop offset="0" stopColor="var(--text-secondary)" stopOpacity="0.82" />
          <stop offset="0.42" stopColor="var(--text-secondary)" stopOpacity="0.7" />
          <stop offset="0.72" stopColor="var(--text-secondary)" stopOpacity="0.58" />
          <stop offset="1" stopColor="var(--text-tertiary)" stopOpacity="0.46" />
        </radialGradient>
        <filter id={id("mare")} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.3" numOctaves="3" seed="7" stitchTiles="stitch" result="noise" />
          <feColorMatrix in="noise" type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="linear" slope="0.35" intercept="0" />
            <feFuncG type="linear" slope="0.35" intercept="0" />
            <feFuncB type="linear" slope="0.42" intercept="0" />
          </feComponentTransfer>
        </filter>
        <clipPath id={id("clip")}><path d={lit} /></clipPath>
      </defs>
      <g className="sleep-echo__moon-body" transform={phase.waxing ? undefined : "scale(-1 1)"}>
        <circle className="sleep-echo__moon-disc" r={MOON_R} fill={`url(#${id("dark")})`} />
        <path className="sleep-echo__moon-lit" d={lit} fill={`url(#${id("lit")})`} />
        <rect
          className="sleep-echo__moon-mare"
          x={-MOON_R}
          y={-MOON_R}
          width={MOON_R * 2}
          height={MOON_R * 2}
          filter={`url(#${id("mare")})`}
          clipPath={`url(#${id("clip")})`}
        />
        <circle className="sleep-echo__moon-limb" r={MOON_R} />
      </g>
    </svg>
  );
}

/**
 * The photographed Moon under the date's phase mask. The near side never turns, so ONLY the
 * terminator mirrors on a waning night — mirroring the photograph with it would move the maria.
 */
function SleepMoonPhoto({ date, className }: { date: string; className: string }) {
  const phase = moonPhase(date);
  const uid = useId().replace(/[^a-z0-9]/gi, "");
  if (!phase) return null;
  const id = (part: string) => `sleep-moon-photo-${uid}-${part}`;
  const lit = moonLitPath(phase.cycle, PHOTO_MOON_R);
  const mirror = phase.waxing ? undefined : "scale(-1 1)";
  const surface = (opacity: number) => (
    <image
      href={MOON_PHOTO_SRC}
      x={-PHOTO_MOON_R}
      y={-PHOTO_MOON_R}
      width={PHOTO_MOON_R * 2}
      height={PHOTO_MOON_R * 2}
      opacity={opacity}
      clipPath={`url(#${id("disc")})`}
      preserveAspectRatio="xMidYMid slice"
    />
  );

  return (
    <svg className={className} viewBox="-8 -8 16 16" aria-hidden data-testid="sleep-moon-photo">
      <defs>
        <clipPath id={id("disc")}>
          <circle r={PHOTO_MOON_R} />
        </clipPath>
        <clipPath id={id("lit")}>
          <path d={lit} transform={mirror} />
        </clipPath>
        {/* Earthshine: the shadowed side is lightest along the lit limb and sinks away from it. */}
        <radialGradient id={id("dark")} cx="0.76" cy="0.38" r="0.92">
          <stop offset="0" stopColor="var(--sleep-moon-shadow-lit, color-mix(in srgb, var(--text-secondary) 23%, var(--bg-page)))" />
          <stop offset="1" stopColor="var(--sleep-moon-shadow, color-mix(in srgb, var(--text-secondary) 10%, var(--bg-page)))" />
        </radialGradient>
        {/* Limb darkening keeps the lit side a sphere: without it the photograph reads as a disc
            cut from paper, because its own edge is already burnt out. */}
        <radialGradient id={id("shade")} cx="0.58" cy="0.34" r="0.78">
          <stop offset="0.55" stopColor="var(--bg-page)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--bg-page)" stopOpacity="0.5" />
        </radialGradient>
      </defs>
      {/* Cast by the LIT shape but laid UNDER the body: over the moon the blur washed the shadowed
          side half-lit, so only the spill past the limb survives. ⚠️ The clip sits on the INNER
          group — on the filtered one it lands after the filter (docs/pitfalls.md). DESIGN §7.7 */}
      <g className="sleep-moon__glow">
        <g clipPath={`url(#${id("lit")})`}>
          <circle r={PHOTO_MOON_R} />
        </g>
      </g>
      {/* The body in SHADOW, opaque: the moon is a sphere lit from one side, not a hole in the
          tile, and through a transparent dark side the sounding behind it showed as texture. */}
      <circle className="sleep-moon__shadow" r={PHOTO_MOON_R} fill={`url(#${id("dark")})`} transform={mirror} />
      {surface(SURFACE_SHADOW)}
      <g className="sleep-moon__lit" clipPath={`url(#${id("lit")})`}>
        {surface(SURFACE_LIT)}
        <circle r={PHOTO_MOON_R} fill={`url(#${id("shade")})`} transform={mirror} />
      </g>
      <circle className="sleep-moon__limb" r={PHOTO_MOON_R} />
    </svg>
  );
}

/**
 * The Moon as a real sphere. The phase is not a mask here but the DIRECTION OF THE LIGHT: lit from
 * where the sun actually stands, a ball shows the same crescent by itself. DESIGN §7.7
 */
function SleepMoonModel({ date, className }: { date: string; className: string }) {
  const phase = moonPhase(date);
  const [settled, setSettled] = useState<boolean | null>(null);
  if (!phase) return null;
  // No WebGL, no file: the photographed Moon is a complete answer and the night keeps its mark.
  if (settled === false) return <SleepMoonPhoto date={date} className={className} />;
  const azimuth = moonLightAzimuth(phase.cycle);
  return (
    <span
      className={`${className} sleep-empty__moon--model`}
      data-testid="sleep-moon-model"
      /* Lit only once the body is actually up: a day switched to an empty night otherwise showed
         an empty box first and the Moon a moment later, which reads as a jump, not a change. */
      data-ready={settled ? "" : undefined}
    >
      <Artifact3D
        src={MOON_MODEL_SRC}
        className="h-full w-full"
        rpm={MOON_RPM}
        padding={MOON_FIT}
        light={{ azimuth, ambient: MOON_AMBIENT, intensity: MOON_KEY }}
        onSettled={setSettled}
      />
    </span>
  );
}

/**
 * Shared moon mark. `textured` takes the photograph (DESIGN §7.7) and waits for it: a moon drawn
 * before its bitmap arrives appears as an empty outline and fills in front of the reader.
 */
export function SleepMoon({
  date,
  className = "sleep-echo__moon",
  textured = false,
}: {
  date: string;
  className?: string;
  textured?: boolean;
}) {
  const ready = useImageReady(MOON_PHOTO_SRC);
  if (!textured) return <SleepMoonDrawn date={date} className={className} />;
  if (!ready) return null;
  return <SleepMoonPhoto date={date} className={className} />;
}

/**
 * One empty composition for both cases. The echo edition's Moon is a BODY: the night has no data
 * to draw, and the mark standing in for it may as well be the thing itself. DESIGN §7.7
 */
export function SleepNoData({ date, textured = false }: { date?: string; textured?: boolean }) {
  return (
    <div data-testid="sleep-empty" className="sleep-empty flex h-full items-center justify-center">
      {date &&
        (textured ? (
          <SleepMoonModel date={date} className="sleep-empty__moon" />
        ) : (
          <SleepMoon date={date} className="sleep-empty__moon" />
        ))}
    </div>
  );
}
