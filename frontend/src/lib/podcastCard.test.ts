import { describe, expect, it } from "vitest";

import { episodeForStop, listenedLabel } from "./podcastCard";
import type { PodcastEpisodeView } from "./api/types";

const episode = (name: string, listened = 40, duration: number | null = 48): PodcastEpisodeView => ({
  episodeName: name,
  episodeUrl: `https://open.spotify.com/episode/${name}`,
  showName: `шоу ${name}`,
  showUrl: `https://open.spotify.com/show/${name}`,
  imageUrl: null,
  listenedMinutes: listened,
  durationMinutes: duration,
});

describe("episodeForStop", () => {
  it("раздаёт карточки остановкам по порядку", () => {
    const list = [episode("A"), episode("B")];
    expect(episodeForStop(list, 1)?.episodeName).toBe("A");
    expect(episodeForStop(list, 2)?.episodeName).toBe("B");
  });

  it("оставляет вторую остановку без карточки, когда эпизод был один", () => {
    // Двухчасовой эпизод закрывает обе остановки, но карточка у него одна — это норма.
    const list = [episode("A", 120)];
    expect(episodeForStop(list, 1)?.episodeName).toBe("A");
    expect(episodeForStop(list, 2)).toBeNull();
  });

  it("молчит, когда карточек нет вовсе", () => {
    expect(episodeForStop([], 1)).toBeNull();
    expect(episodeForStop(undefined, 1)).toBeNull();
  });
});

describe("listenedLabel", () => {
  it("показывает прослушанное на фоне полной длительности", () => {
    expect(listenedLabel(episode("A", 47, 48))).toBe("47 из 48 мин");
  });

  it("обходится без знаменателя, когда длительность не приехала", () => {
    expect(listenedLabel(episode("A", 47, null))).toBe("47 мин");
  });

  it("не обещает больше, чем длится эпизод", () => {
    // Переслушанный кусок честно копится в минутах, но «49 из 48» читалось бы как сбой.
    expect(listenedLabel(episode("A", 49, 48))).toBe("48 из 48 мин");
  });
});
