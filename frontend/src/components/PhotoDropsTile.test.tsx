import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoDropsTile } from "./PhotoDropsTile";

vi.mock("@/lib/api/client", () => ({ getDrops: vi.fn() }));
import { getDrops } from "@/lib/api/client";
const getDropsMock = vi.mocked(getDrops);

afterEach(() => vi.clearAllMocks());

describe("PhotoDropsTile (компактная лента)", () => {
  it("нет дропов → пустое состояние «пока нет дропов»", async () => {
    getDropsMock.mockResolvedValue([]);
    render(<PhotoDropsTile />);
    expect(await screen.findByText("пока нет дропов")).toBeInTheDocument();
  });

  it("есть дропы → перечисляет все (сама лента и есть архив)", async () => {
    getDropsMock.mockResolvedValue([
      { id: 2, title: "Июльская плёнка", droppedOn: "2026-07-02", monthLabel: "июль 2026", photoCount: 12, coverPhotoUrl: "/api/film-media/2/0/thumb" },
      { id: 1, title: "Июньская плёнка", droppedOn: "2026-06-10", monthLabel: "июнь 2026", photoCount: 36, coverPhotoUrl: "/api/film-media/1/0/thumb" },
    ]);

    render(<PhotoDropsTile />);

    expect(await screen.findByText("Июльская плёнка")).toBeInTheDocument();
    expect(screen.getByText("Июньская плёнка")).toBeInTheDocument();
  });

  it("горизонтальная полка (orientation=horizontal) — карточки с названием и месяцем", async () => {
    getDropsMock.mockResolvedValue([
      { id: 2, title: "Июльская плёнка", droppedOn: "2026-07-02", monthLabel: "июль 2026", photoCount: 12, coverPhotoUrl: "/api/film-media/2/0/thumb" },
      { id: 1, title: "Июньская плёнка", droppedOn: "2026-06-10", monthLabel: "июнь 2026", photoCount: 36, coverPhotoUrl: "/api/film-media/1/0/thumb" },
    ]);

    render(<PhotoDropsTile orientation="horizontal" />);

    // Название читается целиком (двухстрочный клэмп, не однострочный обруб) + месяц под ним.
    expect(await screen.findByText("Июльская плёнка")).toBeInTheDocument();
    expect(screen.getByText("июль 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Открыть дроп «Июньская плёнка»" })).toBeInTheDocument();
  });
});
