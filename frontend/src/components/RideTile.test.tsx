import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RideView } from "@/lib/api/types";

vi.mock("@/lib/api/client", () => ({ getRides: vi.fn() }));
// The map and the modal are stubbed (the map is client-only); the canvas is what the tile snapshots.
vi.mock("./RideMap", () => ({
  RideMap: () => (
    <div data-testid="ride-map">
      <canvas />
    </div>
  ),
}));
vi.mock("./RidesModal", () => ({
  RidesModal: ({ preview, onClose }: { preview?: string | null; onClose: () => void }) => (
    <div data-testid="rides-modal" data-preview={preview ?? ""}>
      <button onClick={onClose}>close-stub</button>
    </div>
  ),
}));

import { getRides } from "@/lib/api/client";
import { RideTile } from "./RideTile";

const getRidesMock = vi.mocked(getRides);

const base = (over: Partial<RideView>): RideView => ({
  id: 1,
  rideDate: "2026-07-11",
  startTime: "",
  finishTime: "",
  distanceMeters: 6900,
  durationSeconds: 2640,
  calories: 168,
  costKopecks: 5243,
  accessKopecks: null,
  coveredByTariffKopecks: null,
  totalKopecks: null,
  vehicleType: null,
  tariffName: null,
  startLat: 55.7,
  startLon: 37.5,
  finishLat: 55.76,
  finishLon: 37.63,
  startAddress: null,
  finishAddress: null,
  ...over,
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("RideTile — entries into the rides modal", () => {
  it("a click on the mini-map opens the modal", async () => {
    getRidesMock.mockResolvedValue([base({ id: 10 }), base({ id: 11, rideDate: "2026-07-10" })]);
    render(<RideTile />);

    const mapButton = await screen.findByRole("button", { name: "Открыть карту поездок" });
    expect(screen.queryByTestId("rides-modal")).toBeNull();

    fireEvent.click(mapButton);
    expect(screen.getByTestId("rides-modal")).toBeInTheDocument();
  });

  it("the click captures the tile map's frame and hands it to the modal — the flight does not wait for the window's tiles", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,SHOT");
    getRidesMock.mockResolvedValue([base({ id: 10 })]);
    render(<RideTile />);

    fireEvent.click(await screen.findByRole("button", { name: "Открыть карту поездок" }));
    expect(screen.getByTestId("rides-modal").dataset.preview).toBe("data:image/png;base64,SHOT");
  });

  it("the canvas did not give up the frame (tainted) — the modal opens without a snapshot", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => {
      throw new DOMException("tainted", "SecurityError");
    });
    getRidesMock.mockResolvedValue([base({ id: 10 })]);
    render(<RideTile />);

    fireEvent.click(await screen.findByRole("button", { name: "Открыть карту поездок" }));
    expect(screen.getByTestId("rides-modal").dataset.preview).toBe("");
  });

  it("the mini-map box hooks onto .ride-map-box — CSS gives it its height", async () => {
    // The map draws into a `height: 100%` container, which takes its percentage from the button's
    // box. In bento that height comes from the tile, in the mobile stack there is none ⇒ the map
    // initialises into zero height. The pixels are checked by `app/styles/stackHeights.test.ts`.
    getRidesMock.mockResolvedValue([base({ id: 10 })]);
    render(<RideTile />);

    const mapButton = await screen.findByRole("button", { name: "Открыть карту поездок" });
    expect(mapButton).toHaveClass("ride-map-box");
  });

  it("the \"previous\" button opens the modal too", async () => {
    getRidesMock.mockResolvedValue([base({ id: 10 }), base({ id: 11, rideDate: "2026-07-10" })]);
    render(<RideTile />);

    const prev = await screen.findByRole("button", { name: "Предыдущие поездки" });
    fireEvent.click(prev);
    expect(screen.getByTestId("rides-modal")).toBeInTheDocument();
  });

  it("the tile shows distance and time, no calories (kcal live only in the modal)", async () => {
    getRidesMock.mockResolvedValue([base({ id: 10, distanceMeters: 6900, durationSeconds: 2640, calories: 168 })]);
    render(<RideTile />);

    expect(await screen.findByText("6.9 км")).toBeInTheDocument();
    expect(screen.getByText("44 мин")).toBeInTheDocument();
    expect(screen.queryByText(/ккал/)).toBeNull();
  });
});

