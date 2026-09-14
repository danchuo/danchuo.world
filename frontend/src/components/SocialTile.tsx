"use client";

import { useCallback, type CSSProperties } from "react";
import { getLatestInstagramPost, getSocialLinks, getTelegramProfile } from "@/lib/api/client";
import type { InstagramPostView, SocialLinkView, TelegramProfileView } from "@/lib/api/types";
import { HoverTip } from "./HoverTip";
import { InstagramPeek } from "./InstagramPeek";
import { TelegramPeek } from "./TelegramPeek";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

interface SocialTileProps {
  /**
   * Редакция плитки (DESIGN §10.1). `peek` — под маркой всплывает то, что платформа показывает
   * сама: у Instagram последний пост (PRD §5.17), у Telegram визитка профиля (PRD §5.18).
   * Любое другое значение (и его отсутствие) — просто ряд ссылок.
   *
   * Решает ВОЛНА через свою layout-дельту, а не проверка ключа волны в коде: иначе каждая
   * новая волна требовала бы правки компонента, и обещание «новая волна = запись в БД»
   * перестало бы быть правдой.
   */
  edition?: string;
  style?: CSSProperties;
  className?: string;
}

/* Hand-colored pixel sprites for the wave-01 skin (frontend statics). The component only
   exposes both URLs via CSS vars on `.social-icon`; whether the colored sprite or the
   token-tinted mask is shown is the skin's call (wave-01.css / wave-02.css). Platforms
   without a sprite keep the mask on every wave. */
const WAVE01_SPRITES: Partial<Record<string, string>> = {
  github: "/assets/social/wave01/github.png",
  telegram: "/assets/social/wave01/telegram.png",
  instagram: "/assets/social/wave01/instagram.png",
  x: "/assets/social/wave01/x.png",
};

/**
 * Фирменные марки платформ — оригиналы, не перерисовки (`/assets/social/brand/*.svg`).
 * Вектор, а не PNG: марка живёт и в 20px ряду, и на плитке вчетверо крупнее, а растр
 * пришлось бы держать в нескольких размерах.
 *
 * Instagram и Telegram — свои цветные глифы; GitHub и X — свои же марки в БЕЛОМ: это штатный
 * вариант обеих для тёмной подложки, а чёрные на тёмном стекле пропадают (рядом, под теми же
 * именами с суффиксом `-black`, лежат и они — на случай светлой волны).
 *
 * Компонент только ПУБЛИКУЕТ адрес переменной; рисовать марку цветом или красить одноцветную
 * маску токеном — решает скин волны (ноль хардкод-цветов, DESIGN §10.2).
 */
const BRAND_MARKS: Partial<Record<string, string>> = {
  github: "/assets/social/brand/github.svg",
  telegram: "/assets/social/brand/telegram.svg",
  instagram: "/assets/social/brand/instagram.svg",
  x: "/assets/social/brand/x.svg",
};

/**
 * Плитка «Соцсети» (L) — PRD §5.8. Квадратная сетка карточек-ссылок (иконка + название),
 * вместо прежней бегущей строки: все ссылки видны разом, ничего не мельтешит. Колонок
 * столько, чтобы сетка была квадратной (2×2 до 4 ссылок, 3×3 до 9, дальше 4×4). Спрайт —
 * статика фронта (`/assets/social/*.svg`), в базе красится токеном `--text-primary` через
 * CSS-маску (`.social-icon` в common.css), поэтому следует за активной волной (ноль
 * хардкод-цветов). Скин волны 01 подменяет маску цветным пиксель-спрайтом
 * (`.social-icon--sprite`, wave-01.css), волна 03 — фирменной маркой платформы
 * (`.social-icon--brand`, [BRAND_MARKS]). Пусто ⇒ тихий empty.
 */
