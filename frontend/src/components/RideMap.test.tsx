import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RideMap } from "./RideMap";

/**
 * Кадрирование мини-карты (DESIGN §8.1). Зум — это «сколько метров в пикселе»: подобранный под
 * один размер контейнера, при росте он оставляет тот же масштаб и просто показывает больше
 * пустоты вокруг — точки съезжаются к центру, карта «отдаляется». Раньше `fitBounds` звался
 * только при маунте, поэтому уменьшение масштаба браузера и большой монитор давали ровно этот
 * эффект. Тест держит контракт «перефитить на каждое изменение размера».
 */
const fitBounds = vi.fn();
const resize = vi.fn();
/** Опции, с которыми собрали карту, — на них держится и выбор подложки, и режим жестов. */
const mapOptions = vi.fn();
const addControl = vi.fn();
/** Адрес воркера — без него карта не разбирает тайлы вовсе, поэтому он тоже под тестом. */
const setWorkerUrl = vi.fn();

vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

vi.mock("maplibre-gl", () => {
  class Map {
    constructor(options: unknown) {
      mapOptions(options);
    }
    fitBounds = fitBounds;
    resize = resize;
    addControl = addControl;
    addSource = () => {};
    addLayer = () => {};
    setLayoutProperty = () => {};
    getSource = () => undefined;
    remove = () => {};
    // Стиль в тестах не грузится, поэтому `load` не наступает никогда: слои и `onReady` живут
    // в его обработчике, и всё, что тест проверяет, происходит ДО него.
    once = () => {};
    touchZoomRotate = { disableRotation: () => {} };
  }
  class LngLatBounds {
    extend = () => this;
  }
  class Marker {
    setLngLat = () => this;
    addTo = () => this;
  }
  class Popup {
    setText = () => this;
    setLngLat = () => this;
    addTo = () => this;
    remove = () => this;
  }
  class NavigationControl {}
  const api = { Map, LngLatBounds, Marker, Popup, NavigationControl, setWorkerUrl };
  return { ...api, default: api };
});

/** Захватываем колбэк наблюдателя, чтобы дёрнуть «контейнер изменился» вручную. */
let fireResize: (() => void) | null = null;

beforeEach(() => {
  fitBounds.mockClear();
  resize.mockClear();
  mapOptions.mockClear();
  addControl.mockClear();
  setWorkerUrl.mockClear();
  fireResize = null;
  // jsdom меряет всё нулём, а карта не кадрируется в нулевой бокс — подкладываем размер.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 400,
    height: 300,
    top: 0,
    left: 0,
    right: 400,
    bottom: 300,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const coords = { startLat: 55.75, startLon: 37.61, finishLat: 55.76, finishLon: 37.63 };

describe("RideMap — кадрирование", () => {
  it("подгоняет кадр при маунте", async () => {
    render(<RideMap {...coords} />);
    await vi.waitFor(() => expect(fitBounds).toHaveBeenCalledTimes(1));
  });

  it("подгоняет кадр заново при изменении размера контейнера", async () => {
    render(<RideMap {...coords} />);
    await vi.waitFor(() => expect(fitBounds).toHaveBeenCalledTimes(1));
    fireResize?.();
    expect(fitBounds).toHaveBeenCalledTimes(2);
    // Пересчёт размеров ОБЯЗАН идти перед подгонкой: иначе карта считает по устаревшему боксу.
    expect(resize).toHaveBeenCalled();
  });
});

/**
 * Карта в плитке и карта в окне — один компонент, но разные предметы: там виджет и целиком
 * кнопка, здесь карта, которую водят и приближают (просьба владельца). Разводит их единственный
 * проп `interactivePins` — тест держит весь набор следствий.
 */
describe("RideMap — жесты", () => {
  it("в плитке карта статична: жест уходит на кнопку, а не двигает подложку", async () => {
    render(<RideMap {...coords} />);
    await vi.waitFor(() => expect(mapOptions).toHaveBeenCalled());
    const o = mapOptions.mock.calls[0][0] as Record<string, unknown>;
    expect(o.interactive).toBe(false);
    // Атрибуция в углу крошечного виджета была бы мусором; в окне она обязательна.
    expect(o.attributionControl).toBe(false);
    expect(addControl).not.toHaveBeenCalled();
  });

  it("в окне карту водят, приближают и подписывают поставщика", async () => {
    render(<RideMap {...coords} interactivePins />);
    await vi.waitFor(() => expect(mapOptions).toHaveBeenCalled());
    const o = mapOptions.mock.calls[0][0] as Record<string, unknown>;
    expect(o.interactive).toBe(true);
    expect(o.attributionControl).not.toBe(false);
    // Зумер — рядом с жестом: колесо есть не у всех, а кнопки есть всегда.
    expect(addControl).toHaveBeenCalled();
  });

  it("карта не кренится и не крутится ни в плитке, ни в окне", async () => {
    render(<RideMap {...coords} interactivePins />);
    await vi.waitFor(() => expect(mapOptions).toHaveBeenCalled());
    const o = mapOptions.mock.calls[0][0] as Record<string, unknown>;
    expect(o.dragRotate).toBe(false);
    expect(o.pitchWithRotate).toBe(false);
  });
});

/**
 * Подложка — свойство ВОЛНЫ (DESIGN §7.6). Волна 03 берёт тёмный стиль: серую растровую канву
 * приходилось досаживать фильтром, и карта выходила не тёмной, а затемнённой.
 */
describe("RideMap — подложка волны", () => {
  it("волна без своей подложки берёт светлый дефолт", async () => {
    render(<RideMap {...coords} />);
    await vi.waitFor(() => expect(mapOptions).toHaveBeenCalled());
    expect((mapOptions.mock.calls[0][0] as { style: string }).style).toContain("colorful");
  });

  it("волна 03 берёт тёмный стиль", async () => {
    render(<RideMap {...coords} wave="wave-03" />);
    await vi.waitFor(() => expect(mapOptions).toHaveBeenCalled());
    expect((mapOptions.mock.calls[0][0] as { style: string }).style).toContain("eclipse");
  });
});

/**
 * Воркер MapLibre — условие работы карты, а не деталь: без него карта рисует фон стиля и
 * останавливается, молча и без ошибок в консоли (docs/pitfalls.md). Адрес должен указывать
 * в статику сайта, куда его кладёт `scripts/copy-maplibre-worker.mjs`.
 */
describe("RideMap — воркер", () => {
  it("карта получает адрес воркера из статики сайта", async () => {
    render(<RideMap {...coords} />);
    await vi.waitFor(() => expect(setWorkerUrl).toHaveBeenCalled());
    expect(setWorkerUrl.mock.calls[0][0]).toBe("/maplibre/maplibre-gl-worker.mjs");
  });
});
