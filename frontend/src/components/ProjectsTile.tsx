"use client";

import { useCallback, useEffect, useRef, type CSSProperties } from "react";
import { getProjects } from "@/lib/api/client";
import type { ProjectView } from "@/lib/api/types";
import type { TileOrientation } from "@/lib/layout";
import { formatQuarterRange } from "@/lib/projectRange";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

interface ProjectsTileProps {
  style?: CSSProperties;
  className?: string;
  /**
   * Направление списка — задаётся волной через layout (`tiles.projects.orientation`,
   * как у marquee и полки дропов). Дефолт — вертикальная колонка.
   */
  orientation?: TileOrientation;
}

const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

// Project "planet" sprites are wave-agnostic art served from our own static assets
// (DESIGN §12.2): rendered in a bigger unrounded slot, same on every wave. External
// favicons (any other origin/path) keep the legacy small rounded treatment. The "-px"
// filename suffix marks true pixel art that must scale with nearest-neighbor: smooth
// flat sprites (e.g. proxemics) fall apart when pixelated at small sizes. Smooth sprites
// get a one-step bigger box: without a chunky pixel outline they optically read smaller
// than pixel art of the same box.
//
// Размеры живут в CSS (.project-* в common.css) — доли контейнера, а не пиксели, иначе
// начинка не растёт вместе с плиткой (DESIGN §8.1). Атрибуты width/height остаются
// номинальными: они задают браузеру пропорцию 1:1 до загрузки, а показ ведёт CSS.
const isPlanetSprite = (url: string) => url.startsWith("/assets/projects/");
const isPixelArt = (url: string) => url.endsWith("-px.png");
const SPRITE_NOMINAL = 32;

/**
 * Плитка «Проекты» (P) — PRD §5.7, DESIGN §3. Свёрнутый блок: иконка + название (ссылкой,
 * если задан url) + диапазон кварталов. Пусто ⇒ тихий empty. Ноль хардкод-цветов (токены волны).
 */
export function ProjectsTile({ style, className, orientation = "vertical" }: ProjectsTileProps) {
  const { phase, data, retry } = useTileData<ProjectView[]>(
    useCallback((signal) => getProjects({ signal }), []),
    "projects",
  );
  const projects = data ?? [];
  const isEmpty = phase === "loaded" && projects.length === 0;
  const horizontal = orientation === "horizontal";
  const listRef = useRef<HTMLUListElement>(null);

  // Живой скролл без видимого ползунка — контур полки дропов (DESIGN §7.5). Вертикальный
  // список колесо листает родно, поэтому обработчик нужен только горизонтальной ленте:
  // вертикальное колесо мыши двигает её вбок (трекпадный горизонтальный жест пропускаем —
  // он уже родной). На краях колесо отдаётся странице, чтобы не запирать прокрутку.
  // Перетаскивания мышью нет намеренно: у дропов оно перехватывало клик и ломало открытие.
  useEffect(() => {
    const el = listRef.current;
    if (!el || !horizontal) return;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft >= max - 1;
      if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [horizontal, phase, projects.length]);

  return (
    <TileShell
      state={isEmpty ? "empty" : phase}
      emptyText="нет проектов"
      onRetry={retry}
      label="проекты"
      ariaLabel="Проекты"
      style={style}
      className={className}
    >
      {phase === "loaded" && !isEmpty && (
        // projects-frame: именованный контейнер, от которого считаются размеры внутри
        // (список сам себя мерить не может — DESIGN §8.1).
        <div className="tile-frame h-full">
        <ul
          ref={listRef}
          // scrollbarWidth: ползунок скрыт, скролл живой (колесо/трекпад/тач) — как у полки
          // дропов. Подсказка о продолжении списка — обрезанный краем элемент, не ползунок.
          style={{ scrollbarWidth: "none" }}
          className={
            horizontal
              ? "projects-list projects-list--horizontal flex h-full flex-row items-center overflow-x-auto"
              : "projects-list flex h-full flex-col overflow-y-auto"
          }
        >
          {projects.map((p) => (
            <li
              key={p.title}
              className={
                horizontal
                  ? "project-row flex shrink-0 flex-col items-center"
                  : "project-row flex items-center"
              }
            >
              {p.iconUrl ? (
                isPlanetSprite(p.iconUrl) ? (
                  // Единая колонка-слот: спрайты разного размера центрируются в ней, поэтому
                  // тексты рядов начинаются с одного x. Размеры — доли (.project-* в common.css).
                  <span aria-hidden className="project-slot grid shrink-0 place-items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.iconUrl}
                      alt=""
                      width={SPRITE_NOMINAL}
                      height={SPRITE_NOMINAL}
                      className={isPixelArt(p.iconUrl) ? "project-sprite" : "project-sprite--smooth"}
                      style={isPixelArt(p.iconUrl) ? { imageRendering: "pixelated" } : undefined}
                    />
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.iconUrl}
                    alt=""
                    width={SPRITE_NOMINAL}
                    height={SPRITE_NOMINAL}
                    className="project-favicon"
                  />
                )
              ) : (
                <span
                  aria-hidden
                  className="project-favicon"
                  style={{ background: "var(--bg-surface-muted)" }}
                />
              )}
              <div className={horizontal ? "flex min-w-0 flex-col items-center text-center" : "flex min-w-0 flex-col"}>
                {p.url ? (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="project-title truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {p.title}
                  </a>
                ) : (
                  <span className="project-title truncate" style={{ color: "var(--text-primary)" }}>
                    {p.title}
                  </span>
                )}
                <span className="project-range" style={{ ...mono, color: "var(--text-tertiary)" }}>
                  {formatQuarterRange(p.startYear, p.startQuarter, p.endYear, p.endQuarter)}
                </span>
              </div>
            </li>
          ))}
        </ul>
        </div>
      )}
    </TileShell>
  );
}
