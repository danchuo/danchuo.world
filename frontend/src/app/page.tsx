import { Board } from "@/components/Board";

/**
 * Главная — публичный борд (PRD §12 M2). Сам борд тянет данные на клиенте (per-tile
 * состояния, DESIGN §7: общего спиннера нет), поэтому страница — тонкая оболочка.
 */
export default function HomePage() {
  return <Board />;
}
