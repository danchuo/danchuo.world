import type { CSSProperties } from "react";
import type { DayView } from "@/lib/api/types";
import type { DisciplineLens } from "@/lib/disciplineLens";
import { lifeDayLabel } from "@/lib/lifeDay";
import { relativeDayRu } from "@/lib/relativeDay";
import { hasWeekendScene, isWeekend } from "@/lib/weekend";
import { HoverTip } from "./HoverTip";
import { QuestMap } from "./QuestMap";
import { WeekendScene } from "./WeekendScene";
import { TileShell, type TileState } from "./TileShell";

interface TodayTileProps {
  day: DayView | null;
  /** Сегодня MSK — для относительной подписи плитки («вчера», «в прошлый вторник», …). */
  today: string;
  state: TileState;
  onRetry?: () => void;
  /** Active wave key — forwarded to [QuestMap] so waves with a sprite set swap glyphs (DESIGN §12). */
  wave?: string | null;
  /** Линза календаря (§5.3) — выбранная остановка карты-тропы; и её переключатель. */
  lens?: DisciplineLens | null;
  onLensChange?: (lens: DisciplineLens | null) => void;
  style?: CSSProperties;
  className?: string;
}

// Форматтер строится один раз на модуль (создание Intl дорогое). День+месяц — из Intl,
// год дописываем словом «год» (Intl в ru-RU даёт «г.», а мы хотим полностью, DESIGN §4).
const DAY_MONTH_RU_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** Mono-стиль — статичен, держим вне компонента (не пересобираем на рендер). */
const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

/**
 * Day-name font size, fit to TWO lines of its 3/5 of the header. Worst-case glyph advance is
 * mono's 0.6em (wave 01 maps --font-display to mono; other display faces are narrower), and the
 * name's share is ~60cqw, so one line holds ~58 / (0.6 * size) chars — two lines hold twice that,
 * i.e. a len-char name fits when size = 2 * 58 / (0.6 * len) ≈ 192/len cqw.
 *
 * Two lines, not one, because one line paid for length in KEGL: the real prod name of 2026-09-01
 * is 75 chars, and squeezed into a single line it came out ≈1.3cqw — unreadable on the board
 * (owner's report). The same name across two lines is ≈2.6cqw, exactly twice as large.
 *
 * The clamp holds both ends: names up to ~24 chars still take the shared 4cqw cap on ONE line
 * (they simply fit), and nothing drops below the floor — a name too long even for two lines takes
 * a third rather than melting away. The floor is `max(2.2cqw, 11px)`, container units AND pixels:
 * on the phone stack the tile is ~350px wide, where 2.2cqw is under 8px — legible on paper, not on
 * a phone. The quest map below absorbs the extra header height by letterboxing, so the tile keeps
 * its geometry.
 */
function titleFontSize(title: string): string {
  return `clamp(max(2.2cqw, 11px), ${(192 / title.length).toFixed(2)}cqw, min(4cqw, 40px))`;
}

/**
 * Date font size fit to its 2/5 of the header (~40cqw). Same mono 0.6em worst case, fill ~38cqw:
 * size = 38 / (0.6 * len) ≈ 63/len cqw. Short dates keep the shared 4cqw cap. Only applied when a
 * day name shares the line (narrow box); a nameless date keeps the base size on the full width.
 */
function dateFontSize(text: string): string {
  return `min(4cqw, 40px, ${(63 / text.length).toFixed(2)}cqw)`;
}

