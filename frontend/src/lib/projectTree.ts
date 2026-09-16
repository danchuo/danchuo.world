/**
 * Tree branches for the console edition. The year sits left and joins its subtree by a HORIZONTAL
 * line; there is no vertical above it. The corner is computed over the WHOLE group, not the visible
 * window — fitting it to the last visible row would claim the list had ended. DESIGN §7.8
 */

/**
 * `head` — first of several: the trunk starts at the year's level and goes down; `tee` — the trunk
 * passes through; `corner` — the trunk stops halfway; `only` — the sole row in its group, with no
 * trunk at all and one straight line from the year.
 */
export type BranchKind = "head" | "tee" | "corner" | "only";

/** The branch kind for row `index` of `total` IN ITS OWN YEAR. Pure: no DOM, no data. */
export function treeBranch(index: number, total: number): BranchKind {
  if (total === 1) return "only";
  if (index === 0) return "head";
  return index === total - 1 ? "corner" : "tee";
}
