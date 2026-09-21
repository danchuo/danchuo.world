import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Jersey_10, Manrope, IBM_Plex_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { FaviconSpinner } from "@/components/FaviconSpinner";
import { FONT_GATE_SCRIPT } from "@/lib/fontGate";
import { WAVE_COOKIE, decodeWaveCookie } from "@/lib/waveCookie";
import { resolveDisplayWave } from "@/lib/waves";
import { serializeTokensToCss } from "@/lib/waves/tokens";
import "./globals.css";

// Inter for UI/headings; JetBrains Mono for numbers and day names. DESIGN §2.2.
const inter = Inter({ subsets: ["latin", "cyrillic"], weight: ["400", "500"], variable: "--font-inter" });
// Load a real 600 weight: synthetic bold changes the width of monospace digits.
const jetbrains = JetBrains_Mono({ subsets: ["latin", "cyrillic"], weight: ["400", "600"], variable: "--font-jetbrains" });
// Jersey 10 is enabled by wave-02's display token. DESIGN §10.2.
const jersey = Jersey_10({ subsets: ["latin"], weight: ["400"], variable: "--font-jersey" });
// Wave-02 switches to Manrope and IBM Plex Mono via its skin tokens. DESIGN §10.2.
const manrope = Manrope({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600", "700"], variable: "--font-manrope" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600"], variable: "--font-plex-mono" });

// Absolute metadata URLs are required by social previews; override SITE_URL for local or preview builds.
const SITE_URL = process.env.SITE_URL ?? "https://danchuo.world";

// Social previews show only the domain and OG image; omit description and author metadata.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "danchuo.world",
  applicationName: "danchuo.world",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "danchuo.world",
    title: "danchuo.world",
    url: "/",
    locale: "ru_RU",
  },
  twitter: {
    card: "summary_large_image",
    title: "danchuo.world",
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // SSR resolves the visitor's wave before the owner's default; waves are local, so this costs no I/O. DESIGN §10.
  const wave = resolveDisplayWave(decodeWaveCookie((await cookies()).get(WAVE_COOKIE)?.value));

  return (
    // The font gate sets data-fonts before hydration; suppress this expected root-attribute mismatch. DESIGN §7.10.
    <html suppressHydrationWarning lang="ru" data-wave={wave.key} className={`${inter.variable} ${jetbrains.variable} ${jersey.variable} ${manrope.variable} ${plexMono.variable}`}>
      <head>
        {/* The font gate (DESIGN §8.3) stands FIRST in the head and before the markup: from a
            React effect it would run after the first paint, and the board would flash in the
            system typeface — exactly what the gate cures. */}
        <script dangerouslySetInnerHTML={{ __html: FONT_GATE_SCRIPT }} />
        {/* Override the CSS defaults with the resolved wave's tokens. */}
        <style id="wave-tokens" dangerouslySetInnerHTML={{ __html: serializeTokensToCss(wave.tokens) }} />
      </head>
      <body>
        {children}
        {/* Spins the Earth in the tab icon for the active wave (DESIGN §10.3). It renders nothing;
            the static planet `app/icon.png` remains if JS or canvas are unavailable. */}
        <FaviconSpinner />
        <AnalyticsBeacon />
      </body>
    </html>
  );
}
