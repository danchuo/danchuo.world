"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { getArtifacts } from "@/lib/api/client";
import type { ArtifactView } from "@/lib/api/types";
import type { TileOrientation } from "@/lib/layout";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

interface ArtifactMarqueeProps {
  style?: CSSProperties;
  className?: string;
  /**
   * Направление ленты — задаётся волной через layout (`tiles.marquee.orientation`,
   * DESIGN §10.1). `vertical` — колонка, едет вверх; дефолт — горизонтальная строка.
   */
  orientation?: TileOrientation;
}

const RU_MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** «2026-01-15» → «15 января 2026» (парсим по частям — без tz-сдвига от `new Date`). */
function formatFirstMentioned(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${RU_MONTHS[m - 1]} ${y}`;
}

/**
 * Marquee артефактов (M) — PRD §5.8, DESIGN §7.2. Бесконечная бегущая строка PNG/GIF + подпись;
 * в самой строке даты нет. Ховер/тап/фокус по артефакту → поповер: увеличенная картинка +
 * название + мельче дата первого упоминания. `Esc`/клик вне закрывают; пауза марки на ховер.
 * Уважает `prefers-reduced-motion` (анимация замирает глобально).
 */
export function ArtifactMarquee({ style, className, orientation = "horizontal" }: ArtifactMarqueeProps) {
  const vertical = orientation === "vertical";
  const { phase, data, retry } = useTileData<ArtifactView[]>(
    useCallback((signal) => getArtifacts({ signal }), []),
    "artifacts",
  );
  const artifacts = data ?? [];
  const isEmpty = phase === "loaded" && artifacts.length === 0;
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    if (active === null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setActive(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  // Темп ~ по числу артефактов, не быстрее 20с — чтобы читалось, а не мельтешило.
  const duration = `${Math.max(20, artifacts.length * 6)}s`;
  const activeArtifact = active !== null ? artifacts[active] : null;

  return (
    <TileShell
      state={isEmpty ? "empty" : phase}
      emptyText="нет артефактов"
      onRetry={retry}
      label="артефакты"
      ariaLabel="Артефакты"
      style={style}
      className={className}
    >
      {phase === "loaded" && !isEmpty && (
        <div
          className={`relative flex h-full overflow-hidden ${vertical ? "justify-center" : "items-center"}`}
          onMouseLeave={() => setActive(null)}
        >
          <div
            className={`artifact-track${vertical ? " artifact-track--vertical" : ""}`}
            style={{ "--artifact-duration": duration } as CSSProperties}
          >
            {/* Дублируем список дважды — петля -50% бесшовна. Второй проход aria-hidden. */}
            {[...artifacts, ...artifacts].map((a, i) => {
              const idx = i % artifacts.length;
              const dup = i >= artifacts.length;
              return (
                <button
                  key={`${a.name}-${i}`}
                  type="button"
                  aria-hidden={dup || undefined}
                  tabIndex={dup ? -1 : 0}
                  onMouseEnter={() => setActive(idx)}
                  onFocus={() => setActive(idx)}
                  onClick={() => setActive((cur) => (cur === idx ? null : idx))}
                  className={`${vertical ? "my-3" : "mx-4"} inline-flex flex-col items-center gap-1 align-middle`}
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                >
                  {a.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.imageUrl} alt={a.name} height={48} style={{ height: 48, width: "auto" }} />
                  ) : (
                    <span
                      aria-hidden
                      style={{
                        width: 48,
                        height: 48,
                        background: "var(--bg-surface-muted)",
                        borderRadius: "var(--radius-sm)",
                      }}
                    />
                  )}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>
                    {a.name}
                  </span>
                </button>
              );
            })}
          </div>

          {activeArtifact && (
            <div
              role="dialog"
              aria-label={activeArtifact.name}
              className="pixel-tile absolute left-1/2 top-1/2 z-10 flex flex-col items-center gap-1 p-3"
              style={{ transform: "translate(-50%, -50%)", minWidth: 140 }}
            >
              {activeArtifact.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeArtifact.imageUrl}
                  alt={activeArtifact.name}
                  style={{ maxHeight: 120, width: "auto" }}
                />
              ) : (
                <span
                  aria-hidden
                  style={{
                    width: 96,
                    height: 96,
                    background: "var(--bg-surface-muted)",
                    borderRadius: "var(--radius-sm)",
                  }}
                />
              )}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-primary)" }}>
                {activeArtifact.name}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
                {formatFirstMentioned(activeArtifact.firstMentionedOn)}
              </span>
            </div>
          )}
        </div>
      )}
    </TileShell>
  );
}