/** Длинная дата RU в mono (DESIGN §4): «3 июля 2026 год» — год словом, без «г.». */
function longDateRu(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAY_MONTH_RU_FMT.format(d)} ${d.getUTCFullYear()} год`;
}

/**
 * Плитка «Сегодня» (T) — доминанта борда (DESIGN §3, §4). Иерархия: дата → имя дня →
 * статы строкой → карта-тропа дисциплины (монстр — детур на ней). Пустой/будущий день —
 * валидный вид: статы «нет данных» (но 0 как 0), карта в каркасе с незакрытыми остановками.
 */
export function TodayTile({
  day,
  today,
  state,
  onRetry,
  wave,
  lens,
  onLensChange,
  style,
  className,
}: TodayTileProps) {
  // Подпись плитки относительна выбранной дате: «сегодня» только когда выбран сегодня.
  const label = day ? relativeDayRu(day.date, today) : "сегодня";
  // Выбран день соседнего месяца → фон плитки чуть меняется (§4), как и ячейка в календаре.
  const otherMonth = day != null && day.date.slice(0, 7) !== today.slice(0, 7);
  // Номер дня жизни — подсказкой на дате: дата остаётся датой, счёт всплывает по наведению.
  const lifeDay = day ? lifeDayLabel(day.date) : null;
  /**
   * Монстр тремя состояниями, а не двумя. Отмечали за день ⇒ вкус либо выбран («пил»), либо
   * нет — и тогда это ЧЕСТНОЕ «не пил». Не отмечали ⇒ ответа нет вовсе: `null`.
   *
   * Разделитель — `monsterReported`, а НЕ `hasData`: запись дня создаёт health-ingest (авто
   * 12/18/24 MSK), поэтому она есть почти всегда, тогда как вкус пишет другой, интерактивный
   * шорткат. По `hasData` сегодняшний день с одними шагами объявлялся бы чистым — ровно то,
   * что и было видно на борде (замечено владельцем). Признак считает бэк по наличию отметки
   * пункта `monster` в `checklist_entry` (§5.6).
   */
  const monsterDrunk = day && day.monsterReported ? day.monster != null : null;
  const tileStyle = otherMonth ? { ...style, background: "var(--surface-othermonth)" } : style;
  return (
    <TileShell
      state={state}
      onRetry={onRetry}
      elevated
      scatter
      label={label}
      ariaLabel="Сегодня"
      style={tileStyle}
      // Осыпь в углу (§2.4) — только на фокусной плитке (проп scatter); кант из .pixel-tile.
      className={className}
    >
      {day && (
        <div className="flex h-full flex-col gap-3" style={{ containerType: "inline-size" }}>
          {/* Date and day name share the header, split 2/5 (date) — 3/5 (name): the name gets the
              larger share so long day names render at a confident size instead of shrinking to a
              suspiciously tiny one (was 50/50). Each side fits its own box via container units: the
              date shrinks to fit its 2/5 on ONE line (dateFontSize, nowrap — a date is one token
              and breaking it would read as a bug), while the name WRAPS and is sized to two lines
              (titleFontSize). Without a name the date keeps the base size on the full width.
              Name uses --font-display (wave 01 maps it to mono, wave 02 to the pixel face) and hugs
              the right edge of its share. Baseline alignment (items-baseline) pins the date to the
              name's FIRST line, so extra lines grow downward; the quest map below letterboxes
              (shrinks whole + side gaps) to pay for that height. */}
          <div
            className="flex items-baseline"
            style={{ fontSize: "min(4cqw, 40px)", lineHeight: 1.2 }}
          >
            <div
              data-testid="today-date"
              style={day.title ? { ...mono, fontSize: dateFontSize(longDateRu(day.date)) } : mono}
              className={day.title ? "w-2/5 whitespace-nowrap" : "whitespace-nowrap"}
            >
              {/* Номер дня жизни — подсказкой волны ([HoverTip]), а не нативным `title`: тот
                  рисовался системой мимо всей визуальной системы борда и тащил за собой курсор
                  `help`, обещавший на неинтерактивной дате больше, чем там есть. Обёртка — по
                  тексту, а не по всей ячейке: дата занимает 2/5 строки, и ховер в пустоте
                  справа от неё подсказку выдавать не должен. */}
              <HoverTip text={lifeDay}>{longDateRu(day.date)}</HoverTip>
            </div>
            {day.title && (
              <div
                data-testid="today-title"
                className="w-3/5 text-right"
                style={{
                  fontFamily: "var(--font-display)",
                  color: "var(--accent)",
                  fontSize: titleFontSize(day.title),
                }}
              >
                {day.title}
              </div>
            )}
          </div>

          {/* Steps, sleep and the workout line all moved out of the today tile — steps/sleep onto
              their own widgets (stats sparkline + sleep tile), the workout to be re-homed later.
              The header now sits directly above the quest map, which takes all the freed space. */}

          {/* Будни — карта-тропа дисциплины (QuestMap, §5.6): остановки со стриками. Выходные —
              отдых: карта уступает место сцене-горизонту (WeekendScene), т.к. все дела будничные
              и пустая тропа в субботу читалась бы как провал. Развилка — по дню выбранной даты
              (isWeekend), и только для волн со сценой (hasWeekendScene); прочие держат карту.
              Монстр переносится на выходной единственным элементом (угол сцены). Обе ветки —
              flex-1 дети, растут на всю высоту под шапкой. */}
          {isWeekend(day.date) && hasWeekendScene(wave) ? (
            <WeekendScene wave={wave!} monsterDrunk={monsterDrunk} />
          ) : (
            <QuestMap
              items={day.discipline}
              monsterDrunk={monsterDrunk}
              monsterCleanStreak={day.monsterCleanStreak ?? 0}
              wave={wave}
              lens={lens}
              onLensChange={onLensChange}
            />
          )}
        </div>
      )}
    </TileShell>
  );
}
