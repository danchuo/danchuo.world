"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { getDrops } from "@/lib/api/client";
import type { FilmDropView } from "@/lib/api/types";
import { PhotoDropModal } from "./PhotoDropModal";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

interface PhotoDropsTileProps {
  style?: CSSProperties;
  className?: string;
}

const monoTertiary = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--text-tertiary)",
} satisfies CSSProperties;

/**
 * Тайл-тизер фото-дропов (D) — PRD §5.12, DESIGN §7.5. Главное — последний дроп (превью +
 * подпись «месяц + название»); слева — список прошлых. Клик по дропу → модалка-галерея.
 * До B1 (загрузка кадров) дропов нет ⇒ тихий empty «пока нет дропов» — борд не ломается.
 */
export function PhotoDropsTile({ style, className }: PhotoDropsTileProps) {
  const { phase, data, retry } = useTileData<FilmDropView[]>(
    useCallback((signal) => getDrops({ signal }), []),
  );
  const drops = data ?? [];
  const isEmpty = phase === "loaded" && drops.length === 0;
  const [openDrop, setOpenDrop] = useState<FilmDropView | null>(null);

  const latest = drops[0];
  const past = drops.slice(1);

  return (
    <>
      <TileShell
        state={isEmpty ? "empty" : phase}
        emptyText="пока нет дропов"
        onRetry={retry}
        label="фото-дропы"
        ariaLabel="Фото-дропы"
        style={style}
        className={className}
      >
        {phase === "loaded" && !isEmpty && latest && (
          <div className="flex h-full gap-3 overflow-hidden">
            {/* Список прошлых дропов (слева, компактно). */}
            {past.length > 0 && (
              <ul className="flex w-1/3 min-w-0 flex-col gap-1 overflow-y-auto">
                {past.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => setOpenDrop(d)}
                      className="flex w-full items-center gap-2 text-left"
                      style={{ background: "none", border: "none", cursor: "pointer" }}
                    >
                      {d.coverPhotoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.coverPhotoUrl} alt="" width={20} height={20} style={{ flexShrink: 0, borderRadius: "var(--radius-sm)" }} />
                      )}
                      <span className="truncate" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        {d.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Последний дроп — крупнее, кликабелен в модалку. */}
            <button
              type="button"
              onClick={() => setOpenDrop(latest)}
              className="flex min-w-0 flex-1 flex-col gap-1 text-left"
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              {latest.coverPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={latest.coverPhotoUrl}
                  alt=""
                  className="min-h-0 w-full flex-1 object-cover"
                  style={{ borderRadius: "var(--radius-sm)" }}
                />
              ) : (
                <span aria-hidden className="min-h-0 w-full flex-1" style={{ background: "var(--bg-surface-muted)", borderRadius: "var(--radius-sm)" }} />
              )}
              <span className="truncate" style={{ fontSize: 13, color: "var(--text-primary)" }}>
                {latest.title}
              </span>
              {latest.monthLabel && <span style={monoTertiary}>{latest.monthLabel}</span>}
            </button>
          </div>
        )}
      </TileShell>

      {openDrop && (
        <PhotoDropModal
          dropId={openDrop.id}
          title={openDrop.title}
          monthLabel={openDrop.monthLabel}
          onClose={() => setOpenDrop(null)}
        />
      )}
    </>
  );
}
