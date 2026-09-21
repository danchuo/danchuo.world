import { describe, expect, it } from "vitest";
import { resolveLayout, type TileSpan } from "@/lib/layout";
import { ACTIVE_WAVE_KEY, resolveDisplayWave, WAVES } from "./index";

/** Cells a visible tile occupies, as `row:col` keys — the material for the overlap check. */
function cells(span: TileSpan): string[] {
  const out: string[] = [];
  for (let r = span.row; r < span.row + span.rowSpan; r += 1) {
    for (let c = span.col; c < span.col + span.colSpan; c += 1) out.push(`${r}:${c}`);
  }
  return out;
}

describe("реестр волн", () => {
  it("ключи уникальны, активная волна — одна из списка", () => {
    expect(new Set(WAVES.map((w) => w.key)).size).toBe(WAVES.length);
    expect(WAVES.some((w) => w.key === ACTIVE_WAVE_KEY)).toBe(true);
  });

  it("волна посетителя перекрывает активную, неизвестный ключ тихо игнорируется", () => {
    expect(resolveDisplayWave("wave-02").key).toBe("wave-02");
    expect(resolveDisplayWave(null).key).toBe(ACTIVE_WAVE_KEY);
    // A cookie outlives the wave it names — a stale key must not blank the board.
    expect(resolveDisplayWave("wave-99").key).toBe(ACTIVE_WAVE_KEY);
  });
});

/**
 * The board of every wave, checked by machine. While layouts lived in the database this was done
 * by hand, cell by cell, in the comment of each migration — and a wave carried tile ids the code
 * had never heard of without anyone noticing.
 */
describe.each(WAVES.map((w) => [w.key, w] as const))("раскладка волны %s", (_key, wave) => {
  const layout = resolveLayout(wave.layout);
  // The bento board only: a tile kept for the stack alone owns no cell here (DESIGN §10.1).
  const visible = (Object.entries(layout.tiles) as [string, TileSpan][]).filter(
    ([, span]) => !span.hidden && span.only !== "stack",
  );

  it("плитки не выходят за пределы грида", () => {
    for (const [id, span] of visible) {
      expect(`${id}: ${span.col}..${span.col + span.colSpan - 1}`).toBe(
        `${id}: ${span.col}..${Math.min(span.col + span.colSpan - 1, layout.cols)}`,
      );
      expect(`${id}: ${span.row}..${span.row + span.rowSpan - 1}`).toBe(
        `${id}: ${span.row}..${Math.min(span.row + span.rowSpan - 1, layout.rows)}`,
      );
    }
  });

  it("плитки не накладываются друг на друга", () => {
    const taken = new Map<string, string>();
    const collisions: string[] = [];
    for (const [id, span] of visible) {
      for (const cell of cells(span)) {
        const owner = taken.get(cell);
        if (owner) collisions.push(`${owner} × ${id} @ ${cell}`);
        else taken.set(cell, id);
      }
    }
    expect(collisions).toEqual([]);
  });

  it("переключатель волн виден — иначе волну не сменить", () => {
    expect(layout.tiles.waveSwitcher.hidden).toBe(false);
  });
});
