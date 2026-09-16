import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DropUploadForm } from "./DropUploadForm";
import type { AdminDropView } from "@/lib/api/types";
import { uploadDrop } from "@/lib/api/admin";

vi.mock("@/lib/api/admin", () => ({
  uploadDrop: vi.fn(),
  AdminApiError: class extends Error {},
}));

const DROP: AdminDropView = {
  id: 7,
  title: "чн",
  droppedOn: "2026-08-02",
  monthLabel: "август",
  photoCount: 37,
  coverPhotoId: null,
};

async function upload() {
  fireEvent.change(screen.getByLabelText("название дропа"), { target: { value: "чн" } });
  const file = new File(["zip"], "drop.zip", { type: "application/zip" });
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "загрузить" }));
  await waitFor(() => expect(screen.getByText(/загружено/)).toBeInTheDocument());
}

describe("DropUploadForm — свежий дроп зовёт на поиск артефактов (§5.12)", () => {
  beforeEach(() => {
    vi.mocked(uploadDrop).mockResolvedValue({ drop: DROP, processed: 37, skipped: 0 });
  });

  it("до загрузки кнопки поиска нет", () => {
    render(
      <DropUploadForm
        token="t"
        activeDropId={null}
        artifactScan={null}
        onScanArtifacts={() => {}}
        onUploaded={async () => {}}
        onError={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /искать все предметы/ })).toBeNull();
  });

  it("после заливки прямо говорит, что артефакты НЕ проверены, и даёт кнопку", async () => {
    // The point here: an artifact scan does NOT start by itself (unlike the rotation check), so
    // without this line a fresh drop silently stays unchecked.
    render(
      <DropUploadForm
        token="t"
        activeDropId={DROP.id}
        artifactScan={null}
        onScanArtifacts={() => {}}
        onUploaded={async () => {}}
        onError={() => {}}
      />,
    );
    await upload();
    expect(screen.getByText(/артефакты: не проверялись/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /искать все предметы/ })).toBeInTheDocument();
  });

  it("клик по кнопке запускает прогон", async () => {
    const onScanArtifacts = vi.fn();
    render(
      <DropUploadForm
        token="t"
        activeDropId={DROP.id}
        artifactScan={null}
        onScanArtifacts={onScanArtifacts}
        onUploaded={async () => {}}
        onError={() => {}}
      />,
    );
    await upload();
    fireEvent.click(screen.getByRole("button", { name: /искать все предметы/ }));
    expect(onScanArtifacts).toHaveBeenCalled();
  });

  it("на бегущем прогоне кнопка занята и показывает счёт", async () => {
    render(
      <DropUploadForm
        token="t"
        activeDropId={DROP.id}
        artifactScan={{ state: "running", total: 37, checked: 12, found: 2, skipped: 0 }}
        onScanArtifacts={() => {}}
        onUploaded={async () => {}}
        onError={() => {}}
      />,
    );
    await upload();
    expect(screen.getByRole("button", { name: /ищу артефакты/ })).toBeDisabled();
    expect(screen.getByText(/12\/37/)).toBeInTheDocument();
  });

  it("уход на другой дроп убирает блок — иначе он показывал бы чужой статус", async () => {
    // The admin has one scan status and it belongs to the SELECTED drop; pick another one and the
    // invitation to scan the fresh drop is no longer about it.
    const { rerender } = render(
      <DropUploadForm
        token="t"
        activeDropId={DROP.id}
        artifactScan={null}
        onScanArtifacts={() => {}}
        onUploaded={async () => {}}
        onError={() => {}}
      />,
    );
    await upload();
    expect(screen.getByRole("button", { name: /искать все предметы/ })).toBeInTheDocument();
    rerender(
      <DropUploadForm
        token="t"
        activeDropId={99}
        artifactScan={null}
        onScanArtifacts={() => {}}
        onUploaded={async () => {}}
        onError={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /искать все предметы/ })).toBeNull();
  });
});
