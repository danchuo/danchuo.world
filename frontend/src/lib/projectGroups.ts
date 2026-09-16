/**
 * Grouping projects by year for the console edition. The year lives in the row's LEFT MARGIN,
 * printed once per group and tied to its subtree by a horizontal line. It is the year of the LAST
 * activity, not the first: only then does position mean something. DESIGN §7.8
 */

/**
 * An output row: the project, its year, whether the year prints here, and the row's place WITHIN
 * the year — each year has its own tree, so the branch kind is computed per group.
 */
export interface ProjectYearRow<T> {
  project: T;
  year: number;
  startsYear: boolean;
  indexInYear: number;
  yearSize: number;
}

/** The part of a record the layout needs: the range's edge and nothing else. */
interface Dated {
  endYear: number | null;
}

/**
 * Unrolls the list into output rows, marking each year's first. An open end reads as "ongoing" and
 * joins the current year, which is passed in so the function stays pure. Rows of one year run
 * together — a year marks off a group rather than labelling a row, so it must not print twice.
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
