import type { CSSProperties } from "react";
import { monsterVerdict } from "@/lib/monster";

interface WeekendSceneProps {
  wave: string;
  /** Был ли монстр выпит — единственное дело будней, оставленное на выходной. `null` — за
   *  день записи нет, и тогда вердикта тоже нет (отсутствие записи не выдаём за «не пил»). */
  monsterDrunk: boolean | null;
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
 * ambiguous): **«монстр — не пил»** (clean, `--accent-clean`) or **«монстр — пил»** (drunk, `--danger`).
 *
 * Wording and colors come from [monsterVerdict] — the same source the weekday quest map now uses,
 * so the board says «пил»/«не пил» in one voice regardless of which day you land on.
 */
export function WeekendScene({ wave, monsterDrunk }: WeekendSceneProps) {
  const monster = monsterVerdict(monsterDrunk);
  return (
    <div
      className="weekend-scene"
      // Все слои сцены — absolute, своего контента по высоте у неё нет: в бенто высоту даёт
      // flex-рост, в стеке (§8) — aspect-ratio класса `.weekend-scene` (иначе схлопывается в ноль).
      style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}
      role="img"
      aria-label={`Выходной — отдых. ${monster.phrase}`}
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
          («пил»/«не пил» — галочка была неоднозначной). Только текст, читается сразу.
          Без записи за день вердикта нет: строка становится тихим «нет данных» третичным
          цветом, а не утверждает «не пил» — отсутствие записи это не чистый день. */}
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
          // Вердикт жирный; «нет данных» остаётся обычным весом — это не ответ, а его отсутствие.
          style={{ fontWeight: monster.verb ? 700 : 400, color: monster.color }}
        >
          {monster.verb ?? "нет данных"}
        </span>
      </div>
    </div>
  );
}
