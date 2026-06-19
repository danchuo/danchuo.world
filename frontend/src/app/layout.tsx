import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { fetchActiveThemeTokens, serializeTokensToCss } from "@/lib/theme";
import "./globals.css";

// Inter — UI/заголовки (§2.2, насыщенности 400/500). JetBrains Mono — цифры/данные/имена дней.
const inter = Inter({ subsets: ["latin", "cyrillic"], weight: ["400", "500"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin", "cyrillic"], weight: ["400"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "danchuo.world",
  description: "Дашборд жизни со статистикой и визитная карточка.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // SSR-инжект токенов активной волны в <head> (M4, DESIGN §10) — без вспышки. Бэк недоступен
  // или нет активной волны ⇒ tokens=null ⇒ остаёмся на дефолтах globals.css (graceful).
  const tokens = await fetchActiveThemeTokens();

  return (
    <html lang="ru" className={`${inter.variable} ${jetbrains.variable}`}>
      <head>
        {tokens && (
          // Переопределяет :root-дефолты globals.css значениями активной волны из БД.
          <style id="wave-tokens" dangerouslySetInnerHTML={{ __html: serializeTokensToCss(tokens) }} />
        )}
      </head>
      <body>
        {children}
        <AnalyticsBeacon />
      </body>
    </html>
  );
}
