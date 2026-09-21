/**
 * Wave 01 "Studio / Peach" — the base wave: its palette is also the fallback in
 * `app/styles/waves/wave-01.css`, and it takes the default board of `layout.ts` whole. DESIGN §10.2
 */

import type { Wave } from "./index";

export const WAVE_01: Wave = {
  key: "wave-01",
  name: "Волна 01 «Студия / Персик»",
  releasedAt: "2026-07-08",
  tokens: {
    "accent": "#e2604c",
    "accent-clean": "#5f9e52",
    "accent-code": "#5f9e52",
    "accent-warm": "#f4a52a",
    "bg-page": "#fdefe7",
    "bg-surface": "#ffffff",
    "bg-surface-2": "#fffbf8",
    "bg-surface-muted": "#f3e6de",
    "border": "rgba(33, 26, 22, 0.1)",
    "border-pixel": "#211a16",
    "border-tile": "#d58b69",
    "cal-month-line": "#d58b69",
    "cal-weekend": "#ecdbd0",
    "danger": "#d2553f",
    "drop-2": "drop-shadow(2px 2px 1px rgba(83, 49, 27, 0.1)) drop-shadow(5px 7px 10px rgba(83, 49, 27, 0.2))",
    "drop-3": "drop-shadow(2px 3px 1px rgba(83, 49, 27, 0.12)) drop-shadow(8px 12px 16px rgba(83, 49, 27, 0.24))",
    "drop-4": "drop-shadow(3px 4px 2px rgba(83, 49, 27, 0.14)) drop-shadow(12px 17px 24px rgba(83, 49, 27, 0.26))",
    "elev-1": "0 1px 2px rgba(33, 26, 22, 0.05)",
    "elev-2": "0 1px 2px rgba(33, 26, 22, 0.04), 0 6px 14px rgba(33, 26, 22, 0.06), 0 14px 30px rgba(33, 26, 22, 0.05)",
    "elev-3": "0 2px 4px rgba(33, 26, 22, 0.05), 0 10px 22px rgba(33, 26, 22, 0.08), 0 24px 48px rgba(33, 26, 22, 0.07)",
    "font-display": "var(--font-mono)",
    "pixel-corners": "polygon(0 10px, 5px 10px, 5px 5px, 10px 5px, 10px 0, calc(100% - 10px) 0, calc(100% - 10px) 5px, calc(100% - 5px) 5px, calc(100% - 5px) 10px, 100% 10px, 100% calc(100% - 10px), calc(100% - 5px) calc(100% - 10px), calc(100% - 5px) calc(100% - 5px), calc(100% - 10px) calc(100% - 5px), calc(100% - 10px) 100%, 10px 100%, 10px calc(100% - 5px), 5px calc(100% - 5px), 5px calc(100% - 10px), 0 calc(100% - 10px))",
    "px": "4px",
    "radius-lg": "16px",
    "radius-md": "10px",
    "radius-sm": "6px",
    "success": "#3e9d77",
    "surface-fill": "linear-gradient(180deg, #ffffff 0%, #fffdfb 35%, #fff5ee 100%)",
    "surface-othermonth": "linear-gradient(180deg, #fdf6f1, #f6ece4)",
    "text-primary": "#211a16",
    "text-secondary": "#6e635c",
    "text-tertiary": "#756a61",
    "tile-depth": "6px",
    "tile-inner": "1.5px",
    "tile-inner-color": "#fff3e7",
    "tile-line": "2px",
    "tile-slab-1": "#efc8b2",
    "tile-slab-2": "#dfa083",
  },
};
