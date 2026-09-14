import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SocialLinkView } from "@/lib/api/types";
import { SocialTile } from "./SocialTile";

vi.mock("@/lib/api/client", () => ({
  getSocialLinks: vi.fn(),
  getLatestInstagramPost: vi.fn(),
  getTelegramProfile: vi.fn(),
}));
import { getLatestInstagramPost, getSocialLinks, getTelegramProfile } from "@/lib/api/client";
const getSocialLinksMock = vi.mocked(getSocialLinks);
const getPostMock = vi.mocked(getLatestInstagramPost);
const getTelegramMock = vi.mocked(getTelegramProfile);

afterEach(() => vi.clearAllMocks());

// Источников превью два (пост Instagram и визитка Telegram), и плитка спрашивает оба разом.
// Умолчание «пусто» на обоих обязательно: незамоканный источник отдаёт `undefined`, и плитка
// падает на нём ещё до того, как тест дойдёт до своей проверки.
beforeEach(() => {
  getPostMock.mockResolvedValue(null);
  getTelegramMock.mockResolvedValue(null);
});

function link(platform: string): SocialLinkView {
  return {
    platform,
    name: platform,
    url: `https://example.com/${platform}`,
    icon: `/assets/social/${platform}.svg`,
  };
}

async function grid(platforms: string[]): Promise<HTMLElement> {
  getSocialLinksMock.mockResolvedValue(platforms.map(link));
  // Свой контейнер на каждый рендер: в одном тесте сетка строится несколько раз, и глобальный
  // поиск по документу нашёл бы ссылки предыдущей сетки.
  const { container } = render(<SocialTile />);
  await within(container).findByLabelText(platforms[0]);
  return container.querySelector(".social-grid") as HTMLElement;
}

