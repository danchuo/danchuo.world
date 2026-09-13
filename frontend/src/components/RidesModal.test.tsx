import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RideMonthSummaryView, RideView } from "@/lib/api/types";

// Сводку месяца модалка тянет с бэка (`getRideMonthSummary`) — мокаем клиент. По умолчанию
// «пусто» (rides 0 ⇒ строки нет); отдельные тесты переопределяют resolved-значение.
const getRideMonthSummary = vi.fn<() => Promise<RideMonthSummaryView>>(() =>
  Promise.resolve({ month: "2026-07", rides: 0, durationSeconds: 0, spentKopecks: 0 }),
);
vi.mock("@/lib/api/client", () => ({
  getRideMonthSummary: () => getRideMonthSummary(),
}));

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

  it("час за 399 ₽ плюс превышение — строка показывает всю цену, а не одни 7 ₽", () => {
    const hour: RideView[] = [
      base({ id: 22, durationSeconds: 3720, costKopecks: 749, accessKopecks: 39900, totalKopecks: 40649 }),
    ];
    render(<RidesModal rides={hour} today="2026-07-13" onClose={() => {}} />);
    expect(screen.getAllByText(/406 ₽ \(доступ 399 \+ 7 сверх\)/).length).toBeGreaterThan(0);
  });

  it("адрес-заглушка «Москва» (вне станции) показывается как «вне станции»", () => {
    const outside: RideView[] = [
      base({ id: 30, startAddress: "Москва", finishAddress: "ст. м. Молодёжная (выход № 2)" }),
    ];
    render(<RidesModal rides={outside} today="2026-07-13" onClose={() => {}} />);

    // Стрелка между станциями — свой узел (она тише имён), поэтому сверяем строку целиком.
    expect(
      screen.getByText(
        (_, el) => el?.textContent === "вне станции → ст. м. Молодёжная (выход № 2)" && el.tagName === "DIV",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("ride-map")).toHaveAttribute("data-start-label", "вне станции");
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

describe("RidesModal — сводка за текущий месяц", () => {
  it("рисует строку под картой: поездки, минуты, рубли (с корректным склонением)", async () => {
    getRideMonthSummary.mockResolvedValueOnce({
      month: "2026-07",
      rides: 4, // 4 → «поездки»
      durationSeconds: 3660, // 61 мин → «минута» (61 % 10 === 1)
      spentKopecks: 39900, // 399 ₽ → «рублей» (399 % 10 === 9)
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

  it("нет поездок в этом месяце (rides 0) — строка не рисуется", async () => {
    getRideMonthSummary.mockResolvedValueOnce({
      month: "2026-07",
      rides: 0,
      durationSeconds: 0,
      spentKopecks: 0,
    });
    render(<RidesModal rides={rides} today="2026-07-13" onClose={() => {}} />);

    // Дать промису сводки разрешиться, затем убедиться, что строки-сводки нет.
    await Promise.resolve();
    expect(screen.queryByLabelText("Сводка за текущий месяц")).toBeNull();
  });
});

describe("RidesModal — редакция `map` (разворот)", () => {
  const rides = [
    base({ id: 1, rideDate: "2026-07-12", startLat: 55.7 }),
    base({ id: 2, rideDate: "2026-07-11", startLat: 55.8 }),
  ];

  it("карта и список стоят рядом в развороте, сводка — строкой под ними", async () => {
    getRideMonthSummary.mockResolvedValueOnce({
      month: "2026-07",
      rides: 4,
      durationSeconds: 3660,
      spentKopecks: 39900,
    });
    const { container } = render(
      <RidesModal rides={rides} today="2026-07-13" edition="map" onClose={() => {}} />,
    );

    const body = container.querySelector(".ride-modal__body");
    expect(body).not.toBeNull();
    // Обе половины разворота лежат В НЁМ — иначе карта осталась бы полосой над списком.
    expect(body!.querySelector('[data-testid="ride-map"]')).not.toBeNull();
    expect(body!.querySelector(".ride-modal__list")).not.toBeNull();

    // Сводка — сестра разворота, а не его часть: строка идёт во всю ширину окна.
    const strip = await screen.findByLabelText("Сводка за текущий месяц");
    expect(body!.contains(strip)).toBe(false);
    expect(strip.previousElementSibling).toBe(body);
  });

  it("карта — «герой» и «лицо» проявки: из плитки борда растёт именно она", () => {
    const { container } = render(
      <RidesModal rides={rides} today="2026-07-13" edition="map" onClose={() => {}} />,
    );

    const hero = container.querySelector("[data-morph-hero]");
    expect(hero).not.toBeNull();
    expect(hero!.querySelector('[data-testid="ride-map"]')).not.toBeNull();
    // Лицо — то, что режется клипом на время полёта; у карты им работает её же контейнер.
    expect(hero!.hasAttribute("data-morph-face")).toBe(true);
  });

  it("без редакции — прежняя колонка: карта сверху, разворота нет", () => {
    const { container } = render(<RidesModal rides={rides} today="2026-07-13" onClose={() => {}} />);

    expect(container.querySelector(".ride-modal__body")).toBeNull();
    expect(screen.getByTestId("ride-map")).toBeInTheDocument();
  });
});

/**
 * Разворот разводит два ответа: «сколько» — шапкой над картой, «когда и откуда куда» — строками
 * списка. Пока цифры стояли и там, и там, список читался таблицей одинаково громких строк.
 * В колоночной раскладке (волны 01/02) шапки с данными нет, и цифры остаются в строке.
 */
describe("RidesModal — данные выбранной поездки в шапке разворота", () => {
  const withCost = [
    base({ id: 1, rideDate: "2026-07-12", distanceMeters: 6900, durationSeconds: 2640, calories: 168 }),
    base({ id: 2, rideDate: "2026-07-11", distanceMeters: 4200, durationSeconds: 1260, calories: 96 }),
  ];

  it("в шапке — километры, время, калории и деньги выбранной поездки, а не слово «поездки»", () => {
    const { container } = render(
      <RidesModal rides={withCost} today="2026-07-13" edition="map" onClose={() => {}} />,
    );

    const head = container.querySelector(".ride-modal__head")!;
    expect(within(head as HTMLElement).getByText("6.9 км")).toBeInTheDocument();
    expect(within(head as HTMLElement).getByText(/44 мин · 168 ккал · 52 ₽/)).toBeInTheDocument();
    expect(screen.queryByText("поездки")).toBeNull();
  });

  it("выбрали другую поездку — шапка пересчиталась", () => {
    const { container } = render(
      <RidesModal rides={withCost} today="2026-07-13" edition="map" onClose={() => {}} />,
    );

    fireEvent.click(within(screen.getAllByRole("option")[1]).getByRole("button"));
    const head = container.querySelector(".ride-modal__head")!;
    expect(within(head as HTMLElement).getByText("4.2 км")).toBeInTheDocument();
  });

  it("в строке разворота — день, километры при нём, дата и станции; прочих цифр нет", () => {
    render(
      <RidesModal
        rides={[
          base({
            id: 1,
            rideDate: "2026-07-12",
            distanceMeters: 6900,
            startAddress: "ул. Свежая, 1",
            finishAddress: "пл. Финиш, 2",
          }),
        ]}
        today="2026-07-13"
        edition="map"
        onClose={() => {}}
      />,
    );

    const row = screen.getByRole("option");
    expect(within(row).getByText("2026-07-12")).toBeInTheDocument();
    expect(within(row).getByText(/ул. Свежая, 1/)).toBeInTheDocument();
    // Километры стоят при имени дня: до выбора строки видно, сколько за ней проехано.
    expect(within(row).getByText("6.9 км")).toBeInTheDocument();
    // Остальные цифры по-прежнему живут только в шапке у карты — иначе список рябит.
    expect(within(row).queryByText(/ккал/)).toBeNull();
    expect(within(row).queryByText(/мин/)).toBeNull();
  });

  it("в колоночной раскладке цифры остаются в строке, а шапка — слово «поездки»", () => {
    render(<RidesModal rides={withCost} today="2026-07-13" onClose={() => {}} />);

    expect(screen.getByText("поездки")).toBeInTheDocument();
    expect(within(screen.getAllByRole("option")[0]).getByText(/168 ккал/)).toBeInTheDocument();
  });
});
