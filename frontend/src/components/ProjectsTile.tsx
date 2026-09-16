"use client";

import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { getProjects } from "@/lib/api/client";
import { is3dArtifact } from "@/lib/artifact3d";
import { Artifact3D } from "./Artifact3D";
import type { ProjectView } from "@/lib/api/types";
import { mskToday } from "@/lib/date";
import type { TileOrientation } from "@/lib/layout";
import { projectYearRows } from "@/lib/projectGroups";
import { formatQuarterRange } from "@/lib/projectRange";
import { repoLabel } from "@/lib/projectRepo";
import { treeBranch } from "@/lib/projectTree";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

interface ProjectsTileProps {
  style?: CSSProperties;
  className?: string;
  /**
   * Direction of the list, set by the wave through layout (`tiles.projects.orientation`, as with the
   * marquee and the drops shelf). The default is a vertical column.
   */
  orientation?: TileOrientation;
  /**
   * Layout of the list, chosen by the WAVE through its layout. Unset or unknown keeps the old
   * collapsed list driven by [orientation]; `console` renders `tree` output with the year as the
   * row's LEFT margin. The tile's material is the SKIN's business, not the edition's. DESIGN §7.8
   */
  edition?: string;
  /**
   * How the wave dresses the planets (DESIGN §12.5): `model` gives a 3D artifact to projects that have
   * one, while unset or unknown gives everyone a flat sprite. A key of the wave rather than the
   * project: a record holds both planets at once, so warm wave 01 is not handed a cyan wireframe.
   */
  planet?: string;
}

/** An unknown edition name falls back to the default: the set of editions is the tile's knowledge. */
function resolveEdition(value: string | undefined): "console" | "default" {
  return value === "console" ? "console" : "default";
}

/** The same for a planet: an unknown name gives the flat sprite, the safest presentation. */
function wearsModel(value: string | undefined): boolean {
  return value === "model";
}

const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

// Project "planet" sprites are wave-agnostic art from our own static assets: a bigger unrounded
// slot, identical on every wave, while external favicons keep the small rounded treatment. A "-px"
// suffix marks true pixel art needing nearest-neighbour; smooth sprites get a bigger box. §12.2
const isPlanetSprite = (url: string) => url.startsWith("/assets/projects/");
const isPixelArt = (url: string) => url.endsWith("-px.png");
const SPRITE_NOMINAL = 32;

/**
 * The "Projects" tile (PRD §5.7, DESIGN §3). A collapsed block: icon, title (a link when a url is
 * given) and a range of quarters. Nothing to show ⇒ a quiet empty state. No hardcoded colours.
 */