describe("SocialTile", () => {
  /**
   * Число колонок приезжает ПЕРЕМЕННОЙ, а не inline-стилем `grid-template-columns`: в мобильном
   * стеке квадратная сетка становится одним рядом, а inline-стиль CSS не перебивает ничем,
   * кроме `!important` (тот же приём, что у ширины карточки музыки).
   */
  it("отдаёт квадратную сетку переменной --social-cols, а не inline-раскладкой", async () => {
    const el = await grid(["github", "telegram", "x", "instagram"]);
    expect(el.style.getPropertyValue("--social-cols")).toBe("2");
    expect(el.style.gridTemplateColumns).toBe("");
  });

  it("сетка остаётся квадратной: до 9 ссылок — три колонки, дальше четыре", async () => {
    expect((await grid(["a", "b", "c", "d", "e"])).style.getPropertyValue("--social-cols")).toBe("3");
    expect(
      (await grid(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"])).style.getPropertyValue(
        "--social-cols",
      ),
    ).toBe("4");
  });

  /**
   * Фирменную марку платформы компонент только ПУБЛИКУЕТ (адрес в `--social-brand` + метка
   * `social-icon--brand`); показать её или красить одноцветную маску токеном — дело скина
   * волны. Платформе без своей марки переменная не приезжает вовсе, иначе скин нарисовал бы
   * пустой фон вместо значка.
   */
  it("публикует фирменную марку платформы переменной, а решение оставляет скину", async () => {
    const el = await grid(["github", "telegram", "x", "instagram", "mastodon"]);
    const icon = (p: string) => el.querySelector<HTMLElement>(`[aria-label="${p}"] .social-icon`)!;

    for (const p of ["github", "telegram", "x", "instagram"]) {
      expect(icon(p)).toHaveClass("social-icon--brand");
      expect(icon(p).style.getPropertyValue("--social-brand")).toBe(`url(/assets/social/brand/${p}.svg)`);
      // Одноцветная маска остаётся при ней: волна вправе выбрать её, а не марку.
      expect(icon(p).style.getPropertyValue("--social-mask")).toBe(`url(/assets/social/${p}.svg)`);
    }
    expect(icon("mastodon")).not.toHaveClass("social-icon--brand");
    expect(icon("mastodon").style.getPropertyValue("--social-brand")).toBe("");
  });

  /** Одному ряду в стеке нужно САМО число ссылок — из числа колонок его не вывести. */
  it("отдаёт число ссылок переменной --social-count (ряд в мобильном стеке)", async () => {
    const el = await grid(["github", "telegram", "x", "instagram"]);
    expect(el.style.getPropertyValue("--social-count")).toBe("4");
  });
});

describe("SocialTile — превью последнего поста (редакция peek)", () => {
  const post = {
    username: "danchuo_",
    permalink: "https://instagram.com/p/abc",
    caption: "вечерний двор",
    mediaType: "IMAGE",
    imageUrl: "/api/instagram-media/post",
    avatarUrl: "/api/instagram-media/avatar",
    likes: 347,
    comments: 12,
    postedAt: "2026-09-11T18:00:00Z",
  };

  async function tile(edition?: string) {
    getSocialLinksMock.mockResolvedValue([link("instagram"), link("telegram")]);
    const { container } = render(<SocialTile edition={edition} />);
    await within(container).findByLabelText("instagram");
    return container;
  }

  it("без редакции пост не запрашивается вовсе: на других волнах это просто ряд ссылок", async () => {
    await tile();
    expect(getPostMock).not.toHaveBeenCalled();
  });

  it("в редакции peek карточка поста висит у марки Instagram", async () => {
    getPostMock.mockResolvedValue(post);
    await tile("peek");
    // Карточка живёт в ПОРТАЛЕ (плитка режет содержимое, см. HoverTip), поэтому ищем
    // её в документе, а не в контейнере плитки.
    const card = await screen.findByText("347 отметок «Нравится»");
    expect(card).not.toBeNull();
    expect(document.querySelector(".ig-peek")).not.toBeNull();
  });

  it("пустой источник карточку не рисует: марка остаётся обычной ссылкой", async () => {
    getPostMock.mockResolvedValue(null);
    const container = await tile("peek");
    expect(document.querySelector(".ig-peek")).toBeNull();
    expect(container.querySelector('a[aria-label="instagram"]')).not.toBeNull();
  });

  it("спрятанные владельцем счётчики не рисуются вовсе — ноль соврал бы", async () => {
    getPostMock.mockResolvedValue({ ...post, likes: null, comments: null });
    await tile("peek");
    await screen.findByText("вечерний двор", { exact: false });
    expect(screen.queryByText(/отметок/)).toBeNull();
    expect(screen.queryByText(/комментариев/)).toBeNull();
  });

  it("марка с карточкой стоит в ячейке так же, как марки без неё", async () => {
    // ⚠️ Регрессия прода. Обёртка подсказки появляется ВМЕСТЕ с данными — то есть у одной
    // марки из четырёх и только когда пост доехал. `inline-block`-обёртка схлопывала ссылку
    // с `w-full` в ноль: знак уезжал из ячейки влево-вверх, пока соседи стояли на месте.
    // Обёртка обязана быть безразличной к раскладке, потому что она то есть, то нет.
    getPostMock.mockResolvedValue(post);
    const container = await tile("peek");
    await screen.findByText("вечерний двор", { exact: false });

    const anchors = container.querySelectorAll(".hover-tip-anchor");
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toHaveClass("hover-tip-anchor--fill");
    // Ссылка внутри обёртки — та же полноразмерная карточка, что и у соседей.
    expect(anchors[0].querySelector("a")).toHaveClass("h-full", "w-full");
  });

});

describe("SocialTile — визитка Telegram (редакция peek)", () => {
  const profile = {
    name: "Данила",
    username: "danchuo",
    bio: "keep",
    avatarUrl: "/api/telegram/avatar?v=7",
  };

  async function tile(edition?: string) {
    getSocialLinksMock.mockResolvedValue([link("instagram"), link("telegram")]);
    const { container } = render(<SocialTile edition={edition} />);
    await within(container).findByLabelText("telegram");
    return container;
  }

  it("без редакции визитка не запрашивается вовсе", async () => {
    await tile();
    expect(getTelegramMock).not.toHaveBeenCalled();
  });

  it("в редакции peek визитка висит у марки Telegram", async () => {
    getTelegramMock.mockResolvedValue(profile);
    await tile("peek");
    // Карточка живёт в ПОРТАЛЕ (плитка режет содержимое, см. HoverTip) — ищем в документе.
    await screen.findByText("Данила");
    expect(screen.getByText("@danchuo")).not.toBeNull();
    expect(screen.getByText("keep")).not.toBeNull();
    expect(document.querySelector(".tg-peek")).not.toBeNull();
  });

  /** Обе гиперссылки ведут туда же, куда сама марка: адрес профиля у борда ОДИН. */
  it("аватар и кнопка ведут по адресу самой марки", async () => {
    getTelegramMock.mockResolvedValue(profile);
    await tile("peek");
    await screen.findByText("Данила");

    const hrefs = [...document.querySelectorAll<HTMLAnchorElement>(".tg-peek a")].map((a) => a.href);
    expect(hrefs).toHaveLength(2);
    expect(new Set(hrefs)).toEqual(new Set(["https://example.com/telegram"]));
  });

  it("пустой источник карточку не рисует: марка остаётся обычной ссылкой", async () => {
    getTelegramMock.mockResolvedValue(null);
    const container = await tile("peek");
    expect(document.querySelector(".tg-peek")).toBeNull();
    expect(container.querySelector('a[aria-label="telegram"]')).not.toBeNull();
  });

  /** Пустой статус — законное состояние аккаунта: строки просто нет, прочерка тоже. */
  it("аккаунт без статуса не рисует строку статуса", async () => {
    getTelegramMock.mockResolvedValue({ ...profile, bio: null });
    await tile("peek");
    await screen.findByText("Данила");
    expect(document.querySelector(".tg-peek__bio")).toBeNull();
  });

  /** Аватара может не быть — на его месте штатный серый круг, а не дыра в раскладке. */
  it("аккаунт без аватара оставляет круг на месте", async () => {
    getTelegramMock.mockResolvedValue({ ...profile, avatarUrl: null });
    await tile("peek");
    await screen.findByText("Данила");
    expect(document.querySelector(".tg-peek img")).toBeNull();
    expect(document.querySelector(".tg-peek__image--blank")).not.toBeNull();
  });
});

describe("SocialTile — переезд курсора с марки на марку", () => {
  const post = {
    username: "danchuo_",
    permalink: "https://instagram.com/p/abc",
    caption: "вечерний двор",
    mediaType: "IMAGE",
    imageUrl: "/api/instagram-media/post",
    avatarUrl: "/api/instagram-media/avatar",
    likes: 347,
    comments: 12,
    postedAt: "2026-09-11T18:00:00Z",
  };
  const profile = { name: "Данила", username: "danchuo", bio: "keep", avatarUrl: null };

  /**
   * ⚠️ Регрессия прода. Марки стоят вплотную, и переезд с одной на соседнюю — это уход с
   * первой и приход на вторую в один момент. Уход с карточки отложен (курсор должен успеть
   * доехать до неё через зазор), поэтому прежняя карточка досиживала свою отсрочку под уже
   * раскрытой новой: на мгновение было видно две наложенные.
   */
  it("карточка предыдущей марки гаснет сразу, не досиживая отсрочку", async () => {
    getPostMock.mockResolvedValue(post);
    getTelegramMock.mockResolvedValue(profile);
    getSocialLinksMock.mockResolvedValue([link("instagram"), link("telegram")]);
    const { container } = render(<SocialTile edition="peek" />);
    await screen.findByText("вечерний двор", { exact: false });

    const [igAnchor, tgAnchor] = [...container.querySelectorAll(".hover-tip-anchor")];
    const tipOf = (cls: string) => document.querySelector(cls)!.closest(".hover-tip")!;

    fireEvent.pointerEnter(igAnchor);
    expect(tipOf(".ig-peek")).toHaveAttribute("data-open", "true");

    // Ровно как ведёт себя указатель: уходит с первой марки и тут же приходит на вторую.
    fireEvent.pointerLeave(igAnchor);
    fireEvent.pointerEnter(tgAnchor);

    expect(tipOf(".tg-peek")).toHaveAttribute("data-open", "true");
    expect(tipOf(".ig-peek")).not.toHaveAttribute("data-open");
  });

  /** Переезд с марки НА её же карточку отсрочку не отменяет — иначе до ссылок не доехать. */
  it("переезд на саму карточку её не гасит", async () => {
    getPostMock.mockResolvedValue(post);
    getSocialLinksMock.mockResolvedValue([link("instagram")]);
    const { container } = render(<SocialTile edition="peek" />);
    await screen.findByText("вечерний двор", { exact: false });

    const anchor = container.querySelector(".hover-tip-anchor")!;
    const tip = document.querySelector(".ig-peek")!.closest(".hover-tip")!;

    fireEvent.pointerEnter(anchor);
    fireEvent.pointerLeave(anchor);
    fireEvent.pointerEnter(tip);
    expect(tip).toHaveAttribute("data-open", "true");
  });
});
