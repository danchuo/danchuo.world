import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RideMonthSummaryView, RideView } from "@/lib/api/types";

// The month summary comes from the backend, so the client is mocked. The default is empty
// (rides 0 ⇒ no row); individual tests override the resolved value.
const getRideMonthSummary = vi.fn<() => Promise<RideMonthSummaryView>>(() =>
  Promise.resolve({ month: "2026-07", rides: 0, durationSeconds: 0, spentKopecks: 0 }),
);
vi.mock("@/lib/api/client", () => ({
  getRideMonthSummary: () => getRideMonthSummary(),
}));

// RideMap pulls Leaflet dynamically (client-only, dead in jsdom). The stub exposes the selected
// ride's coordinates in data attributes so we can check WHAT reaches the map.
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

// Newest first, as the API serves them: [0] is the freshest.
const rides: RideView[] = [
  base({ id: 10, rideDate: "2026-07-11", startLat: 55.71, startAddress: "ул. Свежая, 1", finishAddress: "пл. Финиш, 2" }),
  base({ id: 11, rideDate: "2026-07-10", startLat: 55.82 }),
  base({ id: 12, rideDate: "2026-07-07", startLat: null, startLon: null, finishLat: null, finishLon: null }),
];

afterEach(() => vi.clearAllMocks());

