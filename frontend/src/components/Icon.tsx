import type { CSSProperties, ReactNode } from "react";

export type IconName = "close" | "rotate" | "help" | "external" | "star" | "zoom";

/**
 * The wave's symbol set: clean line glyphs painted by `currentColor`, so they follow the text
 * colour like the social icons but stay inline, which beats masks for buttons with hover states.
 * One SVG per symbol on a 24x24 viewBox. DESIGN §12
 */
const RENDER: Record<IconName, { stroked: boolean; body: ReactNode }> = {
  close: { stroked: true, body: <path d="M7 7l10 10M17 7L7 17" /> },
  rotate: {
    stroked: true,
    body: (
      <>
        <path d="M19 12a7 7 0 1 1-2.1-5" />
        <path d="M17 3v4.2h-4.2" />
      </>
    ),
  },
  help: {
    stroked: true,
    body: (
      <>
        <path d="M8.6 9a3.4 3.4 0 1 1 4.6 3.2c-1.1.5-1.7 1.2-1.7 2.4" />
        <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
      </>
    ),
  },
  external: {
    stroked: true,
    body: (
      <>
        <path d="M15 4h5v5" />
        <path d="M20 4l-8 8" />
        <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
      </>
    ),
  },
  // A magnifier with a plus: "open larger". The plus is a short cross inside the lens, still
  // readable at 14–16px; without it the glyph is confused with search.
  zoom: {
    stroked: true,
    body: (
      <>
        <circle cx="11" cy="11" r="6" />
        <path d="M15.5 15.5L20 20" />
        <path d="M11 8.6v4.8M8.6 11h4.8" />
      </>
    ),
  },
  star: {
    stroked: false,
    body: <path d="M12 3.2l2.6 5.6 6.1.6-4.6 4 1.4 6-5.5-3.2-5.5 3.2 1.4-6-4.6-4 6.1-.6z" />,
  },
};

export function Icon({
  name,
  size = 20,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const { stroked, body } = RENDER[name];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      focusable={false}
      fill={stroked ? "none" : "currentColor"}
      stroke={stroked ? "currentColor" : "none"}
      strokeWidth={stroked ? 2 : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
    >
      {body}
    </svg>
  );
}
