"use client";

import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { getProjects } from "@/lib/api/client";
import { is3dArtifact } from "@/lib/artifact3d";
import { Artifact3D } from "./Artifact3D";
import type { ProjectView } from "@/lib/api/types";
import type { TileOrientation } from "@/lib/layout";
import { formatQuarterRange } from "@/lib/projectRange";
import { repoLabel } from "@/lib/projectRepo";
import { treeBranch } from "@/lib/projectTree";
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
  /**
   * Вёрстка списка (DESIGN §7.8) — выбирает ВОЛНА через раскладку (`tiles.projects.edition`):
   * - не задана / незнакомая — прежний свёрнутый список, которым правит [orientation];
   * - `console` — вывод `tree`: строки висят на ветках под приглашением оболочки, под
   *   названием — путь (репозиторий или сайт) своей ссылкой, название и картинка ведут в дом
   *   проекта. Материал самой плитки (панель терминала вместо стекла) — дело СКИНА волны,
   *   а не редакции: редакция владеет содержимым, волна — краем и фоном (DESIGN §7.8, §10.2).
   */
  edition?: string;
  /**
   * Чем волна одевает планеты (DESIGN §12.5): `model` — объёмным артефактом у тех проектов, у
   * кого модель есть; не задано или незнакомо — плоский спрайт у всех. Ключ волны, а не проекта:
   * запись держит обе планеты сразу, и тёплой волне 01 не навязывается циановый каркас.
   */
  planet?: string;
}

/** Незнакомое имя редакции ⇒ дефолт: набор редакций — знание тайла, а не реестра раскладки. */
function resolveEdition(value: string | undefined): "console" | "default" {
  return value === "console" ? "console" : "default";
}

/** То же для планеты: незнакомое имя — плоский спрайт, самая безопасная подача. */
function wearsModel(value: string | undefined): boolean {
  return value === "model";
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
  // Досье — вёрстка вертикальная по своей природе (две строки текста в ряду), поэтому она
  // сильнее ориентации: волна, забывшая снять `orientation`, не должна получить ленту.
  const consoleEdition = edition === "console";
  const horizontal = !consoleEdition && orientation === "horizontal";
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
        {consoleEdition ? (
          // Консоль: приглашение оболочки вместо ярлыка плитки + вывод `tree` под ним.
          // Приглашение живёт в СОДЕРЖИМОМ, а не в `label` плитки, и это по смыслу: волна,
          // прячущая мета-ярлыки (§10.2 PRIME), спрятала бы вместе с ними и его — а оно
          // здесь не имя плитки, а КОРЕНЬ дерева, на котором висят строки ниже.
          <div className="projects-console-frame flex h-full flex-col">
            <p className="projects-prompt">
              <span className="projects-prompt__path">~/projects</span>
              <span aria-hidden className="projects-prompt__caret">❯</span>
              <span className="projects-prompt__cmd">tree -L 1</span>
            </p>
            <ul className="projects-console scroll-invisible flex min-h-0 flex-1 flex-col overflow-y-auto">
              {projects.map((p, i) => {
                // Показанный путь — вторая строка ряда: она и говорит «это код», до всякой
                // подписи. Нет ссылки — нет и строки (пустое место честнее прочерка).
                const repo = repoLabel(p.url);
                // Дом проекта: куда ведут название и картинка. У сайта его нет — там путь и
                // есть дом; у бота он свой, потому что код и сам проект живут в разных местах.
                const home = p.homeUrl ?? p.url;
                return (
                  <li key={p.title} className="min-w-0">
                    <div className="project-console flex items-center">
                      {/* Ветка: она и привязывает строку к пути в приглашении — то, на что
                          подпись только намекала. Пустая: линии рисует CSS (box-drawing-знаков
                          в подмножестве моношрифта нет — docs/pitfalls.md). Декор для читалки:
                          вслух «тройник» ничего не добавляет к названию проекта. */}
                      <span aria-hidden className="project-branch" data-branch={treeBranch(i, projects.length)} />
                      {/* Картинка ведёт туда же, куда название, но из обхода с клавиатуры
                          снята: две остановки на одном адресе — лишняя работа для читалки. */}
                      <LinkOrPlain href={home} className="project-console__icon" decorative>
                        <ProjectIcon iconUrl={p.iconUrl} modelUrl={showModels ? p.modelUrl : null} />
                      </LinkOrPlain>
                      <span className="project-console__text flex min-w-0 flex-col">
                        <LinkOrPlain href={home} className="project-title truncate" style={{ color: "var(--text-primary)" }}>
                          {p.title}
                        </LinkOrPlain>
                        {repo && (
                          // Зелень — токен «кода» волны (--accent-code, канал вкладов гита):
                          // путь репозитория и вклады приходят из одного места, цвет у канала общий.
                          <LinkOrPlain
                            href={p.url}
                            className="project-repo truncate"
                            style={{ ...mono, color: "var(--accent-code)" }}
                          >
                            {repo}
                          </LinkOrPlain>
                        )}
                      </span>
                      <span className="project-range" style={{ ...mono, color: "var(--text-tertiary)" }}>
                        {formatQuarterRange(p.startYear, p.startQuarter, p.endYear, p.endQuarter)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
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
 * Кусок строки, который **может** оказаться ссылкой: адрес есть — гиперссылка, нет — просто
 * текст (мёртвых ссылок на борде не бывает, PRD §5.7). `decorative` снимает элемент с обхода
 * клавиатурой и с озвучки: так помечена картинка, ведущая туда же, куда стоящее рядом
 * название, — второй остановки на том же адресе читателю не нужно.
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
 * Иконка проекта — одна на все редакции: спрайт-«планета» в единой колонке-слоте (тексты
 * рядов начинаются с одного x), сторонний фавикон в легаси-подаче, ничего нет — глухая
 * плашка. Размеры задаёт CSS долями контейнера (DESIGN §8.1), поэтому редакции достаточно
 * переопределить доли у своих классов.
 *
 * [modelUrl] — объёмная планета (DESIGN §12.5): тот же слот, но предмет оживает под курсором.
 * Приезжает уже отфильтрованной волной: не задана ⇒ либо волна объёма не просит, либо модели
 * у проекта нет, и в обоих случаях показывается прежний плоский спрайт. Значит новая волна с
 * объёмом ничего не ломает у старых, а проект без модели не выпадает из ряда.
 */
function ProjectIcon({ iconUrl, modelUrl }: { iconUrl: string | null; modelUrl: string | null }) {
  // `is3dArtifact` здесь — страж, а не выбор ветки: если в поле модели окажется не модель
  // (опечатка в записи), лучше показать спрайт, чем пустой слот.
  if (modelUrl && is3dArtifact(modelUrl)) {
    // Артефакт берёт слот целиком: поле вокруг предмета отмеряет сама сцена, а не CSS, —
    // иначе у моделей с разными габаритами поле получалось бы разным.
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
