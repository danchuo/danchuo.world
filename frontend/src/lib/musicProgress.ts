/**
 * Головка воспроизведения (PRD §5.5): где Spotify сейчас внутри трека.
 *
 * Бэкенд отдаёт `progressMs` мгновенным снимком в момент ответа, а опрос идёт раз в ~20с —
 * если рисовать снимок как есть, шкала будет дёргаться раз в двадцать секунд. Поэтому между
 * ответами головку **досчитываем по часам**: сервер даёт опору, клиент — ход. Модуль чистый
 * (ни React, ни таймеров) — в нём вся арифметика, которую иначе пришлось бы проверять
 * скриншотом.
 */

/** Снимок головки: что сказал сервер и в какой момент этот ответ приехал. */
export interface ProgressSample {
  /** Головка из ответа `/api/spotify/now-playing`; `null` — сервер её не дал. */
  progressMs: number | null;
  /** `Date.now()` в момент приёма ответа — опора, от которой отсчитывается ход. */
  atMs: number;
  /** Стоит на паузе ⇒ головка не едет, сколько бы времени ни прошло. */
  isPlaying: boolean;
}

/**
 * Головка **сейчас**: снимок плюс время, прошедшее с него, — и только пока трек играет.
 *
 * Два потолка, оба из жизни, а не из гигиены:
 * - вкладка может простоять скрытой полчаса (опрос там намеренно стоит, §5.5), и без потолка
 *   по длительности головка уехала бы далеко за конец трека;
 * - системные часы умеют прыгать назад (синхронизация времени), и отрицательная дельта
 *   отматывала бы головку к началу — берём её не меньше нуля.
 */
export function elapsedMs(
  sample: ProgressSample,
  nowMs: number,
  durationMs: number | null,
): number | null {
  const { progressMs, atMs, isPlaying } = sample;
  if (progressMs == null) return null;
  if (!isPlaying) return progressMs;
  const drift = Math.max(0, nowMs - atMs);
  const elapsed = progressMs + drift;
  return durationMs != null ? Math.min(elapsed, durationMs) : elapsed;
}

/** Доля пройденного [0, 1]; `null`, когда считать не из чего (нет головки или длительности). */
export function progressRatio(elapsed: number | null, durationMs: number | null): number | null {
  if (elapsed == null || durationMs == null || durationMs <= 0) return null;
  return Math.min(1, Math.max(0, elapsed / durationMs));
}

/**
 * Часы плеера: `м:сс`, а на длинном (подкаст, микс) — `ч:мм:сс`.
 *
 * Секунды режутся ВНИЗ, а не округляются: на экране плеера 1:47.9 — это всё ещё 1:47,
 * секунда наступает, а не приближается. Нечего показывать — прочерк той же ширины, чтобы
 * строка не прыгала, когда головка появится.
 */
export function formatClock(ms: number | null): string {
  if (ms == null) return "–:––";
  const total = Math.floor(Math.max(0, ms) / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * Насколько старым может быть снимок, чтобы по нему ещё имело смысл досчитывать головку.
 *
 * Пять минут — не круглое число, а грубая верхняя оценка одного трека: снимок, доживший до
 * такого возраста, уже ничего не знает ни про головку, ни даже про то, играет ли что-то.
 */
export const HEAD_MAX_AGE_MS = 5 * 60_000;

/**
 * Опора для шкалы из ответа сервера ЛИБО из его копии в localStorage — со своим собственным
 * временем, а не с моментом чтения.
 *
 * В этом и весь смысл функции. Копия кладётся в кэш вместе с меткой записи, поэтому после F5
 * внутри окна опроса (~20с) шкала встаёт туда, где головка на самом деле, а не откатывается
 * к сохранённому значению, чтобы через мгновение догнать рывком (замечание владельца).
 *
 * Копия, пролежавшая дольше [HEAD_MAX_AGE_MS], опорой быть не может: досчитав по ней, мы бы
 * показали трек доигранным до конца (потолок по длительности), хотя на деле неизвестно даже,
 * играет ли он. Такой снимок отдаётся пустым — шкала честно ждёт живого ответа.
 */
export function headSample(
  progressMs: number | null,
  atMs: number,
  isPlaying: boolean,
  nowMs: number,
): ProgressSample {
  const fresh = nowMs - atMs <= HEAD_MAX_AGE_MS;
  return fresh
    ? { progressMs, atMs, isPlaying }
    : { progressMs: null, atMs, isPlaying: false };
}
