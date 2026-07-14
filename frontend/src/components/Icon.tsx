import type { CSSProperties, ReactNode } from "react";

export type IconName = "close" | "rotate" | "help" | "external" | "star";

/**
 * Символьный набор волны 01 (DESIGN §12): чистые line-глифы, красятся `currentColor` —
 * следуют за цветом текста / токеном волны, как соц-иконки, но инлайном (лучше маски для
 * кнопок с ховером/состоянием). Один SVG на символ, viewBox 24×24. Стиль выбран владельцем
 * («clarity > pixel-craft»): для функциональных кнопок line читается лучше пикселя.
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
