/**
 * Раскладка проектов по годам — редакция «консоль» (DESIGN §7.8).
 *
 * Год живёт в ЛЕВОМ ПОЛЕ строки, печатается один раз на группу и связан со своим поддеревом
 * горизонталью: от года к стволу идёт линия, ствол начинается на её уровне и уходит вниз.
 *
 * Год строки — год ПОСЛЕДНЕЙ активности (`endYear`), а не начала: только тогда позиция
 * что-то значит, и идущий по настоящее проект стоит вверху, а не уезжает вниз к году
 * своего старта.
 */

/**
 * Строка вывода: сам проект, его год, признак «здесь год печатается» и место строки ВНУТРИ
 * года — дерево у каждого года своё (ствол растёт от года вниз), поэтому вид ветки считается
 * по группе, а не по общему списку.
 */
export interface ProjectYearRow<T> {
  project: T;
  year: number;
  startsYear: boolean;
  indexInYear: number;
  yearSize: number;
}

/** Достаточная для раскладки часть записи: край диапазона и ничего больше. */
interface Dated {
  endYear: number | null;
}

/**
 * Разворачивает список в строки вывода, помечая первую строку каждого года. Открытый конец
 * (`endYear === null`) читается как «идёт сейчас» и попадает в [currentYear] — год передаётся
 * снаружи, чтобы функция осталась чистой (канон MSK живёт в `date.ts`, а не здесь).
 *
 * Строки одного года идут подряд: порядок годов — порядок первого появления, порядок внутри
 * года — исходный (его задаёт владелец через `sort_order` на бэке). Проект, оторванный от
 * своих сортировкой, приезжает к ним — иначе год пришлось бы печатать дважды, а он отбивает
 * группу, а не подписывает строку.
 */
export function projectYearRows<T extends Dated>(
  projects: readonly T[],
  currentYear: number,
): ProjectYearRow<T>[] {
  const byYear = new Map<number, T[]>();
  for (const project of projects) {
    const year = project.endYear ?? currentYear;
    const group = byYear.get(year);
    if (group) group.push(project);
    else byYear.set(year, [project]);
  }
  return [...byYear].flatMap(([year, group]) =>
    group.map((project, i) => ({
      project,
      year,
      startsYear: i === 0,
      indexInYear: i,
      yearSize: group.length,
    })),
  );
}
