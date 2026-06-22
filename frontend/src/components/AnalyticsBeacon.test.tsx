import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyticsBeacon } from "./AnalyticsBeacon";

vi.mock("@/lib/api/client", () => ({ postBeacon: vi.fn(), postInteractions: vi.fn() }));
import { postBeacon } from "@/lib/api/client";
const postBeaconMock = vi.mocked(postBeacon);

afterEach(() => vi.clearAllMocks());

describe("AnalyticsBeacon", () => {
  it("шлёт load-бикон на монтировании с путём и visitId", async () => {
    render(<AnalyticsBeacon />);
    await waitFor(() => expect(postBeaconMock).toHaveBeenCalledTimes(1));
    const payload = postBeaconMock.mock.calls[0][0];
    expect(payload.path).toBe("/");
    expect(typeof payload.visitId).toBe("string");
    expect(payload.visitId.length).toBeGreaterThan(0);
  });
});
