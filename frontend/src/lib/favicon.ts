/**
 * Иконка вкладки (favicon) — вращающаяся Земля, по волне (DESIGN §10.3).
 *
 * Анимировать вкладку картинкой нельзя: анимированный GIF в фавиконе крутит только Firefox,
 * Chrome/Safari показывают первый кадр. Поэтому кадры едут **спрайтом** — горизонтальной
 * лентой квадратных клеток в одном PNG, — а браузеру их подсовывает [FaviconSpinner]:
 * режет ленту канвасом один раз и меняет `href` у `<link rel="icon">`. Один запрос на волну,
 * дальше только смена строки.
 *
 * Волна может принести свою иконку — как приносит токены, скин и раскладку. Без своей записи
 * волна получает дефолт: новая волна работает без правок кода, как и всё остальное в §10.
 */

export interface FaviconSprite {
  /** Спрайт-лента: `frames` клеток `cell`×`cell` в ряд. */
  src: string;
  frames: number;
  cell: number;
  /** Сколько держится один кадр. Полный оборот = `frames * frameMs`. */
  frameMs: number;
}

/** Земля по умолчанию — на всех волнах, у которых нет своей (48 кадров, оборот 3.84с). */
const EARTH_SPIN: FaviconSprite = {
  src: "/assets/favicon/earth-spin.png",
  frames: 48,
  cell: 32,
  frameMs: 80,
};

/** Иконки волн: ключ волны → спрайт. Волны здесь нет ⇒ она получает [EARTH_SPIN]. */
export const FAVICON_SPRITES: Record<string, FaviconSprite> = {
  // Волна 02 «Obscura» — 8-битная планета в тон её пиксельному шрифту и облакам.
  // Кадров всего 8, поэтому шаг длиннее: оборот 1.28с, иначе планета дёргается.
  "wave-02": { src: "/assets/favicon/earth-pixel.png", frames: 8, cell: 32, frameMs: 160 },
};

/** Спрайт для волны; неизвестная/пустая/будущая волна — тихо дефолт (как и весь §10). */
export function resolveFavicon(wave?: string | null): FaviconSprite {
  return (wave && FAVICON_SPRITES[wave]) || EARTH_SPIN;
}

/** Полный оборот планеты. */
export function faviconLoopMs(sprite: FaviconSprite): number {
  return sprite.frames * sprite.frameMs;
}

/**
 * Кадр по прошедшему времени, а не по счётчику тиков: фоновая вкладка душит таймеры, и
 * счётчик отставал бы от реального времени — после возврата планета «доматывала» бы оборот.
 */
export function faviconFrameAt(elapsedMs: number, sprite: FaviconSprite): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.floor(elapsedMs / sprite.frameMs) % sprite.frames;
}
