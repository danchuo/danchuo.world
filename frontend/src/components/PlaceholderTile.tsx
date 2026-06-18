import type { CSSProperties } from "react";
import { TileShell } from "./TileShell";

interface PlaceholderTileProps {
  label: string;
  /** Текст пустоты (§7 Empty) — что появится здесь в следующих эрах. */
  note?: string;
  /** Тайл-надпись (Identity) — рендерим контент, а не пустоту. */
  brand?: boolean;
  style?: CSSProperties;
  className?: string;
}

/**
 * Пустой шов борда (DESIGN §3 — пустые слоты намеренны, не дыры; §7 Empty). Покрывает
 * тайлы будущих эр (музыка/Spotify M3, проекты/соц/hero/marquee/фото-дропы/волны M4+).
 * Каждый живёт в тёплой пустоте, борд не ломается.
 */
export function PlaceholderTile({ label, note, brand = false, style, className }: PlaceholderTileProps) {
  if (brand) {
    return (
      <TileShell state="loaded" ariaLabel={label} style={style} className={className}>
        <div className="flex h-full flex-col justify-center" style={{ fontFamily: "var(--font-mono)" }}>
          <span style={{ fontSize: 18 }}>{label}</span>
          <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>дашборд жизни</span>
        </div>
      </TileShell>
    );
  }

  return (
    <TileShell
      state="empty"
      label={label}
      emptyText={note ?? "скоро"}
      muted
      ariaLabel={label}
      style={style}
      className={className}
    />
  );
}
