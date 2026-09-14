import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LatestDropTile } from "./LatestDropTile";
import { writeCache } from "@/lib/api/cache";
import { buildMosaic } from "@/lib/mosaic";
import type { FilmPhotoView } from "@/lib/api/types";

vi.mock("@/lib/api/client", () => ({ getDrops: vi.fn(), getDrop: vi.fn() }));
import { getDrop, getDrops } from "@/lib/api/client";
import { FRAME_STEP_COOLDOWN_MS, FRAME_WHEEL_TRAVEL_PX } from "@/lib/dropRoll";
const getDropsMock = vi.mocked(getDrops);
const getDropMock = vi.mocked(getDrop);

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

const landscape = (seq: number): FilmPhotoView => ({
  imageUrl: `/api/film-media/1/${seq}/web`,
  thumbUrl: `/api/film-media/1/${seq}/thumb`,
  width: 120,
  height: 80,
});

describe("buildMosaic (justified-раскладка кадров)", () => {
  it("пять кадров никогда не пакуются в один ряд, даже в широком низком виджете", () => {
    const photos = [0, 1, 2, 3, 4].map(landscape);
    // Широкий и низкий контейнер: без капа единственный ряд из 5 выигрывал по score.
    const mosaic = buildMosaic(photos, 1000, 120);
    expect(mosaic).not.toBeNull();
    for (const row of mosaic!) expect(row.length).toBeLessThanOrEqual(4);
    // Перераскладка, не выбрасывание: все 5 кадров остаются на месте.
    expect(mosaic!.flat()).toHaveLength(5);
  });

  it("четыре кадра в один ряд — по-прежнему можно", () => {
    const photos = [0, 1, 2, 3].map(landscape);
    const mosaic = buildMosaic(photos, 1000, 120);
    expect(mosaic).not.toBeNull();
    expect(mosaic!).toHaveLength(1);
    expect(mosaic![0]).toHaveLength(4);
  });
});

const portrait = (seq: number): FilmPhotoView => ({
  imageUrl: `/api/film-media/1/${seq}/web`,
  thumbUrl: `/api/film-media/1/${seq}/thumb`,
  width: 80,
  height: 120,
});

const DROP = {
  id: 2,
  title: "Июльская плёнка",
  droppedOn: "2026-07-02",
  monthLabel: "июль 2026",
  photoCount: 12,
  coverPhotoUrl: "/api/film-media/2/0/thumb",
};

/** Предзагрузка кадра в jsdom: картинки не грузятся, `load` симулируем. */
class ImageStub {
  onload: (() => void) | null = null;
  set src(v: string) {
    ImageStub.srcs.push(v);
    if (ImageStub.loads) queueMicrotask(() => this.onload?.());
  }
  static loads = true;
  /** Что вообще просили у сети: по этому списку видно предзагрузку соседей. */
  static srcs: string[] = [];
}