export function SocialTile({ edition, style, className }: SocialTileProps) {
  const { phase, data, retry } = useTileData<SocialLinkView[]>(
    useCallback((signal) => getSocialLinks({ signal }), []),
    "social-links",
  );
  const links = data ?? [];
  const isEmpty = phase === "loaded" && links.length === 0;

  // Превью тянем, только если редакция их показывает: на остальных волнах запросов нет вовсе.
  // Пусто (аккаунт не подключён, источник ещё не забран) — `null`, и карточки просто не будет:
  // марка остаётся обычной ссылкой (DESIGN §7). Источники независимы: молчащий Instagram не
  // отменяет визитку Telegram и наоборот.
  const peek = useTileData<InstagramPostView | null>(
    useCallback(
      (signal) => (edition === "peek" ? getLatestInstagramPost({ signal }) : Promise.resolve(null)),
      [edition],
    ),
    `instagram-latest-${edition ?? "plain"}`,
  );
  const post = edition === "peek" ? peek.data ?? null : null;

  const card = useTileData<TelegramProfileView | null>(
    useCallback(
      (signal) => (edition === "peek" ? getTelegramProfile({ signal }) : Promise.resolve(null)),
      [edition],
    ),
    `telegram-profile-${edition ?? "plain"}`,
  );
  const profile = edition === "peek" ? card.data ?? null : null;

  /** Что всплывает под маркой. `undefined` ⇒ подсказки нет вовсе (HoverTip рендерит якорь голым). */
  const peekOf = (l: SocialLinkView) => {
    if (post && l.platform === "instagram") return <InstagramPeek post={post} />;
    if (profile && l.platform === "telegram") return <TelegramPeek profile={profile} href={l.url} />;
    return undefined;
  };
  const cols = links.length <= 4 ? 2 : links.length <= 9 ? 3 : 4;

  return (
    <TileShell
      state={isEmpty ? "empty" : phase}
      emptyText="нет ссылок"
      onRetry={retry}
      label="соцсети"
      ariaLabel="Соцсети"
      style={style}
      className={className}
    >
      {phase === "loaded" && !isEmpty && (
        // social-frame: именованный контейнер, от которого сетка считает свой зазор. Обёртка
        // нужна отдельно от сетки: container-query-единицы внутри контейнера считаются от
        // ПРЕДКА, поэтому сетка не может мерить саму себя (common.css, DESIGN §8.1).
        <div className="tile-frame h-full">
          <ul
            // social-grid: именованный контейнер — запрос в common.css прячет подписи, когда сетка
            // слишком узка для текста, оставляя узнаваемые иконки. Зазор, иконка и подпись —
            // доли своих контейнеров, а не пиксельные константы (DESIGN §8.1).
            className="social-grid grid h-full"
            // Раскладка приезжает ПЕРЕМЕННЫМИ, а сами колонки объявлены в common.css — тот же
            // приём, что у ширины карточки музыки. Причина: в мобильном стеке квадратная сетка
            // становится ОДНИМ РЯДОМ (2×2 из крупных спрайтов съедало пол-экрана), а inline
            // `grid-template-columns` CSS не перебивает ничем, кроме `!important`.
            // `--social-count` едет отдельно от `--social-cols`: число ссылок из числа колонок
            // не вывести (3 колонки — это и 5 ссылок, и 9), а ряду нужно именно оно.
            style={{ "--social-cols": cols, "--social-count": links.length } as CSSProperties}
          >
            {links.map((l) => (
              <li key={l.platform} className="min-h-0 min-w-0">
                <HoverTip fill content={peekOf(l)}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={l.name}
                  // social-card: the plate behind icon+label is a skin parameter (common.css) —
                  // wave 01 clears it so sprites sit right on the tile surface. Именованный
                  // контейнер: иконка/подпись/зазор внутри считаются от ширины карточки.
                  className="social-card flex h-full w-full flex-col items-center justify-center"
                  style={{ color: "var(--text-primary)" }}
                >
                  {l.icon ? (
                    <span
                      aria-hidden
                      className={`social-icon${WAVE01_SPRITES[l.platform] ? " social-icon--sprite" : ""}${
                        BRAND_MARKS[l.platform] ? " social-icon--brand" : ""
                      }`}
                      style={
                        {
                          "--social-mask": `url(${l.icon})`,
                          ...(WAVE01_SPRITES[l.platform]
                            ? { "--social-sprite": `url(${WAVE01_SPRITES[l.platform]})` }
                            : {}),
                          ...(BRAND_MARKS[l.platform]
                            ? { "--social-brand": `url(${BRAND_MARKS[l.platform]})` }
                            : {}),
                        } as CSSProperties
                      }
                    />
                  ) : (
                    // Заглушка платформы без спрайта — той же доли карточки, что и иконка.
                    <span
                      aria-hidden
                      className="social-icon"
                      style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-sm)", mask: "none", WebkitMask: "none" }}
                    />
                  )}
                  <span className="social-label max-w-full truncate px-1">{l.name}</span>
                </a>
                </HoverTip>
              </li>
            ))}
          </ul>
        </div>
      )}
    </TileShell>
  );
}
