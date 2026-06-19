import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoDropsTile } from "./PhotoDropsTile";

vi.mock("@/lib/api/client", () => ({ getDrops: vi.fn() }));
import { getDrops } from "@/lib/api/client";
const getDropsMock = vi.mocked(getDrops);

afterEach(() => vi.clearAllMocks());

describe("PhotoDropsTile", () => {
  it("до B1 (нет дропов) → пустое состояние «пока нет дропов»", async () => {
    getDropsMock.mockResolvedValue([]);
    render(<PhotoDropsTile />);
    expect(await screen.findByText("пока нет дропов")).toBeInTheDocument();
  });
});
