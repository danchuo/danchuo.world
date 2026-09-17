import { useId } from "react";
import { moonLitPath, moonPhase } from "@/lib/moonPhase";

const MOON_R = 6;

/** Shared moon mark. useId keeps its SVG paint references unique across concurrent layouts. */
export function SleepMoon({ date, className = "sleep-echo__moon" }: { date: string; className?: string }) {
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

/** One moon for both empty cases: no sleep and no stored chunks. DESIGN §7.7. */
export function SleepNoData({ date }: { date?: string }) {
  return (
    <div data-testid="sleep-empty" className="sleep-empty flex h-full items-center justify-center">
      {date && <SleepMoon date={date} className="sleep-empty__moon" />}
    </div>
  );
}