export function ProjectsTile({
  style,
  className,
  orientation = "vertical",
  edition: editionRaw,
  planet: planetRaw,
}: ProjectsTileProps) {
  const edition = resolveEdition(editionRaw);
  const showModels = wearsModel(planetRaw);
  const { phase, data, retry } = useTileData<ProjectView[]>(
    useCallback((signal) => getProjects({ signal }), []),
    "projects",
  );
  const projects = data ?? [];
  const isEmpty = phase === "loaded" && projects.length === 0;
  // The dossier is vertical by nature (two lines of text per row), so it outranks orientation: a wave
  // that forgot to drop `orientation` must not end up with a rail.
  const consoleEdition = edition === "console";
  // "Now" for the layout is MSK canon, like every other time on the board: an open-ended project lands
  // in the current year rather than in the year it started.
  const currentYear = Number(mskToday().slice(0, 4));
  // Console rows are computed IN ADVANCE and as one list: each carries its year and its place within
  // it, from which the shape of its branch follows.
  const yearRows = consoleEdition ? projectYearRows(projects, currentYear) : [];
  const horizontal = !consoleEdition && orientation === "horizontal";
  const listRef = useRef<HTMLUListElement>(null);

  // Live scrolling with no visible scrollbar, following the drop shelf. A vertical list already
  // wheels natively, so the handler is only for the horizontal ribbon. Mouse dragging is
  // deliberately absent: on the drops it swallowed the click and broke opening. DESIGN §7.5
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
      // The tile's height follows its content (layout.ts, CONTENT_HEIGHT_TILES), so the whole chain
      // from section to list is held by flex: a percentage height would have nothing to count from.
      fluid
      style={style}
      className={className}
    >
      {phase === "loaded" && !isEmpty && (
        // projects-frame: the named container the sizes inside are computed from, since a list cannot
        // measure itself (DESIGN §8.1).
        <div className="tile-frame flex min-h-0 flex-1 flex-col">
        {consoleEdition ? (
          // Console: a shell prompt instead of the tile label, with `tree` output beneath it. The
          // prompt lives in the CONTENT, not in the tile's label, because a wave that hides meta
          // labels would hide it too — and here it is the ROOT of the tree, not the tile's name.
          <div className="projects-console-frame flex min-h-0 flex-1 flex-col">
            <p className="projects-prompt">
              <span className="projects-prompt__path">~/projects</span>
              <span aria-hidden className="projects-prompt__caret">❯</span>
              <span className="projects-prompt__cmd">tree -L 1</span>
            </p>
            <div className="projects-console scroll-invisible min-h-0 flex-1 overflow-y-auto">
              {/* ONE list for all years: the spacing between rows must be the same across the whole
                  listing. Each year still has its own tree — the trunk grows down from the year and
                  the branch kind is decided inside the group (DESIGN §7.8). */}
              <ul className="projects-console__list flex flex-col">
                {yearRows.map((row) => {
                  const p = row.project;
                  // The repository path is the row's second line: it says "this is code" before
                  // any caption. No link, no line — empty space is honester than a dash. Matching
                  // the title (a site named after its own address) also gets no line.
                  const repo = repoLabel(p.url);
                  const code = repo === p.title ? null : repo;
                  // The project's home, where the title and the picture lead. A site has none — there
                  // the path IS the home; a bot has its own, its code and itself living apart.
                  const home = p.homeUrl ?? p.url;
                  // Currency is shown by BRIGHTNESS, not a sign: a terminal tells state by colour,
                  // and `-F` glyphs are its monochrome crutch with nothing to quote here — in a
                  // `tree` of a projects directory every entry is a directory anyway.
                  const live = p.endYear === null;
                  return (
                    <li key={p.title} className="min-w-0">
                      <div
                        className="project-console flex items-center"
                        data-state={live ? "live" : "archived"}
                      >
                        {/* The year's left margin: one width for all rows, text only on the year's
                            first row. Empty on the rest, it holds their indent so the trunk below
                            the year runs as one vertical. */}
                        <span className="projects-year__gutter">
                          {row.startsYear && (
                            <>
                              <span className="projects-year__head">{row.year}</span>
                              {/* The horizontal from the year to the trunk, which is what joins a
                                  year to its subtree. CSS draws it, so the element is empty and
                                  decorative: there is nothing to voice. */}
                              <span aria-hidden className="projects-year__link" />
                            </>
                          )}
                        </span>
                        {/* The branch hangs a row on its year's trunk. It is empty because CSS
                            draws the lines (the mono subset has no box-drawing glyphs —
                            docs/pitfalls.md), and decorative: "tee" adds nothing when read aloud. */}
                        <span
                          aria-hidden
                          className="project-branch"
                          data-branch={treeBranch(row.indexInYear, row.yearSize)}
                        />
                        {/* The picture leads where the title does but is out of the tab order: two
                            stops on one address is extra work for a screen reader. */}
                        <LinkOrPlain href={home} className="project-console__icon" decorative>
                          <ProjectIcon iconUrl={p.iconUrl} modelUrl={showModels ? p.modelUrl : null} />
                        </LinkOrPlain>
                        <span className="project-console__text flex min-w-0 flex-col">
                          {/* The title's colour is NOT inline here, unlike the wave-01 list: the
                              row's `data-state` governs it, and an inline style would beat the
                              skin's rule on specificity. */}
                          <LinkOrPlain href={home} className="project-title truncate">
                            {p.title}
                          </LinkOrPlain>
                          {/* Dimming is the sighted signal; a screen reader is told in words. */}
                          {!live && <span className="sr-only">завершён</span>}
                          {code && (
                            // The green is the wave's "code" token (`--accent-code`, the git
                            // contributions channel): repository path and contributions come from one
                            // place, so the channel's colour is shared.
                            <LinkOrPlain
                              href={p.url}
                              className="project-repo truncate"
                              style={{ ...mono, color: "var(--accent-code)" }}
                            >
                              {code}
                            </LinkOrPlain>
                          )}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        ) : (
        <ul
          ref={listRef}
          // scrollbarWidth: the bar is hidden, the scroll alive (wheel, trackpad, touch) — as on the
          // drops shelf. The hint that the list continues is an element cut by the edge, not a bar.
          style={{ scrollbarWidth: "none" }}
          className={
            horizontal
              ? "projects-list projects-list--horizontal flex min-h-0 flex-1 flex-row items-center overflow-x-auto"
              : "projects-list flex min-h-0 flex-1 flex-col overflow-y-auto"
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
              <ProjectIcon iconUrl={p.iconUrl} modelUrl={showModels ? p.modelUrl : null} />
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
        )}
        </div>
      )}
    </TileShell>
  );
}

/**
 * A piece of a row that MAY be a link: an address makes it a hyperlink, none leaves plain text —
 * there are no dead links on the board. `decorative` takes an element out of tab order and off the
 * screen reader, marking a picture that leads where the title beside it already leads. PRD §5.7
 */
function LinkOrPlain({
  href,
  className,
  style,
  decorative = false,
  children,
}: {
  href: string | null;
  className: string;
  style?: CSSProperties;
  decorative?: boolean;
  children: ReactNode;
}) {
  if (!href) {
    return (
      <span className={className} style={style} aria-hidden={decorative || undefined}>
        {children}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      style={style}
      aria-hidden={decorative || undefined}
      tabIndex={decorative ? -1 : undefined}
    >
      {children}
    </a>
  );
}

/**
 * A project's icon, one for every edition: a "planet" sprite in a single column slot, a third
 * party favicon in the legacy treatment, or a blank plate. [modelUrl] arrives already filtered by
 * the wave, so a wave adding volume breaks nothing and a model-less project stays in line. §12.5
 */
function ProjectIcon({ iconUrl, modelUrl }: { iconUrl: string | null; modelUrl: string | null }) {
  // `is3dArtifact` is a guard here, not a branch selector: if the model field holds something that is
  // not a model (a typo in the record), showing the sprite beats showing an empty slot.
  if (modelUrl && is3dArtifact(modelUrl)) {
    // The artifact takes the whole slot: the padding around the object is measured by the scene rather
    // than by CSS, or models of different sizes would end up with different padding.
    return (
      <span aria-hidden className="project-slot grid shrink-0 place-items-center">
        <Artifact3D src={modelUrl} className="project-artifact" />
      </span>
    );
  }
  if (!iconUrl) {
    return <span aria-hidden className="project-favicon" style={{ background: "var(--bg-surface-muted)" }} />;
  }
  if (!isPlanetSprite(iconUrl)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={iconUrl} alt="" width={SPRITE_NOMINAL} height={SPRITE_NOMINAL} className="project-favicon" />;
  }
  const pixel = isPixelArt(iconUrl);
  return (
    <span aria-hidden className="project-slot grid shrink-0 place-items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={iconUrl}
        alt=""
        width={SPRITE_NOMINAL}
        height={SPRITE_NOMINAL}
        className={pixel ? "project-sprite" : "project-sprite--smooth"}
        style={pixel ? { imageRendering: "pixelated" } : undefined}
      />
    </span>
  );
}
