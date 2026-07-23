import type { CSSProperties } from "react";

/** Waves shipping a weekend rest-scene asset (/assets/waves/<wave>/today/weekend-horizon.png).
 *  Waves without one keep the discipline quest map on weekends (graceful fallback). */
const WEEKEND_SCENE_WAVES = new Set(["wave-01"]);

/** Does this wave have a weekend rest scene? Gate for swapping the quest map on Sat/Sun. */
export function hasWeekendScene(wave?: string | null): boolean {
  return wave != null && WEEKEND_SCENE_WAVES.has(wave);
}

interface WeekendSceneProps {
  wave: string;
  /** Whether the monster was drunk that day — the one discipline event kept on weekends. */
  monsterDone: boolean;
}

const pixelated: CSSProperties = { imageRendering: "pixelated" };

/**
 * Weekend body of the "Сегодня" tile (§5.6). Weekdays are demanding — a discipline quest map with
 * streaks. Weekends are rest: the map is replaced by a calm dawn-horizon scene (all chores are
 * weekday chores, so an empty trail on a Saturday would read as failure). The scene PNG has a
 * **transparent background** — only the small distant sun, horizon and reflection are drawn, so the
 * tile's own surface is the sky and there is no pasted-in box (it blends like the SVG quest map).
 * Anchored to the bottom so the sun sits low with open sky above; the header (date + day name) stays.
 *
 * The single carry-over is the **monster**, tracked every day — but on weekends there are **no
 * streaks**, just a one-line checklist centered at the bottom, spelled out in words (a tick was
 * ambiguous): **«монстр — не пил»** (clean, `--accent`) or **«монстр — пил»** (drunk, `--danger`).
 */
export function WeekendScene({ wave, monsterDone }: WeekendSceneProps) {
  return (
    <div
      className="weekend-scene"
      style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}
      role="img"
      aria-label={`Выходной — отдых. ${monsterDone ? "монстр выпит" : "монстр не пил"}`}
      data-testid="weekend-scene"
    >
      {/* Сцена — прозрачный пиксель-рассвет волны, прижат к низу (солнце низко, небо-плитка сверху). */}
      <img
        src={`/assets/waves/${wave}/today/weekend-horizon.png`}
        alt=""
        aria-hidden
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: "auto", ...pixelated }}
      />
      {/* Монстр на выходной — без стриков: короткий чеклист словами снизу по центру
          («пил»/«не пил» — галочка была неоднозначной). Только текст, читается сразу. */}
      <div
        className="weekend-monster"
        data-testid="weekend-monster"
        data-done={monsterDone}
        style={{
          position: "absolute",
          bottom: "5%",
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: "var(--font-mono)",
          fontSize: "clamp(10px, 2.4cqw, 15px)",
          fontWeight: 600,
          color: "var(--text-secondary, var(--text-tertiary))",
          letterSpacing: "0.02em",
        }}
      >
        монстр —{" "}
        <span
          data-testid="weekend-monster-mark"
          style={{ fontWeight: 700, color: monsterDone ? "var(--danger, #d1553b)" : "var(--accent)" }}
        >
          {monsterDone ? "пил" : "не пил"}
        </span>
      </div>
    </div>
  );
}