describe("LatestDropTile — редакции (волна выбирает через layout, DESIGN §7.5)", () => {
  beforeEach(() => {
    ImageStub.loads = true;
    ImageStub.srcs = [];
    vi.stubGlobal("Image", ImageStub);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("до ответа сети карточки нет — копия из кэша не мелькает «на секунду до свежего»", async () => {
    writeCache("latest-drop", { latest: { ...DROP, title: "Из кэша" }, photos: [landscape(0)] });
    getDropsMock.mockReturnValue(new Promise(() => {})); // сеть молчит
    const { container } = render(<LatestDropTile />);
    await new Promise((r) => setTimeout(r, 10));
    expect(container.querySelector(".pixel-tile")).toBeNull();
    expect(screen.queryByText("Из кэша")).toBeNull();
  });

  it("сеть ответила сбоем (рейтлимит) — появляется копия из кэша, один раз", async () => {
    writeCache("latest-drop", { latest: { ...DROP, title: "Из кэша" }, photos: [landscape(0)] });
    getDropsMock.mockRejectedValue(new Error("rate_limited"));
    const { container } = render(<LatestDropTile />);
    expect(await screen.findByText("Из кэша")).toBeInTheDocument();
    expect(container.querySelector(".pixel-tile")).not.toBeNull();
  });

  it("с копией в кэше кадры мозаики всё равно рисуются: замер идёт после появления карточки", async () => {
    // Вторая загрузка страницы: копия есть, фаза «loaded» ещё до ответа сети, карточка
    // появляется после него — и замер блока обязан пойти по самому узлу, а не по фазе.
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => "" } as DOMRect);
    writeCache("latest-drop", { latest: DROP, photos: [landscape(0), landscape(1), landscape(2)] });
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([landscape(0), landscape(1), landscape(2)]);
    const { container } = render(<LatestDropTile />);
    await screen.findByText("Июльская плёнка");
    await waitFor(() => expect(container.querySelectorAll(".drop-mosaic img").length).toBeGreaterThan(0));
    rect.mockRestore();
  });

  it("сеть ответила успехом — на экране свежие кадры, а не копия", async () => {
    writeCache("latest-drop", { latest: { ...DROP, title: "Из кэша" }, photos: [landscape(0)] });
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([landscape(1)]);
    render(<LatestDropTile />);
    expect(await screen.findByText("Июльская плёнка")).toBeInTheDocument();
    expect(screen.queryByText("Из кэша")).toBeNull();
  });

  it("edition=frame: пока снимок не пришёл, карточки нет вовсе — ни полоски стекла", async () => {
    ImageStub.loads = false;
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([landscape(0)]);

    const { container } = render(<LatestDropTile edition="frame" />);
    await screen.findByText("Июльская плёнка").catch(() => {});
    // Данные пришли, но кадр ещё грузится: стекла на экране быть не должно.
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector(".pixel-tile")).toBeNull();
  });


  it("edition=frame: один кадр во всю карточку, карточка берёт пропорцию кадра", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([landscape(0), landscape(1), landscape(2)]);

    const { container } = render(<LatestDropTile edition="frame" />);
    await screen.findByText("Июльская плёнка");

    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getByText(/12 кадров/)).toBeInTheDocument();
    // Подпись лежит ВНУТРИ полосы блюра: высота полосы = растушёвка + подпись, длинное
    // название углубляет полосу само.
    expect(container.querySelector(".drop-frame__band .drop-frame__caption")).not.toBeNull();
    // Размытые копии под подписью берут тот же кадр, что и сам снимок.
    const band = container.querySelector(".drop-frame__band") as HTMLElement;
    expect(band.style.getPropertyValue("--drop-frame-src")).toContain("/api/film-media/1/");
    expect(container.querySelectorAll(".drop-frame__blur")).toHaveLength(2);
    // Пропорция — у карточки (стекла), а не у картинки: лежачий кадр — лежачая карточка.
    const card = container.querySelector(".pixel-tile") as HTMLElement;
    expect(card.style.aspectRatio).toBe("120 / 80");
    expect(container.querySelector(".drop-mosaic")).toBeNull();
  });

  it("edition=frame: стоячий кадр — стоячая карточка", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([portrait(0)]);

    const { container } = render(<LatestDropTile edition="frame" />);
    await screen.findByText("Июльская плёнка");

    const card = container.querySelector(".pixel-tile") as HTMLElement;
    expect(card.style.aspectRatio).toBe("80 / 120");
  });

  /**
   * Свайп по карточке: жест пальцем в px. Порог — `SWIPE_NOTCH` (56px).
   *
   * Событие собираем руками из `MouseEvent`: `PointerEvent` в jsdom не реализован, и
   * `fireEvent.pointerMove` отдаёт голый `Event` — без `clientX`, то есть без самого жеста.
   */
  const pointer = (card: HTMLElement, type: string, clientX: number) => {
    const event = new MouseEvent(type, { bubbles: true, clientX });
    Object.defineProperty(event, "pointerType", { value: "touch" });
    fireEvent(card, event);
  };
  const swipe = (card: HTMLElement, dx: number) => {
    pointer(card, "pointerdown", 0);
    pointer(card, "pointermove", dx);
    pointer(card, "pointerup", dx);
  };
  /** Длинный жест: рука едет далеко и не одним скачком, а как настоящая — по дороге. */
  const longSwipe = (card: HTMLElement, dx: number) => {
    pointer(card, "pointerdown", 0);
    for (let i = 1; i <= 6; i += 1) pointer(card, "pointermove", (dx / 6) * i);
    pointer(card, "pointerup", dx);
  };

  const shownSeq = (container: HTMLElement) =>
    (container.querySelector(".drop-frame__img") as HTMLImageElement).src.match(/\/(\d+)\/web/)?.[1] ?? null;

  it("edition=frame: свайп по карточке листает кадры дропа, за краями плёнка стоит", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([landscape(0), landscape(1), landscape(2)]);

    const { container } = render(<LatestDropTile edition="frame" />);
    const card = await screen.findByLabelText(/Открыть дроп/);

    // Стартовый кадр — случайный (жребий по зерну), поэтому сперва уезжаем ВПРАВО до упора:
    // трёх жестов на три кадра хватает с запасом, а за первым кадром шага нет.
    swipe(card, 70);
    swipe(card, 70);
    swipe(card, 70);
    await waitFor(() => expect(shownSeq(container)).toBe("0"));

    // Влево — следующий кадр (лист бумаги уезжает за пальцем), и так до конца плёнки.
    swipe(card, -70);
    await waitFor(() => expect(shownSeq(container)).toBe("1"));
    swipe(card, -70);
    await waitFor(() => expect(shownSeq(container)).toBe("2"));

    // Последний кадр: дальше плёнка не идёт и НЕ закольцовывается на первый.
    swipe(card, -70);
    await new Promise((r) => setTimeout(r, 10));
    expect(shownSeq(container)).toBe("2");

    // Назад — предыдущий кадр.
    swipe(card, 70);
    await waitFor(() => expect(shownSeq(container)).toBe("1"));
  });

  it("edition=frame: один жест — ровно один кадр, каким бы длинным он ни был", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([0, 1, 2, 3, 4, 5].map(landscape));

    const { container } = render(<LatestDropTile edition="frame" />);
    const card = await screen.findByLabelText(/Открыть дроп/);

    // К началу плёнки — и оттуда один длинный жест влево: он обязан стоить ОДИН кадр, а не
    // домотать ленту до края.
    for (let i = 0; i < 6; i += 1) swipe(card, 70);
    await waitFor(() => expect(shownSeq(container)).toBe("0"));
    longSwipe(card, -600);
    await waitFor(() => expect(shownSeq(container)).toBe("1"));
    await new Promise((r) => setTimeout(r, 10));
    expect(shownSeq(container)).toBe("1");

    // И так же в обратную сторону.
    longSwipe(card, 600);
    await waitFor(() => expect(shownSeq(container)).toBe("0"));
  });

  it("edition=frame: короткий мах по трекпаду не пролистывает дроп целиком", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([0, 1, 2, 3, 4, 5].map(landscape));

    const { container } = render(<LatestDropTile edition="frame" />);
    const card = await screen.findByLabelText(/Открыть дроп/);
    for (let i = 0; i < 6; i += 1) swipe(card, 70); // к началу плёнки
    await waitFor(() => expect(shownSeq(container)).toBe("0"));

    // Один мах двумя пальцами приезжает ПАЧКОЙ событий: два десятка по 40px подряд, и почти
    // все — уже хвост инерции. Пока кадр не остыл, путь не копится вовсе, поэтому мах стоит
    // один кадр, а не восемь. Плитка между событиями ещё и перерисовывается, так что счётчик
    // обязан жить в ссылке — в замыкании его сбрасывал бы им же вызванный кадр.
    for (let i = 0; i < 20; i += 1) fireEvent.wheel(card, { deltaX: 40, deltaY: 0 });
    await waitFor(() => expect(shownSeq(container)).toBe("1"));
    await new Promise((r) => setTimeout(r, 20));
    expect(shownSeq(container)).toBe("1");
  });

  it("edition=frame: непрерывный жест трекпадом листает кадр за кадром, не один и всё", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([0, 1, 2, 3, 4, 5].map(landscape));

    const { container } = render(<LatestDropTile edition="frame" />);
    const card = await screen.findByLabelText(/Открыть дроп/);
    for (let i = 0; i < 6; i += 1) swipe(card, 70); // к началу плёнки
    await waitFor(() => expect(shownSeq(container)).toBe("0"));

    // Ровно жалоба владельца: пальцы ведут не отрываясь, курсор при этом стоит на месте —
    // и раньше кадр менялся ОДИН раз за весь жест. Ведение — это события, разделённые
    // настоящим временем, поэтому и тут паузы настоящие.
    // Шаг события выводим из порога, а не держим числом: подогнанное под порог число
    // молча ломается вместе с ним, и тест начинает проверять не то, что написано.
    const perEvent = Math.ceil((FRAME_WHEEL_TRAVEL_PX + 40) / 4);
    for (let burst = 0; burst < 3; burst += 1) {
      for (let i = 0; i < 4; i += 1) fireEvent.wheel(card, { deltaX: perEvent, deltaY: 0 });
      await new Promise((done) => setTimeout(done, FRAME_STEP_COOLDOWN_MS + 40));
    }
    await waitFor(() => expect(shownSeq(container)).toBe("3"));
  });

  it("edition=frame: следующий мах листает дальше — кадр к тому времени остыл", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([0, 1, 2, 3, 4, 5].map(landscape));

    const { container } = render(<LatestDropTile edition="frame" />);
    const card = await screen.findByLabelText(/Открыть дроп/);
    for (let i = 0; i < 6; i += 1) swipe(card, 70);
    await waitFor(() => expect(shownSeq(container)).toBe("0"));

    for (let i = 0; i < 10; i += 1) fireEvent.wheel(card, { deltaX: 40, deltaY: 0 });
    await waitFor(() => expect(shownSeq(container)).toBe("1"));
    // Рука отпустила — к следующему маху кадр уже остыл, и он снова стоит кадр.
    await new Promise((done) => setTimeout(done, FRAME_STEP_COOLDOWN_MS + 40));
    for (let i = 0; i < 10; i += 1) fireEvent.wheel(card, { deltaX: 40, deltaY: 0 });
    await waitFor(() => expect(shownSeq(container)).toBe("2"));
  });


  it("edition=frame: соседние кадры тянутся заранее — свайп не ждёт сеть", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    const photos = [0, 1, 2, 3, 4].map(landscape);
    getDropMock.mockResolvedValue(photos);

    const { container } = render(<LatestDropTile edition="frame" />);
    await screen.findByLabelText(/Открыть дроп/);
    await waitFor(() => expect(container.querySelector(".drop-frame__img")).not.toBeNull());

    // Показанный кадр — какой-то из выборки; рядом с ним обязаны быть заказаны соседи (±1, ±2),
    // иначе каждый жест на телефоне упирается в загрузку.
    const shown = container.querySelector(".drop-frame__img")!.getAttribute("src")!;
    const shownIdx = photos.findIndex((p) => shown.includes(p.imageUrl));
    const neighbours = [shownIdx - 2, shownIdx - 1, shownIdx + 1, shownIdx + 2].filter(
      (i) => i >= 0 && i < photos.length,
    );
    expect(neighbours.length).toBeGreaterThan(0);
    for (const i of neighbours) {
      await waitFor(() => expect(ImageStub.srcs.some((s) => s.includes(photos[i].imageUrl))).toBe(true));
    }
  });

  it("edition=frame: свайп НЕ пересоздаёт узлы кадра — курсор остаётся над теми же", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([landscape(0), landscape(1), landscape(2)]);

    const { container } = render(<LatestDropTile edition="frame" />);
    const card = await screen.findByLabelText(/Открыть дроп/);
    const img = container.querySelector(".drop-frame__img");
    const view = container.querySelector(".drop-frame__view");

    for (let i = 0; i < 3; i += 1) swipe(card, 70); // к началу плёнки, откуда есть куда шагнуть
    await waitFor(() => expect(shownSeq(container)).toBe("0"));
    swipe(card, -70);
    await waitFor(() => expect(shownSeq(container)).toBe("1"));
    // Тот же самый узел, а не новый с тем же классом: пересозданный слой уносит из-под курсора
    // цель наведения, и браузер перестаёт слать на карточку колесо, пока мышь не двинулась
    //.
    expect(container.querySelector(".drop-frame__img")).toBe(img);
    expect(container.querySelector(".drop-frame__view")).toBe(view);
  });

  it("edition=frame: свайп не открывает галерею — это жест, а не клик по кадру", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([landscape(0), landscape(1)]);

    render(<LatestDropTile edition="frame" />);
    const card = await screen.findByLabelText(/Открыть дроп/);
    swipe(card, -70);
    fireEvent.click(card); // клик, которым браузер завершает перетаскивание
    await new Promise((r) => setTimeout(r, 10));
    expect(document.querySelector(".drop-modal__panel")).toBeNull();
  });

  it("edition=frame: после свайпа СЛЕДУЮЩЕЕ нажатие открывает галерею, а не пропадает", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([landscape(0), landscape(1)]);

    render(<LatestDropTile edition="frame" />);
    const card = await screen.findByLabelText(/Открыть дроп/);
    // Жест, который браузер НЕ завершил кликом: на тач-экране свайп кликом не оборачивается,
    // а на мыши его съедает нативное перетаскивание картинки. Метка «это был жест» обязана
    // умереть вместе с жестом — иначе её снимало бы следующее нажатие вместо открытия.
    swipe(card, -70);
    pointer(card, "pointerdown", 0);
    pointer(card, "pointerup", 0);
    fireEvent.click(card);
    await waitFor(() => expect(document.querySelector(".drop-modal__panel")).not.toBeNull());
  });

  it("edition=frame: кадр открывает модалку так же, как мозаика", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([landscape(0)]);

    render(<LatestDropTile edition="frame" />);
    const box = await screen.findByRole("button", { name: /Открыть дроп/ });
    expect(box).toHaveClass("drop-frame");
  });

  it("edition=sheet: четыре кадра justified-рядами — без обрезки и без поворота, строка данных сверху", async () => {
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => "" } as DOMRect);
    getDropsMock.mockResolvedValue([DROP]);
    const photos = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (i % 2 === 1 ? portrait(i) : landscape(i)));
    getDropMock.mockResolvedValue(photos);

    const { container } = render(<LatestDropTile edition="sheet" />);
    await screen.findByText("Июльская плёнка");

    const imgs = [...container.querySelectorAll(".drop-sheet img")] as HTMLImageElement[];
    expect(imgs).toHaveLength(4);
    expect(container.querySelector("[data-rotated]")).toBeNull();
    // Каждый кадр несёт СВОЮ пропорцию: стоячий остаётся стоячим, лежачий — лежачим.
    for (const img of imgs) {
      const seq = Number(img.getAttribute("src")!.match(/\/(\d+)\/thumb$/)![1]);
      const [w, h] = img.style.aspectRatio.split("/").map((v) => Number(v.trim()));
      const expected = seq % 2 === 1 ? 80 / 120 : 120 / 80;
      expect(Math.abs(w / h - expected) / expected).toBeLessThan(0.05);
    }
    expect(screen.getByText(/12 кадров/)).toBeInTheDocument();
    // В стеке высоту блоку даёт CSS-контракт `.drop-mosaic` (§8) — лист его не теряет.
    expect(screen.getByRole("button", { name: /Открыть дроп/ })).toHaveClass("drop-mosaic");
    rect.mockRestore();
  });

  it("в стеке карточка НЕ жмётся к мозаике: ширина стека и есть ширина карточки", async () => {
    // Прыгающий виджет на телефоне (волна 02, замечание владельца): в стеке высота блока кадров
    // считается от его же ширины (`aspect-ratio` §8), а карточка жалась по ширине к разложенным
    // рядам — ширина меняла высоту, высота меняла раскладку, раскладка меняла ширину. Петля
    // рвётся тем, что в стеке карточка ширину не подгоняет: центровать её всё равно не в чем.
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => "" } as DOMRect);
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([0, 1, 2, 3].map((i) => (i % 2 === 1 ? portrait(i) : landscape(i))));

    const { container } = render(<LatestDropTile edition="sheet" />);
    await screen.findByText("Июльская плёнка");

    const card = container.querySelector(".pixel-tile") as HTMLElement;
    expect(card.style.width).toBe("");
    expect(card.style.marginInline).toBe("");
    rect.mockRestore();
  });

  it("edition=sheet: кадров меньше четырёх — лист показывает столько, сколько есть", async () => {
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => "" } as DOMRect);
    getDropsMock.mockResolvedValue([{ ...DROP, photoCount: 2 }]);
    getDropMock.mockResolvedValue([landscape(0), landscape(1)]);

    const { container } = render(<LatestDropTile edition="sheet" />);
    await screen.findByText("Июльская плёнка");
    expect(container.querySelectorAll(".drop-sheet img")).toHaveLength(2);
    expect(screen.getByText(/2 кадра/)).toBeInTheDocument();
    rect.mockRestore();
  });

  it("незнакомая редакция ⇒ мозаика (дефолт)", async () => {
    getDropsMock.mockResolvedValue([DROP]);
    getDropMock.mockResolvedValue([landscape(0)]);

    const { container } = render(<LatestDropTile edition="hologram" />);
    await screen.findByText("Июльская плёнка");
    expect(container.querySelector(".drop-mosaic")).not.toBeNull();
  });
});

