"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { getDrops } from "@/lib/api/client";
import { mediaUrl } from "@/lib/api/media";
import type { FilmDropView } from "@/lib/api/types";
import { PhotoDropModal } from "./PhotoDropModal";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

interface PhotoDropsTileProps {
  style?: CSSProperties;
  className?: string;
}

/**
 * Компактная лента фото-дропов (D) — PRD §5.12, DESIGN §7.5. Маленькое перечисление всех дропов
 * (обложка + название), новые слева; клик по дропу → модалка-галерея. Сама лента и есть архив —
 * отдельной страницы нет. Крупно последний дроп показывает отдельный [LatestDropTile]. До первой
 * загрузки через /admin дропов нет ⇒ тихий empty «пока нет дропов».
 */
export function PhotoDropsTile({ style, className }: PhotoDropsTileProps) {
  const { phase, data, retry } = useTileData<FilmDropView[]>(
    useCallback((signal) => getDrops({ signal }), []),
    "drops",
  );
  const drops = data ?? [];
  const isEmpty = phase === "loaded" && drops.length === 0;
  const [openDrop, setOpenDrop] = useState<FilmDropView | null>(null);

  return (
    <>
      <TileShell
        state={isEmpty ? "empty" : phase}
        emptyText="пока нет дропов"
        onRetry={retry}
        label="дропы"
        ariaLabel="Фото-дропы"
        style={style}
        className={className}
      >
        {phase === "loaded" && !isEmpty && (
          <ul className="flex h-full flex-col gap-1.5 overflow-y-auto">
            {drops.map((d) => (
              <li key={d.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => setOpenDrop(d)}
                  className="flex w-full items-center gap-2 text-left"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  aria-label={`Открыть дроп «${d.title}»`}
                >
                  {d.coverPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mediaUrl(d.coverPhotoUrl)}
                      alt=""
                      width={32}
                      height={32}
                      style={{ flexShrink: 0, width: 32, height: 32, objectFit: "cover", borderRadius: "var(--radius-sm)" }}
                    />
                  ) : (
                    <span aria-hidden style={{ flexShrink: 0, width: 32, height: 32, background: "var(--bg-surface-muted)", borderRadius: "var(--radius-sm)" }} />
                  )}
                  <span className="min-w-0 flex-1 truncate" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {d.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
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
