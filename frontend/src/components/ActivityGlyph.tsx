/** Line pictograms for the activity cards that have no 3D figure; drawn in `currentColor`. DESIGN §4.3 */

const GLYPHS: Readonly<Record<string, React.ReactNode>> = {
  squash: (
    <>
      <ellipse cx="19" cy="17" rx="10" ry="13" transform="rotate(-35 19 17)" />
      <path d="M13 21 L23 12 M11 16 L20 8 M16 26 L27 17" opacity="0.45" />
      <path d="M26 27 L38 41" strokeWidth="3.4" />
      <circle cx="37" cy="14" r="3" fill="currentColor" />
    </>
  ),
  badminton: (
    <>
      <path d="M17 8 L31 8 L28 30 L20 30 Z" />
      <path d="M21 8 L22.5 30 M27 8 L25.5 30 M18.5 18 L29.5 18" opacity="0.45" />
      <path d="M20 30 Q20 39 24 39 Q28 39 28 30" fill="currentColor" />
    </>
  ),
  gym: (
    <>
      <path d="M14 24 L34 24" strokeWidth="3.4" />
      <rect x="9" y="15" width="5" height="18" rx="1.5" />
      <rect x="34" y="15" width="5" height="18" rx="1.5" />
      <path d="M5 19 L5 29 M43 19 L43 29" />
    </>
  ),
  pullups: (
    <>
      <path d="M6 42 L6 8 L42 8 L42 42" opacity="0.45" />
      <path d="M6 8 L42 8" strokeWidth="3" />
      <circle cx="24" cy="18" r="3.4" />
      <path d="M17 8 L20 16 M31 8 L28 16 M24 22 L24 33 M24 33 L20 41 M24 33 L28 41" />
    </>
  ),
  dips: (
    <>
      <path d="M8 26 L20 26 M28 26 L40 26" strokeWidth="3" />
      <path d="M10 26 L10 44 M38 26 L38 44" opacity="0.45" />
      <circle cx="24" cy="12" r="3.4" />
      <path d="M24 16 L24 32 M24 19 L19 26 M24 19 L29 26 M24 32 L22 41 M24 32 L27 40" />
    </>
  ),
  pushups: (
    <>
      <path d="M4 38 L44 38" opacity="0.45" />
      <circle cx="37" cy="20" r="3.4" />
      <path d="M33 23 L9 34 M31 24 L31 38 M9 34 L7 38" />
    </>
  ),
};

export function hasActivityGlyph(key: string): boolean {
  return key in GLYPHS;
}

export function ActivityGlyph({ activity, className }: { activity: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {GLYPHS[activity]}
    </svg>
  );
}
