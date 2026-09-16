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
  /** Today in MSK, for the tile's relative caption ("yesterday", "last Tuesday", and so on). */
  today: string;
  state: TileState;
  onRetry?: () => void;
  /** Active wave key — forwarded to [QuestMap] so waves with a sprite set swap glyphs (DESIGN §12). */
  wave?: string | null;
  /** The calendar lens (PRD §5.3) — the selected stop of the trail map, and its switch. */
  lens?: DisciplineLens | null;
  onLensChange?: (lens: DisciplineLens | null) => void;
  style?: CSSProperties;
  className?: string;
}

// The formatter is built once per module, `Intl` being expensive to create. Day and month come from
// `Intl`, while the year is appended as a word, since ru-RU abbreviates it (DESIGN §4).
const DAY_MONTH_RU_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** The mono style is static, so it is kept outside the component and not rebuilt per render. */
const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

/**
 * Day-name font size, fitted to TWO lines of its share of the header. Two rather than one because
 * one line paid for length in SIZE: a real 75-character name came out unreadable, while across two
 * lines it is twice as large. The floor is in container units AND pixels, for the phone stack.
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

/** Long Russian date in mono (DESIGN §4), with the year spelled out rather than abbreviated. */
function longDateRu(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAY_MONTH_RU_FMT.format(d)} ${d.getUTCFullYear()} год`;
}

/**
 * The "Today" tile, the board's dominant (DESIGN §3, §4). Hierarchy: date → day name → stats line →
 * the discipline trail map, with the monster as a detour on it. An empty or future day is a valid
 * view: stats say "no data" (though 0 stays 0) and the map is a scaffold with open stops.
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
  // The tile's caption is relative to the selected date: it says "today" only when today is selected.
  const label = day ? relativeDayRu(day.date, today) : "сегодня";
  // A day of the neighbouring month is selected → the tile's ground shifts slightly (DESIGN §4), as
  // the cell does in the calendar.
  const otherMonth = day != null && day.date.slice(0, 7) !== today.slice(0, 7);
  // The day-of-life number is a hint on the date: the date stays a date, the count rises on hover.
  const lifeDay = day ? lifeDayLabel(day.date) : null;
  // The monster has three states (PRD §5.6): `null` means the day was never marked and there is no
  // verdict at all. The answer arrives ready from the backend; `undefined` from an old cache reads
  // as "not marked".
  const monsterDrunk = day?.monsterDrunk ?? null;
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
      // The corner scatter (DESIGN §2.4) is only on the focus tile (the `scatter` prop); the border
      // comes from `.pixel-tile`.
      className={className}
    >
      {day && (
        <div className="flex h-full flex-col gap-3" style={{ containerType: "inline-size" }}>
          {/* Date and day name share the header, split 2/5 to 3/5, so long names render at a
              confident size. The date shrinks to fit ONE line while the name WRAPS and is sized to
              two; baselines align on its FIRST line, and the quest map below pays for the height. */}
          <div
            className="flex items-baseline"
            style={{ fontSize: "min(4cqw, 40px)", lineHeight: 1.2 }}
          >
            <div
              data-testid="today-date"
              style={day.title ? { ...mono, fontSize: dateFontSize(longDateRu(day.date)) } : mono}
              className={day.title ? "w-2/5 whitespace-nowrap" : "whitespace-nowrap"}
            >
              {/* The life-day number is a wave hint ([HoverTip]) rather than a native `title`: that
                  drew outside the board's visual system and dragged a `help` cursor promising more
                  than a non-interactive date has. The wrapper hugs the text, not the whole cell. */}
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

          {/* Weekdays get the discipline quest map (§5.6). Weekends get rest: the map gives way to
              a horizon scene, because every item is a weekday one and an empty trail on a Saturday
              would read as failure. The fork is by the selected date, for waves with a scene. */}
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
