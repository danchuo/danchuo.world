"use client";

import { useCallback, useEffect, useMemo, type CSSProperties } from "react";
import { getThemes } from "@/lib/api/client";
import type { DaySummary, ThemeView } from "@/lib/api/types";
import type { TileOrientation } from "@/lib/layout";
import { buildRibbon } from "@/lib/waveRibbon";
import { readWaveCookie } from "@/lib/waveCookie";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";
import { useWave } from "./WaveProvider";

interface WaveSwitcherProps {
  style?: CSSProperties;
  className?: string;
  /**
   * Направление ряда чипов — задаётся волной через layout (`tiles.waveSwitcher.orientation`),
   * как у `projects`/`photoDrops`/`marquee`. Дефолт — горизонтальный ряд.
   */
  orientation?: TileOrientation;
  /**
   * Окно календаря — материал для ленты прожитых дней внутри карт (см. врез ниже).
   * Необязательно: переключатель в админке данных борда не тянет и живёт без ленты.
   */
  summaries?: DaySummary[];
  /** Опора «сегодня» (MSK) для ленты: дни после неё в неё не едут. */
  today?: string;
}

/**
 * Токены волны → инлайновые `--chip-*` переменные её чипа (DESIGN §2.6).
 *
 * Ключевое: чип рисуется палитрой и краем ТОЙ волны, которую предлагает, а не активной —
 * поэтому значения берутся из `theme.tokens`, а не из `:root` (там токены борда). Цвета
 * едут переменными, а не классами: превью новой волны появляется само, стоит ей завестись
 * в БД, — правок кода не нужно. Недостающий токен падает на токен борда (волна с урезанным
 * набором не рвёт чип, просто читается менее точно).
 */
function chipVars(tokens: Record<string, string>): CSSProperties {
  const pick = (name: string, fallback: string) => tokens[name] ?? fallback;
  return {
    // Цвет страницы волны — самый узнаваемый признак (персик 01 vs небо 02).
    "--chip-bg": pick("bg-page", "var(--bg-surface-muted)"),
    // Край: цвет и толщина линии — те же токены, что у настоящей плитки (путь 1 «взять
    // ступеньку» из вреза в wave-01.css). Волна, рисующая свой край (путь 2), переопределяет
    // форму чипа у себя в скине по `[data-chip-wave]`.
    // ⚠️ Силуэт `pixel-corners` сюда НЕ едет: он задан в абсолютных px под большую плитку и
    // на чипе вырождается в крестик (см. врез у `.wave-chip` в common.css). Ступеньку чипа
    // рисует CSS в своём масштабе; волна может прислать свою отдельным токеном `chip-corners`.
    ...(tokens["chip-corners"] ? { "--chip-corners": tokens["chip-corners"] } : {}),
    "--chip-line": pick("border-tile", "var(--border)"),
    "--chip-line-w": pick("tile-line", "1.5px"),
    // Скругление — для волн, рисующих свой край (Obscura правит им форму чипа).
    "--chip-radius": pick("radius-sm", "6px"),
    // Единственный сигнальный цвет волны — красит нижний торец «коробочки» чипа.
    "--chip-accent": pick("accent", "var(--accent)"),
  } as CSSProperties;
}

/**
 * Переключатель волн (W) — PRD §5.9, DESIGN §2.6. Ряд **чипов-мини-плиток**: каждый чип —
 * крошечная карточка, нарисованная краем и палитрой своей волны (ступенчатый персик у 01,
 * скруглённая облачная карта у 02) с точкой-акцентом в углу; активный приподнят «коробочкой»,
 * как настоящая плитка борда. Свотч-квадрат одного цвета показывал волну одним токеном из
 * полусотни — форма и акцент читаются быстрее цвета. Клик меняет отображаемую волну
 * **клиентским свопом** через [useWave]: токены едут в `:root`, layout — в состояние борда
 * (без перезагрузки) — компоненты не трогаются. Только реально выпущенные волны — без
 * слотов-заглушек под будущие (DESIGN §2.6).
 */
