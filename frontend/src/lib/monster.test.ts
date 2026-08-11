import { describe, expect, it } from "vitest";
import { monsterVerdict } from "./monster";

describe("вердикт монстра", () => {
  it("говорит глаголом, а не «сделано/не сделано»", () => {
    expect(monsterVerdict(true).verb).toBe("пил");
    expect(monsterVerdict(false).verb).toBe("не пил");
  });

  it("фраза целиком ставит глагол ПЕРЕД словом «монстр» — так её и читают вслух", () => {
    expect(monsterVerdict(true).phrase).toBe("пил монстр");
    expect(monsterVerdict(false).phrase).toBe("не пил монстр");
  });

  it("цвета — разные токены, а не два оттенка тревоги", () => {
    // Регрессионный якорь: «не пил» когда-то шёл --accent, а на волне 01 это #e2604c —
    // почти тот же тон, что --danger. Состояния различались одним словом.
    expect(monsterVerdict(false).color).toContain("--accent-clean");
    expect(monsterVerdict(true).color).toContain("--danger");
    // И зелёный не одолжен у чужой роли: --accent-code это канал вкладов GitHub,
    // --success держит связи тропы (см. DESIGN §3.2).
    expect(monsterVerdict(false).color).not.toContain("--accent-code");
    expect(monsterVerdict(false).color).not.toContain("--success");
  });

  it("тон — ключ состояния для CSS-модификаторов (карта, календарь)", () => {
    expect(monsterVerdict(true).tone).toBe("drunk");
    expect(monsterVerdict(false).tone).toBe("clean");
  });

  it("нет данных за день — вердикта НЕТ, а не «не пил» по умолчанию", () => {
    // Дефолтное «не пил» выдавало отсутствие записи за факт: у будущего дня и у дырки
    // в записи монстра никто не отмечал, а борд утверждал, что день был чистый.
    const unknown = monsterVerdict(null);
    expect(unknown.tone).toBe("unknown");
    expect(unknown.verb).toBeNull();
    expect(unknown.phrase).toBe("нет данных о монстре");
  });

  it("«нет данных» молчит и цветом: ни зелёного, ни тревожного", () => {
    const unknown = monsterVerdict(null);
    expect(unknown.color).not.toContain("--accent-clean");
    expect(unknown.color).not.toContain("--danger");
    expect(unknown.color).toContain("--text-tertiary");
  });
});
