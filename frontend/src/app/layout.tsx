import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Jersey_10, Manrope, IBM_Plex_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { FaviconSpinner } from "@/components/FaviconSpinner";
import { FONT_GATE_SCRIPT } from "@/lib/fontGate";
import { fetchDisplayTheme, serializeTokensToCss } from "@/lib/theme";
import { WAVE_COOKIE, decodeWaveCookie } from "@/lib/waveCookie";
import "./globals.css";

// Inter — UI/заголовки (§2.2, насыщенности 400/500). JetBrains Mono — цифры/данные/имена дней.
const inter = Inter({ subsets: ["latin", "cyrillic"], weight: ["400", "500"], variable: "--font-inter" });
// 600 — для мест, где цифра обязана весить больше подписи рядом (проценты на карточке книги,
// §5.16). Без настоящего начертания браузер синтезировал бы жирность, и моноширинные цифры
// поплыли бы по ширине.
const jetbrains = JetBrains_Mono({ subsets: ["latin", "cyrillic"], weight: ["400", "600"], variable: "--font-jetbrains" });
// Jersey 10 — чанковый пиксельный дисплей-шрифт волны 02 «Obscura» (DESIGN §10.2). Грузится
// глобально (next/font), но через токен --font-display проявляется только на активной волне 02;
// на волне 01 --font-display = mono, так что начертание остаётся прежним.
const jersey = Jersey_10({ subsets: ["latin"], weight: ["400"], variable: "--font-jersey" });
// Шрифты волны 02 «Obscura» (DESIGN §10.2): Manrope — UI-текст (primary-шрифт Obscura),
// IBM Plex Mono — данные/цифры. Грузятся глобально, но включаются только под data-wave="wave-02"
// (скин переопределяет --font-sans/--font-mono). Cyrillic-сабсет — для русских подписей.
const manrope = Manrope({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600", "700"], variable: "--font-manrope" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600"], variable: "--font-plex-mono" });

// Базовый URL сайта для абсолютных ссылок в OG/canonical/sitemap (PRD §12 M5). Прод —
// домен; локально/в превью переопределяется env. metadataBase делает OG-картинку и
// canonical абсолютными (соцсети требуют абсолютный URL картинки).
const SITE_URL = process.env.SITE_URL ?? "https://danchuo.world";

// Minimal social preview by owner's request: no description/author meta at all — messengers
// (Telegram etc.) should show only the domain and the OG image, no extra text lines.
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
  // SSR token inject into <head> (M4, DESIGN §10) — no flash. The rendered wave is the
  // visitor's cookie pick when present, otherwise the owner's active wave. Backend down or
  // no wave ⇒ tokens=null ⇒ stay on globals.css defaults (graceful).
  const preferredWave = decodeWaveCookie((await cookies()).get(WAVE_COOKIE)?.value);
  const theme = await fetchDisplayTheme(preferredWave);
  const tokens = theme?.tokens ?? null;

  return (
    // data-wave — ключ активной волны на <html>: помимо цвет-токенов волна может нести
    // СВОЙ СКИН (рамки/фон/декор/шрифт) — CSS под `[data-wave="…"]` в globals.css (DESIGN §10.2).
    // SSR ставит ключ владельца; переключатель волн меняет его вживую (WaveProvider).
    // suppressHydrationWarning — про `data-fonts`: его ставят ВОРОТА ШРИФТА (ниже) ещё до
    // гидрации, поэтому серверная разметка и живой <html> расходятся по этому атрибуту
    // заведомо. Иначе React репортит это ошибкой на каждой загрузке в деве и глушит собой
    // настоящие расхождения.
    <html suppressHydrationWarning lang="ru" data-wave={theme?.key ?? undefined} className={`${inter.variable} ${jetbrains.variable} ${jersey.variable} ${manrope.variable} ${plexMono.variable}`}>
      <head>
        {/* Ворота шрифта (DESIGN §8.3). Стоят ПЕРВЫМИ в голове и до разметки: из эффекта
            React они выполнились бы уже после первой отрисовки, и борд успел бы мелькнуть
            системным начертанием — ровно то, что ворота и лечат. */}
        <script dangerouslySetInnerHTML={{ __html: FONT_GATE_SCRIPT }} />
        {tokens && (
          // Переопределяет :root-дефолты globals.css значениями активной волны из БД.
          <style id="wave-tokens" dangerouslySetInnerHTML={{ __html: serializeTokensToCss(tokens) }} />
        )}
      </head>
      <body>
        {children}
        {/* Крутит Землю в иконке вкладки по активной волне (DESIGN §10.3). Ничего не рендерит;
            статическая планета `app/icon.png` остаётся, если JS/канвас недоступны. */}
        <FaviconSpinner />
        <AnalyticsBeacon />
      </body>
    </html>
  );
}
