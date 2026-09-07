import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RideView } from "@/lib/api/types";

vi.mock("@/lib/api/client", () => ({ getRides: vi.fn() }));
// Leaflet-карта и модалка — заглушки (карта client-only; модалку проверяем отдельно).
vi.mock("./RideMap", () => ({ RideMap: () => <div data-testid="ride-map" /> }));
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
    // Leaflet рисует в контейнер `height: 100%`, а тот считает проценты от бокса-кнопки. В бенто
    // высота кнопки приходит от тайла, в мобильном стеке её нет вовсе ⇒ карта инициализируется в
    // нулевую высоту и не видна. Пиксели проверяет `app/styles/stackHeights.test.ts`.
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
    // «предыдущие» в этой редакции нет вовсе — нажатие в любую точку и есть вход в модалку.
    expect(screen.queryByRole("button", { name: "Предыдущие поездки" })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);

    fireEvent.click(card);
    expect(screen.getByTestId("rides-modal")).toBeInTheDocument();
  });

  it("на полосе — километраж голосом заголовка, всё прочее одной строкой при нём", async () => {
    getRidesMock.mockResolvedValue([base({ id: 10, distanceMeters: 6900, durationSeconds: 2640 })]);
    render(<RideTile edition="map" />);

    // Километры отдельным узлом — они и есть заголовок полосы; пометка, «когда» и длительность
    // живут ОДНОЙ строкой при них (тот же строй, что у подписи кадра в плитке дропа).
    expect(await screen.findByText("6.9 км")).toHaveClass("ride-frame__km");
    const meta = screen.getByText(/последняя/);
    expect(meta).toHaveClass("ride-frame__meta");
    expect(meta.textContent).toContain("44 мин");
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