describe("LatestDropTile (крупный последний дроп)", () => {
  it("нет дропов → пустое состояние, кадры не запрашиваются", async () => {
    getDropsMock.mockResolvedValue([]);
    render(<LatestDropTile />);
    expect(await screen.findByText("пока нет дропов")).toBeInTheDocument();
    expect(getDropMock).not.toHaveBeenCalled();
  });

  it("есть дропы → крупно показывает последний (его название и кадры)", async () => {
    getDropsMock.mockResolvedValue([
      { id: 2, title: "Июльская плёнка", droppedOn: "2026-07-02", monthLabel: "июль 2026", photoCount: 12, coverPhotoUrl: "/api/film-media/2/0/thumb" },
      { id: 1, title: "Июньская плёнка", droppedOn: "2026-06-10", monthLabel: "июнь 2026", photoCount: 36, coverPhotoUrl: "/api/film-media/1/0/thumb" },
    ]);
    getDropMock.mockResolvedValue([
      { imageUrl: "/api/film-media/2/0/web", thumbUrl: "/api/film-media/2/0/thumb", width: 120, height: 80 },
    ]);

    render(<LatestDropTile />);

    expect(await screen.findByText("Июльская плёнка")).toBeInTheDocument();
    // Тянет кадры только последнего дропа (id=2).
    expect(getDropMock).toHaveBeenCalledWith(2, expect.anything());
  });

  it("ширину кадров раздаёт флексбокс, а не пиксели из JS", () => {
    // Пиксельная ширина в `style.width` держалась на том, что движок сложит числа так же,
    // как их сложил расчёт. Safari складывал иначе, и правый кадр вылезал за карточку.
    // `flex-grow` + `flex-basis: 0` заставляют ряд заполнить контейнер по определению.
    const photos = [0, 1, 2, 3].map(landscape);
    const mosaic = buildMosaic(photos, 341, 260)!;
    expect(mosaic.flat().length).toBe(4);
    // Сам контракт разметки проверяется рендером ниже — здесь фиксируем, что расчёт
    // по-прежнему отдаёт целые ширины, из которых берутся grow-коэффициенты.
    for (const cell of mosaic.flat()) expect(Number.isInteger(cell.w)).toBe(true);
  });

  it("ширина карточки НЕ анимируется — иначе WebKit размазывает её тень по боковым зазорам", async () => {
    // Плитка несёт filter: drop-shadow, то есть свой композитный слой; тень волны 01 смещена
    // вправо-вниз и выходит за бокс. WebKit не подчищает область, освобождённую сжимающимся
    // слоем, и каждый кадр перегона ширины оставлял полосу тени — в Safari справа от карточки
    // вырастала гребёнка из десятка полос (docs/pitfalls.md).
    //
    // Геометрию подставляем руками: без неё `frameW` нулевой, карточка идёт по ветке «ширина
    // не задана», и замок сторожил бы ветку, в которой анимации не бывает и так.
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => "" } as DOMRect);
    getDropsMock.mockResolvedValue([
      { id: 2, title: "Июльская плёнка", droppedOn: "2026-07-02", monthLabel: "июль 2026", photoCount: 12, coverPhotoUrl: "/api/film-media/2/0/thumb" },
    ]);
    getDropMock.mockResolvedValue([landscape(0), landscape(1), landscape(2)]);

    // Высота слота (бенто) обязательна: жмётся к мозаике только там, в стеке карточка берёт
    // всю ширину ряда (см. тест про прыгающий виджет выше).
    const { container } = render(<LatestDropTile style={{ height: 300 }} />);
    await screen.findByText("Июльская плёнка");

    const card = container.querySelector(".pixel-tile") as HTMLElement;
    // Ширина действительно посчиталась ⇒ замок стоит на той самой ветке.
    expect(card.style.width).not.toBe("");
    expect(card.style.transition).toBe("");
    rect.mockRestore();
  });

  it("блок мозаики зацеплен за .drop-mosaic — свою высоту ему даёт CSS", async () => {
    // Высота блока — вход расчёта рядов (`buildMosaic` при H<=0 возвращает null), а в мобильном
    // стеке родитель её не задаёт: без собственной высоты плитка оставалась без кадров навсегда
    // (пустой блок мерился нулём, ноль не давал кадров). Пиксели проверяет CSS-контракт
    // `app/styles/stackHeights.test.ts`, здесь — что зацепка на месте.
    getDropsMock.mockResolvedValue([
      { id: 2, title: "Июльская плёнка", droppedOn: "2026-07-02", monthLabel: "июль 2026", photoCount: 12, coverPhotoUrl: "/api/film-media/2/0/thumb" },
    ]);
    getDropMock.mockResolvedValue([
      { imageUrl: "/api/film-media/2/0/web", thumbUrl: "/api/film-media/2/0/thumb", width: 120, height: 80 },
    ]);

    render(<LatestDropTile />);

    const box = await screen.findByRole("button", { name: /Открыть дроп/ });
    expect(box).toHaveClass("drop-mosaic");
  });
});

