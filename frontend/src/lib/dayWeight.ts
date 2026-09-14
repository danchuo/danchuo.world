import type { DaySummary } from "@/lib/api/types";
import { MONSTER_LENS_KEY } from "@/lib/disciplineLens";

/**
 * «Вес дня» — насколько плотно прожит день, одним числом `0..1` (DESIGN §5.2).
 *
 * Нужен редакции календаря `field`: там яркость клетки — функция веса, и вопрос «сколько»
 * переезжает из подписи в свет. Чистая функция и свой модуль, потому что это правило про
 * ДАННЫЕ, а не про рендер: канал легко сместить, а компонент не должен знать, из чего
 * складывается плотность дня.
 *
 * Вес — среднее ЧЕТЫРЁХ каналов, и пустой канал считается нулём, а не выпадает из среднего.
 * Иначе день, у которого доехали одни вклады, светился бы наравне с прожитым целиком:
 * среднее по одному каналу — это сам канал. Тёмный день здесь честно значит «либо ничего
 * не было, либо ничего не записалось», а различить эти два случая — работа метки пропуска,
 * а не света.
 */

/** Норма канала «шаги»: круглые десять тысяч, выше — тот же полный балл. */
export const STEPS_FULL = 10_000;
/** Норма канала «сон»: восемь часов. */
export const SLEEP_FULL = 480;
/** Норма канала «вклады» за день. */
export const CODE_FULL = 10;

/** Доля канала от нормы, зажатая в `[0, 1]`; `null` и мусор — ноль. */
function share(value: number | null | undefined, full: number): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(1, value / full);
}

/**
 * Доля закрытых пунктов дисциплины за день.
 *
 * Монстр из счёта исключён: это не пункт, который выполняют, а факт, который отмечают
 * (§6) — в весе дня он бы читался как заслуга. Пункт с `target=2` закрытым считается
 * с первого раза: вес меряет плотность дня, а не стрик остановки (§5.6).
 */
function disciplineShare(counts: DaySummary["disciplineCounts"]): number {
  if (!counts) return 0;
  const keys = Object.keys(counts).filter((k) => k !== MONSTER_LENS_KEY);
  if (keys.length === 0) return 0;
  const done = keys.filter((k) => (counts[k] ?? 0) > 0).length;
  return done / keys.length;
}

/**
 * Вес дня `0..1`. Ненаступивший и непрожитый день весит ноль: света у него ещё нет,
 * и это ровно то, что должна показать клетка.
 */
export function dayWeight(day: DaySummary): number {
  if (!day.hasData) return 0;
  const parts = [
    share(day.steps, STEPS_FULL),
    share(day.sleepMinutes, SLEEP_FULL),
    share(day.contributions, CODE_FULL),
    disciplineShare(day.disciplineCounts),
  ];
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}
