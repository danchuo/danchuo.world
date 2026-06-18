import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Inter — UI/заголовки (§2.2, насыщенности 400/500). JetBrains Mono — цифры/данные/имена дней.
const inter = Inter({ subsets: ["latin", "cyrillic"], weight: ["400", "500"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin", "cyrillic"], weight: ["400"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "danchuo.world",
  description: "Дашборд жизни со статистикой и визитная карточка.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${inter.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
