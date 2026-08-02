import { describe, expect, it } from "vitest";
import { artifactRunLabel } from "./adminUi";
import type { ArtifactScanRunView } from "@/lib/api/types";

const run = (patch: Partial<ArtifactScanRunView>): ArtifactScanRunView => ({
  state: "running",
  total: 216,
  checked: 0,
  found: 0,
  skipped: 0,
  drops: 6,
  dropsDone: 0,
  artifactName: null,
  ...patch,
});

describe("artifactRunLabel — сводка прогона по архиву (§5.12)", () => {
  it("на ходу считает дропы, а не только кадры", () => {
    // На двухстах кадрах счётчик кадров движется незаметно — «дроп 3 из 6» читается сразу.
    const label = artifactRunLabel(run({ dropsDone: 2, checked: 70, found: 4 }));
    expect(label).toContain("дроп 3 из 6");
    expect(label).toContain("70/216");
  });

  it("называет предмет, ради которого прогон затеян", () => {
    expect(artifactRunLabel(run({ artifactName: "футболка с Цицероном" })))
      .toContain("«футболка с Цицероном»");
    expect(artifactRunLabel(run({}))).toContain("все предметы");
  });

  it("прогон, где всё пропущено и ничего не найдено, называет причину", () => {
    // Главный кейс: молчащий провайдер выглядит как успешный пустой прогон. Разница
    // видна только здесь, поэтому строка прямо указывает, где копать.
    const label = artifactRunLabel(run({ state: "done", checked: 0, skipped: 216 }));
    expect(label).toContain("модель не отвечала");
    expect(label).toContain("DANCHUO_LLM_PROVIDER");
  });

  it("честно пустой прогон причиной не пугает", () => {
    const label = artifactRunLabel(run({ state: "done", checked: 216, skipped: 0, found: 0 }));
    expect(label).not.toContain("модель не отвечала");
    expect(label).toContain("проверено 216/216");
  });

  it("остановленный прогон показывает, где встал", () => {
    const label = artifactRunLabel(run({ state: "cancelled", checked: 40, skipped: 2, found: 3 }));
    expect(label).toContain("остановлен на 42/216");
  });

  it("до первого прогона строки нет", () => {
    expect(artifactRunLabel(run({ state: "idle", drops: 0, total: 0 }))).toBe("");
  });
});
