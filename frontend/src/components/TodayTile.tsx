import type { CSSProperties } from "react";
import type { DayView } from "@/lib/api/types";
import { formatSleep, formatSteps } from "@/lib/format";
import { relativeDayRu } from "@/lib/relativeDay";
import { QuestMap } from "./QuestMap";
import { TileShell, type TileState } from "./TileShell";

interface TodayTileProps {
  day: DayView | null;
  /** Сегодня MSK — для относительной подписи плитки («вчера», «в прошлый вторник», …). */
  today: string;
  state: TileState;
  onRetry?: () => void;
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
 * Day-name font size that always fits one line in its half of the header. Worst-case
 * glyph advance is mono's 0.6em (wave 01 maps --font-display to mono; other display
 * faces are narrower), and the half is ~50cqw, so a len-char name fits 48cqw when
 * size = 48 / (0.6 * len) = 80/len cqw. Names ≤20 chars keep the shared 4cqw size.
 */
function titleFontSize(title: string): string {
  return `min(4cqw, 40px, ${(80 / title.length).toFixed(2)}cqw)`;
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
export function TodayTile({ day, today, state, onRetry, style, className }: TodayTileProps) {
  // Подпись плитки относительна выбранной дате: «сегодня» только когда выбран сегодня.
  const label = day ? relativeDayRu(day.date, today) : "сегодня";
  // Выбран день соседнего месяца → фон плитки чуть меняется (§4), как и ячейка в календаре.
  const otherMonth = day != null && day.date.slice(0, 7) !== today.slice(0, 7);
  const tileStyle = otherMonth ? { ...style, background: "var(--surface-othermonth)" } : style;
  return (
    <TileShell
      state={state}
      onRetry={onRetry}
      elevated
      label={label}
      ariaLabel="Сегодня"
      style={tileStyle}
      // Заклёпки (§2.4) — только на фокусной плитке; кант приходит из .pixel-tile.
      className={["pixel-tile--rivets", className].filter(Boolean).join(" ")}
    >
      {day && (
        <div className="flex h-full flex-col gap-3" style={{ containerType: "inline-size" }}>
          {/* Date and day name share one line 50/50 at the same size; without a name the
              date keeps that size on its own. The size is fit to the tile via container
              units: the longest date ("28 сентября 2026 год", 20 mono chars ≈ 12em) must
              fill its half without ever wrapping (nowrap), so 4cqw ≈ 48cqw of text + slack.
              Name uses --font-display (wave 01 maps it to mono, wave 02 to the pixel face)
              and hugs the right edge of its half. The header must stay EXACTLY one line:
              a wrapped name steals height from the quest map below, which letterboxes
              (shrinks whole and gains side gaps) — so long names shrink their font
              (titleFontSize) instead of wrapping. */}
          <div
            className="flex items-baseline"
            style={{ fontSize: "min(4cqw, 40px)", lineHeight: 1.2 }}
          >
            <div
              data-testid="today-date"
              style={mono}
              className={day.title ? "w-1/2 whitespace-nowrap" : "whitespace-nowrap"}
            >
              {longDateRu(day.date)}
            </div>
            {day.title && (
              <div
                data-testid="today-title"
                className="w-1/2 whitespace-nowrap text-right"
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

          <div style={{ ...mono, color: "var(--text-secondary)" }} className="flex flex-wrap gap-x-4">
            <span>шаги: {formatSteps(day.health.steps)}</span>
            <span>сон: {formatSleep(day.health.sleepMinutes)}</span>
            {day.workouts.length > 0 && (
              <span>
                тренировка: {day.workouts[0].type} {day.workouts[0].durationMinutes} мин
              </span>
            )}
          </div>

          {/* Дисциплина — карта-тропа дня (QuestMap, §5.6): остановки вместо списка дробей.
              Monster lives on the map only (detour stop); no separate footer note/can image —
              flavor-specific art is backlogged to land inside the map, not as its own block. */}
          <QuestMap items={day.discipline} monsterDone={day.monster != null} />
        </div>
      )}
    </TileShell>
  );
}
