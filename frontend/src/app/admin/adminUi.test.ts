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

describe("artifactRunLabel — archive run summary (§5.12)", () => {
  it("counts drops on the go, not only frames", () => {
    // Across two hundred frames the frame counter moves imperceptibly; "drop 3 of 6" reads at once.
    const label = artifactRunLabel(run({ dropsDone: 2, checked: 70, found: 4 }));
    expect(label).toContain("дроп 3 из 6");
    expect(label).toContain("70/216");
  });

  it("names the item the run was started for", () => {
    expect(artifactRunLabel(run({ artifactName: "футболка с Цицероном" })))
      .toContain("«футболка с Цицероном»");
    expect(artifactRunLabel(run({}))).toContain("все предметы");
  });

  it("a run where everything was skipped and nothing found names the reason", () => {
    // The main case: a silent provider looks exactly like a successful empty run. The difference
    // shows only here, so the label says outright where to dig.
    const label = artifactRunLabel(run({ state: "done", checked: 0, skipped: 216 }));
    expect(label).toContain("модель не отвечала");
    expect(label).toContain("DANCHUO_LLM_PROVIDER");
  });

  it("an honestly empty run does not scare with a reason", () => {
    const label = artifactRunLabel(run({ state: "done", checked: 216, skipped: 0, found: 0 }));
    expect(label).not.toContain("модель не отвечала");
    expect(label).toContain("проверено 216/216");
  });

  it("a stopped run shows where it stopped", () => {
    const label = artifactRunLabel(run({ state: "cancelled", checked: 40, skipped: 2, found: 3 }));
    expect(label).toContain("остановлен на 42/216");
  });

  it("no line before the first run", () => {
    expect(artifactRunLabel(run({ state: "idle", drops: 0, total: 0 }))).toBe("");
  });
});
