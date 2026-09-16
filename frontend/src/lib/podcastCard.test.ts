import { describe, expect, it } from "vitest";

import { episodeForStop, listenedLabel, stretchLabel } from "./podcastCard";
import type { PodcastEpisodeView } from "./api/types";

const episode = (
  name: string,
  listened = 40,
  duration: number | null = 48,
  patch: Partial<PodcastEpisodeView> = {},
): PodcastEpisodeView => ({
  episodeName: name,
  episodeUrl: `https://open.spotify.com/episode/${name}`,
  showName: `шоу ${name}`,
  showUrl: `https://open.spotify.com/show/${name}`,
  imageUrl: null,
  listenedMinutes: listened,
  startMinute: 0,
  endMinute: listened,
  durationMinutes: duration,
  ...patch,
});

describe("episodeForStop", () => {
  it("раздаёт карточки остановкам по порядку", () => {
    const list = [episode("A"), episode("B")];
    expect(episodeForStop(list, 1)?.episodeName).toBe("A");
    expect(episodeForStop(list, 2)?.episodeName).toBe("B");
  });

  it("оставляет вторую остановку без карточки, когда заход был один", () => {
    // A marathon in one sitting closes both stops but has a single card, and that is correct.
    const list = [episode("A", 120)];
    expect(episodeForStop(list, 1)?.episodeName).toBe("A");
    expect(episodeForStop(list, 2)).toBeNull();
  });

  it("молчит, когда карточек нет вовсе", () => {
    expect(episodeForStop([], 1)).toBeNull();
    expect(episodeForStop(undefined, 1)).toBeNull();
  });
});

describe("подвал карточки подкаста", () => {
  it("сумма минут захода — отдельной строкой над куском", () => {
    expect(listenedLabel(episode("A", 47, 48))).toBe("47 мин");
  });

  it("продолжение эпизода показывает СВОЙ кусок, а не начало выпуска", () => {
    // This is why the chunk line exists: bare minutes on a second sitting do not say from where to
    // where it ran, and it is indistinguishable from re-listening to the start.
    expect(stretchLabel(episode("A", 50, 199, { startMinute: 45, endMinute: 95 }))).toBe("45 → 95 мин");
    expect(stretchLabel(episode("A", 47, 48))).toBe("0 → 47 мин");
  });

  it("без известных границ окна куска нет", () => {
    // The sitting was recorded before we watched the window: an arrow with no start answers
    // nothing — stay silent rather than substitute a zero.
    expect(stretchLabel(episode("A", 40, 48, { startMinute: null, endMinute: null }))).toBeNull();
  });

  it("нулевой кусок не строка: точка — не отрезок", () => {
    expect(stretchLabel(episode("A", 0, 48, { startMinute: 12, endMinute: 12 }))).toBeNull();
  });
});