describe("LatestDropTile — ряд мозаики заполняет контейнер сам", () => {
  it("у кадров flex-grow и нулевой базис, а жёсткой ширины в пикселях нет", async () => {
    // Регрессионный замок на несущее решение: горизонталь не должна зависеть от того,
    // как движок сложит записанные из JS пиксели. Вернётся `width: Npx` — вернётся и
    // обрезка правого кадра в Safari.
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => "" } as DOMRect);
    getDropsMock.mockResolvedValue([
      { id: 2, title: "Июльская плёнка", droppedOn: "2026-07-02", monthLabel: "июль 2026", photoCount: 12, coverPhotoUrl: "/api/film-media/2/0/thumb" },
    ]);
    getDropMock.mockResolvedValue([landscape(0), landscape(1), landscape(2), landscape(3)]);

    const { container } = render(<LatestDropTile />);
    await screen.findByText("Июльская плёнка");

    const imgs = [...container.querySelectorAll(".drop-mosaic img")] as HTMLImageElement[];
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img.style.flexGrow).not.toBe("");
      expect(img.style.flexBasis).toBe("0px");
      expect(img.style.width).toBe("");
      expect(img.style.aspectRatio).not.toBe("");
    }
    // Ряд тянется во всю ширину контейнера, а не по сумме пикселей.
    const row = container.querySelector(".drop-mosaic > div") as HTMLElement;
    expect(row.style.width).toBe("100%");
    rect.mockRestore();
  });
});
