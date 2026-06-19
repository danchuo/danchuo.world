import { Board } from "@/components/Board";
import { WaveProvider } from "@/components/WaveProvider";
import { fetchActiveTheme } from "@/lib/theme";

/**
 * Главная — публичный борд (PRD §12 M2). Сам борд тянет данные на клиенте (per-tile
 * состояния, DESIGN §7: общего спиннера нет), поэтому страница — тонкая оболочка.
 *
 * Layout активной волны тянем на сервере и кладём в [WaveProvider] начальным значением —
 * борд рисуется сразу в правильной раскладке (без вспышки), а переключатель волн свопает
 * её вживую. Бэк недоступен / нет активной волны ⇒ дефолт `layout.ts` (graceful).
 */
export default async function HomePage() {
  const theme = await fetchActiveTheme();
  return (
    <WaveProvider initialLayout={theme?.layout ?? null} initialActiveKey={theme?.key ?? null}>
      <Board />
    </WaveProvider>
  );
}
