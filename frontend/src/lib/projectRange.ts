/**
 * Formatting a project's time range (PRD §5.7): two edges, or one edge and "present" for an open
 * end. Presentation lives on the frontend — the backend serves raw numbers.
 */

/** One edge of the range: with a quarter it is `Q3 2025`, without it just the year. */
function formatEdge(year: number, quarter: number | null): string {
  return quarter ? `Q${quarter} ${year}` : `${year}`;
}

/**
 * The project's range. An open end (`endYear == null`) reads as "present"; otherwise the second
 * edge is printed. Quarters are optional on each edge independently, and matching edges (a project
 * that lived one quarter or year) collapse into a single edge with no dash.
 */
export function formatQuarterRange(
  startYear: number,
  startQuarter: number | null,
  endYear: number | null,
  endQuarter: number | null,
): string {
  const start = formatEdge(startYear, startQuarter);
  if (startYear === endYear && startQuarter === endQuarter) return start;
  const end = endYear === null ? "наст." : formatEdge(endYear, endQuarter);
  return `${start} — ${end}`;
}
