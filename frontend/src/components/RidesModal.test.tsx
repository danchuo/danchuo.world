import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RideView } from "@/lib/api/types";

// RideMap тянет Leaflet динамически (client-only, не работает в jsdom) — мок-заглушка отдаёт
// координаты выбранной поездки в data-атрибутах, чтобы проверять, ЧТО уходит на карту.
vi.mock("./RideMap", () => ({
  RideMap: (props: {
    startLat: number;
    finishLat: number;
    interactivePins?: boolean;
    startLabel?: string | null;
    finishLabel?: string | null;
  }) => (
    <div
      data-testid="ride-map"
      data-start={String(props.startLat)}
      data-finish={String(props.finishLat)}
      data-interactive={String(!!props.interactivePins)}
      data-start-label={props.startLabel ?? ""}
      data-finish-label={props.finishLabel ?? ""}
    />
  ),
}));

import { RidesModal } from "./RidesModal";

const base = (over: Partial<RideView>): RideView => ({
  id: 1,
  rideDate: "2026-07-11",
  startTime: "",
  finishTime: "",
  distanceMeters: 6900,
  durationSeconds: 2640,
  calories: 168,
  costKopecks: 5243,
  coveredByTariffKopecks: null,
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

// Список новыми сверху (как отдаёт API): [0] — самая свежая.
const rides: RideView[] = [
  base({ id: 10, rideDate: "2026-07-11", startLat: 55.71, startAddress: "ул. Свежая, 1", finishAddress: "пл. Финиш, 2" }),
  base({ id: 11, rideDate: "2026-07-10", startLat: 55.82 }),
  base({ id: 12, rideDate: "2026-07-07", startLat: null, startLon: null, finishLat: null, finishLon: null }),
];

afterEach(() => vi.clearAllMocks());

describe("RidesModal — карта выбранной поездки", () => {
  it("по умолчанию выбрана самая свежая (первая), карта рисует её путь", () => {
    render(<RidesModal rides={rides} today="2026-07-13" onClose={() => {}} />);

    const selected = screen.getByRole("option", { selected: true });
    expect(within(selected).getByText("2026-07-11")).toBeInTheDocument();
    // Карта получила координаты именно свежей поездки (id 10, startLat 55.71).
    const map = screen.getByTestId("ride-map");
    expect(map).toHaveAttribute("data-start", "55.71");
    // Пины на большой карте интерактивны, адреса уходят подписями (тултип на наведение).
    expect(map).toHaveAttribute("data-interactive", "true");
    expect(map).toHaveAttribute("data-start-label", "ул. Свежая, 1");
    expect(map).toHaveAttribute("data-finish-label", "пл. Финиш, 2");
  });

  it("клик по другой поездке переносит выделение и перерисовывает карту", () => {
    render(<RidesModal rides={rides} today="2026-07-13" onClose={() => {}} />);

    const rows = screen.getAllByRole("option");
    fireEvent.click(within(rows[1]).getByRole("button")); // 2026-07-10, startLat 55.82

    expect(rows[1]).toHaveAttribute("aria-selected", "true");
    expect(rows[0]).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("ride-map")).toHaveAttribute("data-start", "55.82");
  });

  it("у поездки без координат — заглушка вместо карты", () => {
    render(<RidesModal rides={rides} today="2026-07-13" onClose={() => {}} />);

    fireEvent.click(within(screen.getAllByRole("option")[2]).getByRole("button")); // 2026-07-07, без гео

    expect(screen.queryByTestId("ride-map")).toBeNull();
    expect(screen.getByText("нет данных о маршруте")).toBeInTheDocument();
  });

  it("в строке поездки показана стоимость (справа от ккал)", () => {
    render(<RidesModal rides={rides} today="2026-07-13" onClose={() => {}} />);
    // 5243 копейки → «52 ₽»; строка метрик содержит и ккал, и стоимость.
    expect(screen.getAllByText(/168 ккал · 52 ₽/).length).toBeGreaterThan(0);
  });

  it("бесплатная поездка под тарифом — «в рамках тарифа за N ₽» вместо «бесплатно»", () => {
    const covered: RideView[] = [
      base({ id: 20, costKopecks: 0, coveredByTariffKopecks: 90000 }), // 900 ₽ покрывающий тариф
      base({ id: 21, costKopecks: 0, coveredByTariffKopecks: null }), // покупки не нашлось → бесплатно
    ];
    render(<RidesModal rides={covered} today="2026-07-13" onClose={() => {}} />);
    expect(screen.getAllByText(/в рамках тарифа за 900 ₽/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/· бесплатно/).length).toBeGreaterThan(0);
  });

  it("Esc и кнопка закрытия зовут onClose", () => {
    const onClose = vi.fn();
    render(<RidesModal rides={rides} today="2026-07-13" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
