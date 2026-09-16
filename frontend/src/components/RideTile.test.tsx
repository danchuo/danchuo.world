import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RideView } from "@/lib/api/types";

vi.mock("@/lib/api/client", () => ({ getRides: vi.fn() }));
// The map and the modal are stubbed (the map is client-only). The map stub repeats the key part
// of its lifecycle: on a wave change the map is REBUILT (the wave's pins arrive in the style) and
// is "ready" again only a tick later, like the real one waiting for tiles.
vi.mock("./RideMap", () => ({
  RideMap: ({ wave, onReady }: { wave?: string | null; onReady?: () => void }) => {
    useEffect(() => {
      const t = setTimeout(() => onReady?.(), 0);
      return () => clearTimeout(t);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wave]);
    return <div data-testid="ride-map" />;
  },
}));
vi.mock("./RidesModal", () => ({
  RidesModal: ({ edition, onClose }: { edition?: string; onClose: () => void }) => (
    <div data-testid="rides-modal" data-edition={edition ?? ""}>
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

afterEach(() => vi.clearAllMocks());

describe("RideTile — входы в модалку поездок", () => {
  it("клик по мини-карте открывает модалку", async () => {
    getRidesMock.mockResolvedValue([base({ id: 10 }), base({ id: 11, rideDate: "2026-07-10" })]);
    render(<RideTile />);

    const mapButton = await screen.findByRole("button", { name: "Открыть карту поездок" });
    expect(screen.queryByTestId("rides-modal")).toBeNull();

    fireEvent.click(mapButton);
    expect(screen.getByTestId("rides-modal")).toBeInTheDocument();
  });

  it("бокс мини-карты зацеплен за .ride-map-box — свою высоту ему даёт CSS", async () => {
    // The map draws into a `height: 100%` container, which takes its percentage from the button's
    // box. In bento that height comes from the tile, in the mobile stack there is none ⇒ the map
    // initialises into zero height. The pixels are checked by `app/styles/stackHeights.test.ts`.
    getRidesMock.mockResolvedValue([base({ id: 10 })]);
    render(<RideTile />);

    const mapButton = await screen.findByRole("button", { name: "Открыть карту поездок" });
    expect(mapButton).toHaveClass("ride-map-box");
  });

  it("кнопка «предыдущие» тоже открывает модалку", async () => {
    getRidesMock.mockResolvedValue([base({ id: 10 }), base({ id: 11, rideDate: "2026-07-10" })]);
    render(<RideTile />);

    const prev = await screen.findByRole("button", { name: "Предыдущие поездки" });
    fireEvent.click(prev);
    expect(screen.getByTestId("rides-modal")).toBeInTheDocument();
  });

  it("на тайле — дистанция и время, без калорий (ккал живут только в модалке)", async () => {
    getRidesMock.mockResolvedValue([base({ id: 10, distanceMeters: 6900, durationSeconds: 2640, calories: 168 })]);
    render(<RideTile />);

    expect(await screen.findByText("6.9 км")).toBeInTheDocument();
    expect(screen.getByText("44 мин")).toBeInTheDocument();
    expect(screen.queryByText(/ккал/)).toBeNull();
  });
});

describe("RideTile — редакция `map` (карта во всю плитку)", () => {
  it("вся плитка — один вход в модалку: карта, полоса данных и НИ одной второй кнопки", async () => {
    getRidesMock.mockResolvedValue([
      base({ id: 10, distanceMeters: 6900, durationSeconds: 2640 }),
      base({ id: 11, rideDate: "2026-07-10" }),
    ]);
    render(<RideTile edition="map" />);

    const card = await screen.findByRole("button", { name: "Открыть карту поездок" });
    expect(card).toHaveClass("ride-frame");
    expect(screen.getByTestId("ride-map")).toBeInTheDocument();
    // This edition has no "previous" button at all — a press anywhere IS the way into the modal.
    expect(screen.queryByRole("button", { name: "Предыдущие поездки" })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);

    fireEvent.click(card);
    expect(screen.getByTestId("rides-modal")).toBeInTheDocument();
  });

  it("на полосе — километраж голосом заголовка, всё прочее одной строкой при нём", async () => {
    getRidesMock.mockResolvedValue([base({ id: 10, distanceMeters: 6900, durationSeconds: 2640 })]);
    render(<RideTile edition="map" />);

    // The kilometres are their own node and act as the strip's heading; "when" and the duration
    // live on ONE line beside them, in the same order as a drop frame's caption.
    expect(await screen.findByText("6.9 км")).toHaveClass("ride-frame__km");
    const meta = screen.getByText(/44 мин/);
    expect(meta).toHaveClass("ride-frame__meta");
    expect(meta.textContent).not.toContain("последняя");
  });

  it("редакция едет в модалку — плитка и её окно не расходятся вёрсткой", async () => {
    getRidesMock.mockResolvedValue([base({ id: 10 })]);
    render(<RideTile edition="map" />);

    fireEvent.click(await screen.findByRole("button", { name: "Открыть карту поездок" }));
    expect(screen.getByTestId("rides-modal")).toHaveAttribute("data-edition", "map");
  });

  it("незнакомая редакция трактуется как `card` (реестр раскладки о наборе редакций не знает)", async () => {
    getRidesMock.mockResolvedValue([base({ id: 10 }), base({ id: 11, rideDate: "2026-07-10" })]);
    render(<RideTile edition="кто-то-опечатался" />);

    expect(await screen.findByRole("button", { name: "Предыдущие поездки" })).toBeInTheDocument();
    expect(screen.queryByText("последняя")).toBeNull();
  });
});

/**
 * The map tile appears TOGETHER with its map, on a reload and on a wave change alike: a data strip
 * on progressive blur hanging over an empty space reads as a failure, not as loading.
 */
describe("RideTile — редакция `map` ждёт карту", () => {
  it("смена волны снова гасит плитку: описание не выходит на экран раньше города", async () => {
    getRidesMock.mockResolvedValue([base({ id: 10 })]);
    const { container, rerender } = render(<RideTile edition="map" wave="wave-03" />);

    await screen.findByRole("button", { name: "Открыть карту поездок" });
    const tile = () => container.querySelector(".ride-card--map")!;
    await waitFor(() => expect(tile()).toHaveClass("is-ready"));

    rerender(<RideTile edition="map" wave="wave-02" />);
    // The new wave's map has not assembled yet — the previous one's readiness is not inherited.
    expect(tile()).not.toHaveClass("is-ready");
    await waitFor(() => expect(tile()).toHaveClass("is-ready"));
  });
});
