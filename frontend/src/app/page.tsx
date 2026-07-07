import { cookies } from "next/headers";
import { Board } from "@/components/Board";
import { WaveProvider } from "@/components/WaveProvider";
import { fetchDisplayTheme } from "@/lib/theme";
import { WAVE_COOKIE, decodeWaveCookie } from "@/lib/waveCookie";

/**
 * Главная — публичный борд (PRD §12 M2). Сам борд тянет данные на клиенте (per-tile
 * состояния, DESIGN §7: общего спиннера нет), поэтому страница — тонкая оболочка.
 *
 * Layout активной волны тянем на сервере и кладём в [WaveProvider] начальным значением —
 * борд рисуется сразу в правильной раскладке (без вспышки), а переключатель волн свопает
 * её вживую. Бэк недоступен / нет активной волны ⇒ дефолт `layout.ts` (graceful).
 */
export default async function HomePage() {
  // Same wave resolution as the root layout (visitor cookie → owner's active); `cache()`
  // in fetchDisplayTheme keeps it a single backend call per request.
  const preferredWave = decodeWaveCookie((await cookies()).get(WAVE_COOKIE)?.value);
  const theme = await fetchDisplayTheme(preferredWave);
  return (
    <WaveProvider initialLayout={theme?.layout ?? null} initialActiveKey={theme?.key ?? null}>
      <Board />
    </WaveProvider>
  );
}