export function WaveSwitcher({
  style,
  className,
  orientation = "horizontal",
  summaries,
  today,
}: WaveSwitcherProps) {
  const vertical = orientation === "vertical";
  const { phase, data, retry } = useTileData<ThemeView[]>(
    useCallback((signal) => getThemes({ signal }), []),
    "themes",
  );
  // Stable identity: a fresh `[]` fallback each render would retrigger the self-heal effect.
  const themes = useMemo(() => data ?? [], [data]);
  // Активная волна и своп — из контекста (SSR-дефолт = активная волна владельца). Своп
  // меняет и токены, и раскладку борда разом.
  const { activeKey, applyWave } = useWave();

  // Self-heal after a degraded SSR: backend down/rate-limited at render time ⇒ the page came
  // without a resolved wave (activeKey=null, default skin). Once the released-waves list is
  // here (network or stale cache), apply the visitor's cookie pick — or the owner's active
  // wave — so skin/tokens/layout and the pressed swatch recover without another reload.
  // `remember: false`: healing is not a pick, it must not (re)write the cookie.
  useEffect(() => {
    if (activeKey !== null || themes.length === 0) return;
    const preferred = readWaveCookie();
    const target = themes.find((t) => t.key === preferred) ?? themes.find((t) => t.active);
    if (target) applyWave(target, { remember: false });
  }, [activeKey, themes, applyWave]);

  const isEmpty = phase === "loaded" && themes.length === 0;

  // Лента прожитых дней — МАТЕРИАЛ карты, а не подпись (DESIGN §2.6). Волна, чей холст сделан
  // из данных, показывает в своей карте кусок этого холста; шов лежит в КАЖДОЙ карте и
  // wave-агностичен — `common.css` держит его выключенным, включает его скин волны (§10.1).
  // Пустая строка (борд ещё грузится, все дни молчат, переключатель в админке) слой снимает
  // целиком: карта обязана оставаться цельной поверхностью, а не пустым прямоугольником.
  const ribbon = useMemo(
    () => (summaries && today ? buildRibbon(summaries, today) : ""),
    [summaries, today],
  );

  return (
    <TileShell
      state={isEmpty ? "empty" : phase}
      emptyText="нет волн"
      onRetry={retry}
      label="волны"
      ariaLabel="Переключатель волн"
      style={style}
      className={className}
    >
      {phase === "loaded" && !isEmpty && (
        // `tile-frame` обязателен: без своего контейнера `cqw` чипа цепляется за дальнего
        // предка и размер упирается в потолок clamp (замерено — 48px вместо 28px). Ряд —
        // безопасный контейнер: ширину ему задаёт плитка, а чипы её не двигают, поэтому
        // петли «шире → крупнее чип → шире» здесь нет.
        //
        // `flex-nowrap` намеренно: браузерный зум УЖИМАЕТ CSS-вьюпорт (110% на 1536 отдаёт
        // ~1396), ряд сужается, а демпфер §8.1 уменьшает чип вдвое медленнее контейнера —
        // на каком-то шаге два чипа перестают влезать. С переносом ряд молча вставал в
        // столбец (жалоба владельца «почему волны встают вертикально на 110%»); теперь
        // направление задаёт ТОЛЬКО раскладка волны, а чипы в тесноте жмутся (см. flex-shrink
        // и aspect-ratio у .wave-chip).
        // `wave-chip-row` — зацепка для скина, а не оформление: волна вправе перекроить ряд
        // (PRIME растягивает чипы на всю плитку и разводит их своим просветом). Класс
        // wave-агностичный, в базе за ним ничего не стоит.
        <div
          className={`wave-chip-row tile-frame flex h-full flex-nowrap content-center items-center gap-1.5 ${
            vertical ? "flex-col" : "flex-row"
          }`}
        >
          {themes.map((t) => {
            const isActive = t.key === activeKey;
            return (
              <button
                key={t.key}
                type="button"
                className="wave-chip tap-target"
                // Ключ волны — зацепка для скина: волна со своим краем правит форму СВОЕГО
                // чипа, лёжа на борде чужой волны (см. wave-02.css).
                data-chip-wave={t.key}
                data-active={isActive}
                aria-pressed={isActive}
                // `aria-label` остаётся (скринридеру чип без подписи — «кнопка»), а
                // нативной подсказки НЕТ намеренно: имя волны («Волна 01 «Студия / Персик»»)
                // посетителю ничего не говорит — он выбирает вид глазами, по самому чипу.
                aria-label={`Волна: ${t.name}`}
                onClick={() => applyWave(t)}
                style={chipVars(t.tokens)}
              >
                {/* Всего два слоя: нижний торец «коробочки» сигнальным цветом волны + сама
                    карточка. Мини-борд внутри карточки (и белая вложенная карта у волны 02)
                    пробовались и сняты — «картинка в картинке», замечание владельца. */}
                <span className="wave-chip__slab" aria-hidden />
                <span className="wave-chip__face" aria-hidden>
                  {/* Слой сам помечен aria-hidden, хотя и лежит внутри скрытой карты:
                      материал не должен читаться скринридеру, даже если разметку карты
                      однажды перекроят. */}
                  {ribbon && (
                    <span className="wave-chip__ribbon" aria-hidden>
                      {ribbon}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </TileShell>
  );
}
