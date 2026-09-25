"use client";

import { useEffect } from "react";

/** Open overlays holding the lock: a nested one closing must not free the page under the outer. */
let holders = 0;

/**
 * Freezes the page under an open overlay, so a swipe over a window with nothing to scroll does not
 * scroll the site behind it. The lock itself is CSS on `html[data-scroll-locked]`. DESIGN §9
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    holders += 1;
    root.setAttribute("data-scroll-locked", "");
    return () => {
      holders -= 1;
      if (holders === 0) root.removeAttribute("data-scroll-locked");
    };
  }, [active]);
}
