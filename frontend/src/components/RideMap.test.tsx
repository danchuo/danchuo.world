import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RideMap } from "./RideMap";

/**
 * Кадрирование мини-карты (DESIGN §8.1). Zoom-level Leaflet — это «сколько метров в пикселе»:
 * подобранный под один размер контейнера, при росте он оставляет тот же масштаб и просто
 * показывает больше пустоты вокруг — точки съезжаются к центру, карта «отдаляется». Раньше
 * `fitBounds` звался только при маунте, поэтому уменьшение масштаба браузера и большой монитор
 * давали ровно этот эффект. Тест держит контракт «перефитить на каждое изменение размера».
 */
const fitBounds = vi.fn();
const invalidateSize = vi.fn();

vi.mock("leaflet", () => {
  // Компонент берёт функции прямо с неймспейса (`L.map(...)` после `import("leaflet")`),
  // поэтому мок отдаёт ИМЕНОВАННЫЕ экспорты; default продублирован на случай интеропа.
  const chain = () => ({ addTo: () => ({ bindTooltip: () => {} }) });
  const api = {
    map: () => ({ fitBounds, invalidateSize, remove: () => {} }),
    tileLayer: chain,
    polyline: chain,
    marker: chain,
    circleMarker: chain,
    icon: (o: unknown) => o,
    point: (x: number, y: number) => ({ x, y }),
    latLngBounds: () => ({ pad: () => ({}) }),
  };
  return { ...api, default: api };
});

/** Захватываем колбэк наблюдателя, чтобы дёрнуть «контейнер изменился» вручную. */
let fireResize: (() => void) | null = null;

beforeEach(() => {
  fitBounds.mockClear();
  invalidateSize.mockClear();
  fireResize = null;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: () => void) {
        fireResize = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => vi.unstubAllGlobals());

const coords = { startLat: 55.75, startLon: 37.61, finishLat: 55.76, finishLon: 37.63 };

describe("RideMap — кадрирование", () => {
  it("подгоняет кадр при маунте", async () => {
    render(<RideMap {...coords} />);
    await vi.waitFor(() => expect(fitBounds).toHaveBeenCalledTimes(1));
  });

  it("перефичивает кадр, когда контейнер изменил размер", async () => {
    render(<RideMap {...coords} />);
    await vi.waitFor(() => expect(fitBounds).toHaveBeenCalledTimes(1));

    fireResize?.();
    expect(fitBounds).toHaveBeenCalledTimes(2);
    // invalidateSize обязателен ПЕРЕД фитом: иначе Leaflet считает по устаревшим размерам
    // контейнера и подгоняет кадр под старую геометрию.
    expect(invalidateSize).toHaveBeenCalled();
    expect(invalidateSize.mock.invocationCallOrder[0]).toBeLessThan(
      fitBounds.mock.invocationCallOrder[1],
    );
  });
});
