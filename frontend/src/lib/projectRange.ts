/**
 * Форматирование временно́го промежутка проекта (PRD §5.7): «Q3 2025 — Q1 2026» или
 * «Q3 2025 — наст.» (открытый конец). Презентация живёт на фронте — бэк отдаёт сырые числа.
 */

/** Один край диапазона: с кварталом — «Q3 2025», без — просто «2025». */
function formatEdge(year: number, quarter: number | null): string {
  return quarter ? `Q${quarter} ${year}` : `${year}`;
}

/**
 * Диапазон проекта. Открытый конец (`endYear == null`) → «наст.»; иначе — второй край.
 * Кварталы опциональны независимо для начала и конца. Совпадающие края (проект, живший
 * один квартал/год) схлопываются в единственный край без тире.
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