describe("RidesModal — map of the selected ride", () => {
  it("by default the freshest (first) is selected and the map draws its path", () => {
    render(<RidesModal rides={rides} today="2026-07-13" onClose={() => {}} />);

    const selected = screen.getByRole("option", { selected: true });
    expect(within(selected).getByText("2026-07-11")).toBeInTheDocument();
    // The map got the freshest ride's coordinates (id 10, startLat 55.71).
    const map = screen.getByTestId("ride-map");
    expect(map).toHaveAttribute("data-start", "55.71");
    // Pins on the large map are interactive, with addresses as hover labels.
    expect(map).toHaveAttribute("data-interactive", "true");
    expect(map).toHaveAttribute("data-start-label", "ул. Свежая, 1");
    expect(map).toHaveAttribute("data-finish-label", "пл. Финиш, 2");
  });

  it("a click on another ride moves the selection and redraws the map", () => {
    render(<RidesModal rides={rides} today="2026-07-13" onClose={() => {}} />);

    const rows = screen.getAllByRole("option");
    fireEvent.click(within(rows[1]).getByRole("button")); // 2026-07-10, startLat 55.82

    expect(rows[1]).toHaveAttribute("aria-selected", "true");
    expect(rows[0]).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("ride-map")).toHaveAttribute("data-start", "55.82");
  });

  it("a ride without coordinates — a placeholder instead of the map", () => {
    render(<RidesModal rides={rides} today="2026-07-13" onClose={() => {}} />);

    fireEvent.click(within(screen.getAllByRole("option")[2]).getByRole("button")); // 2026-07-07, no geo

    expect(screen.queryByTestId("ride-map")).toBeNull();
    expect(screen.getByText("нет данных о маршруте")).toBeInTheDocument();
  });

  it("the ride row shows the cost (to the right of kcal)", () => {
    render(<RidesModal rides={rides} today="2026-07-13" onClose={() => {}} />);
    // 5243 kopecks → "52 ₽"; the metrics line carries both calories and cost.
    expect(screen.getAllByText(/168 ккал · 52 ₽/).length).toBeGreaterThan(0);
  });

  it("a free ride under a tariff — \"within the N ₽ tariff\" instead of \"free\"", () => {
    const covered: RideView[] = [
      base({ id: 20, costKopecks: 0, coveredByTariffKopecks: 90000 }), // a 900 ₽ covering tariff
      base({ id: 21, costKopecks: 0, coveredByTariffKopecks: null }), // no purchase found → free
    ];
    render(<RidesModal rides={covered} today="2026-07-13" onClose={() => {}} />);
    expect(screen.getAllByText(/в рамках тарифа за 900 ₽/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/· бесплатно/).length).toBeGreaterThan(0);
  });

  it("an hour for 399 ₽ plus overage — the row shows the full price, not just 7 ₽", () => {
    const hour: RideView[] = [
      base({ id: 22, durationSeconds: 3720, costKopecks: 749, accessKopecks: 39900, totalKopecks: 40649 }),
    ];
    render(<RidesModal rides={hour} today="2026-07-13" onClose={() => {}} />);
    expect(screen.getAllByText(/406 ₽ \(доступ 399 \+ 7 сверх\)/).length).toBeGreaterThan(0);
  });

  it("the placeholder address \"Moscow\" (off-station) shows as \"off-station\"", () => {
    const outside: RideView[] = [
      base({ id: 30, startAddress: "Москва", finishAddress: "ст. м. Молодёжная (выход № 2)" }),
    ];
    render(<RidesModal rides={outside} today="2026-07-13" onClose={() => {}} />);

    // The arrow between stations is its own node (quieter than the names), so the whole string is
    // compared at once.
    expect(
      screen.getByText(
        (_, el) => el?.textContent === "вне станции → ст. м. Молодёжная (выход № 2)" && el.tagName === "DIV",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("ride-map")).toHaveAttribute("data-start-label", "вне станции");
  });

  it("Esc and the close button call onClose", () => {
    const onClose = vi.fn();
    render(<RidesModal rides={rides} today="2026-07-13" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("RidesModal — current month summary", () => {
  it("draws a line under the map: rides, minutes, roubles (with correct declension)", async () => {
    getRideMonthSummary.mockResolvedValueOnce({
      month: "2026-07",
      rides: 4, // 4 takes the plural form
      durationSeconds: 3660, // 61 min → singular form (61 % 10 === 1)
      spentKopecks: 39900, // 399 ₽ → genitive plural (399 % 10 === 9)
    });
    render(<RidesModal rides={rides} today="2026-07-13" onClose={() => {}} />);

    const strip = await screen.findByLabelText("Сводка за текущий месяц");
    expect(within(strip).getByText("в этом месяце")).toBeInTheDocument();
    expect(within(strip).getByText("4")).toBeInTheDocument();
    expect(within(strip).getByText("поездки")).toBeInTheDocument();
    expect(within(strip).getByText("61")).toBeInTheDocument();
    expect(within(strip).getByText("минута")).toBeInTheDocument();
    expect(within(strip).getByText("399")).toBeInTheDocument();
    expect(within(strip).getByText("рублей")).toBeInTheDocument();
  });

  it("no rides this month (rides 0) — the line is not drawn", async () => {
    getRideMonthSummary.mockResolvedValueOnce({
      month: "2026-07",
      rides: 0,
      durationSeconds: 0,
      spentKopecks: 0,
    });
    render(<RidesModal rides={rides} today="2026-07-13" onClose={() => {}} />);

    // Let the summary promise settle, then confirm there is no summary row.
    await Promise.resolve();
    expect(screen.queryByLabelText("Сводка за текущий месяц")).toBeNull();
  });
});

describe("RidesModal — the develop transition from the tile", () => {
  const rides = [
    base({ id: 1, rideDate: "2026-07-12", startLat: 55.7 }),
    base({ id: 2, rideDate: "2026-07-11", startLat: 55.8 }),
  ];

  it("the map is the \"hero\" and the \"face\" of the development: it is what grows out of the board tile", () => {
    const { container } = render(
      <RidesModal rides={rides} today="2026-07-13" onClose={() => {}} />,
    );

    const hero = container.querySelector("[data-morph-hero]");
    expect(hero).not.toBeNull();
    expect(hero!.querySelector('[data-testid="ride-map"]')).not.toBeNull();
    // The face is what the clip cuts during the flight; for the map its own container serves.
    expect(hero!.hasAttribute("data-morph-face")).toBe(true);
  });

  it("a snapshot of the tile's map flies as the hero until the live map is ready, and leaves when another ride is picked", () => {
    const { container } = render(
      <RidesModal rides={rides} today="2026-07-13" preview="data:image/png;base64,AAAA" onClose={() => {}} />,
    );

    const hero = container.querySelector("[data-morph-hero]")!;
    const shots = hero.querySelectorAll("img.ride-modal__preview");
    expect(shots.length).toBeGreaterThan(0);
    shots.forEach((img) => expect(img.getAttribute("src")).toBe("data:image/png;base64,AAAA"));

    fireEvent.click(within(screen.getByRole("listbox")).getAllByRole("button")[1]);
    expect(hero.querySelector("img.ride-modal__preview")).toBeNull();
  });
});

describe("RidesModal — list rows", () => {
  const withCost = [
    base({ id: 1, rideDate: "2026-07-12", distanceMeters: 6900, durationSeconds: 2640, calories: 168 }),
    base({ id: 2, rideDate: "2026-07-11", distanceMeters: 4200, durationSeconds: 1260, calories: 96 }),
  ];

  it("the figures stay in the row and the header is the word \"rides\"", () => {
    render(<RidesModal rides={withCost} today="2026-07-13" onClose={() => {}} />);

    expect(screen.getByText("поездки")).toBeInTheDocument();
    expect(within(screen.getAllByRole("option")[0]).getByText(/168 ккал/)).toBeInTheDocument();
  });
});
