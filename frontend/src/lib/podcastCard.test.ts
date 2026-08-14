import { describe, expect, it } from "vitest";

import { cardTimeLines, episodeForStop } from "./podcastCard";
import type { PodcastEpisodeView } from "./api/types";

const episode = (
  name: string,
  listened = 40,
  duration: number | null = 48,
  dayMinutes = listened,
  startedAt = "2026-08-13T06:12:00Z",
): PodcastEpisodeView => ({
  episodeName: name,
  episodeUrl: `https://open.spotify.com/episode/${name}`,
  showName: `шоу ${name}`,
  showUrl: `https://open.spotify.com/show/${name}`,
  imageUrl: null,
  startedAt,
  listenedMinutes: listened,
  dayMinutes,
  durationMinutes: duration,
});

describe("episodeForStop", () => {
  it("раздаёт карточки остановкам по порядку", () => {
    const list = [episode("A"), episode("B")];
    expect(episodeForStop(list, 1)?.episodeName).toBe("A");
    expect(episodeForStop(list, 2)?.episodeName).toBe("B");
  });

  it("оставляет вторую остановку без карточки, когда заход был один", () => {
    // Марафон в один присест закрывает обе остановки, но карточка у него одна — это норма.
    const list = [episode("A", 120)];
    expect(episodeForStop(list, 1)?.episodeName).toBe("A");
    expect(episodeForStop(list, 2)).toBeNull();
  });

  it("молчит, когда карточек нет вовсе", () => {
    expect(episodeForStop([], 1)).toBeNull();
    expect(episodeForStop(undefined, 1)).toBeNull();
  });
});

describe("cardTimeLines", () => {
  it("одним заходом — одна строка: время начала и прослушанное на фоне длительности", () => {
    // 06:12 UTC — это 09:12 MSK: борд отвечает про день владельца, а не про зону смотрящего.
    expect(cardTimeLines(episode("A", 47, 48))).toEqual(["09:12 · 47 из 48 мин"]);
  });

  it("обходится без знаменателя, когда длительность не приехала", () => {
    expect(cardTimeLines(episode("A", 47, null))).toEqual(["09:12 · 47 мин"]);
  });

  it("не обещает больше, чем длится эпизод", () => {
    // Переслушанный кусок честно копится в минутах, но «49 из 48» читалось бы как сбой.
    expect(cardTimeLines(episode("A", 49, 48))).toEqual(["09:12 · 48 из 48 мин"]);
  });

  it("эпизод, взятый двумя заходами, подписан временем захода и итогом за день", () => {
    // 06:12 UTC — это 09:12 MSK: борд отвечает про день владельца, а не про зону смотрящего.
    expect(cardTimeLines(episode("A", 45, 85, 80))).toEqual([
      "09:12 · 45 мин",
      "80 из 85 мин за день",
    ]);
  });

  it("вечерний заход того же эпизода отличается от утреннего", () => {
    const evening = episode("A", 35, 85, 80, "2026-08-13T16:40:00Z");
    expect(cardTimeLines(evening)).toEqual(["19:40 · 35 мин", "80 из 85 мин за день"]);
  });
});
