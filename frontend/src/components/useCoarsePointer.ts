"use client";

import { useEffect, useState } from "react";

/**
 * A pointer without hover — a phone or tablet rather than a mouse. It asks about the POINTER, not
 * the window width: a narrow desktop window is still a desktop. The branch lives in JS because it
 * changes MARKUP, not styling, and hiding nodes by CSS would keep them in the DOM. DESIGN §8
 */
export function useCoarsePointer(): boolean {
  // The first render MUST match the server's, so it starts as "mouse" and asks the environment only
  // after mounting. Querying `matchMedia` in the initialiser would hydrate a phone with `true`
  // against the server's `false` — and here the branch changes the TREE, so React tears it down.
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia?.(QUERY);
    if (!mql) return;
    const sync = () => setCoarse(mql.matches);
    sync(); // the first honest value: right after mounting, before the user's first frame
    mql.addEventListener?.("change", sync);
    return () => mql.removeEventListener?.("change", sync);
  }, []);

  return coarse;
}

const QUERY = "(hover: none), (pointer: coarse)";
