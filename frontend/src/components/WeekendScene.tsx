import type { CSSProperties } from "react";
import { monsterVerdict } from "@/lib/monster";

interface WeekendSceneProps {
  wave: string;
  /** Whether the monster was drunk — the only weekday matter left for a weekend. `null` means
   *  there is no record for the day, and then no verdict either. */
  monsterDrunk: boolean | null;
}

const pixelated: CSSProperties = { imageRendering: "pixelated" };

/**
 * The weekend body of the "Today" tile. Weekdays are demanding — a quest map with streaks — while
 * weekends are rest, since every chore is a weekday chore and an empty trail on a Saturday would
 * read as failure. The only carry-over is the monster, spelled out in words. PRD §5.6
 */
export function WeekendScene({ wave, monsterDrunk }: WeekendSceneProps) {
  const monster = monsterVerdict(monsterDrunk);
  return (
    <div
      className="weekend-scene"
      // Every layer of the scene is absolute, so it has no content height of its own: in bento the
      // height comes from flex growth, in the stack from `.weekend-scene`'s aspect-ratio (§8).
      style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}
      role="img"
      aria-label={`Выходной — отдых. ${monster.phrase}`}
      data-testid="weekend-scene"
    >
      {/* The scene is the wave's transparent pixel dawn, pinned to the bottom (a low sun). */}
      <img
        src={`/assets/waves/${wave}/today/weekend-horizon.png`}
        alt=""
        aria-hidden
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: "auto", ...pixelated }}
      />
      {/* The monster on a weekend, with no streaks: a short worded checklist at the bottom centre
          (a tick was ambiguous). With no record for the day there is no verdict — the line becomes
          a quiet "no data" in the tertiary colour rather than claiming "not drunk". */}
      <div
        className="weekend-monster"
        data-testid="weekend-monster"
        data-tone={monster.tone}
        data-done={monsterDrunk ?? false}
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
          // The verdict is bold; "no data" keeps the normal weight — it is the absence of an answer.
          style={{ fontWeight: monster.verb ? 700 : 400, color: monster.color }}
        >
          {monster.verb ?? "нет данных"}
        </span>
      </div>
    </div>
  );
}
