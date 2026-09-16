"use client";

import { useEffect, useRef } from "react";

/** The mark on our history entry: the layer's number from the page (the first overlay is 1). */
const DEPTH_KEY = "danchuoOverlay";

const depthOf = (state: unknown): number => {
  const value = (state as Record<string, unknown> | null)?.[DEPTH_KEY];
  return typeof value === "number" ? value : 0;
};

/**
 * The system Back button closes an overlay instead of leaving the site. An opening window pushes a
 * history entry and `popstate` turns its removal into a close. LAYERS COUNT BY DEPTH, not a flag:
 * a layer closes only if we came back BELOW it, or one Back would collapse them all. DESIGN §9
 */
export function useBackToClose(open: boolean, onClose: () => void) {
  // The handler is read from a ref: callers usually pass an inline arrow, and without the ref the
  // effect would resubscribe on every render — removing and re-adding the history entry.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const depth = depthOf(window.history.state) + 1;
    // Our field is added TO the existing state: the router keeps its own housekeeping there and
    // recognises its entries by it, so overwriting is not allowed.
    window.history.pushState({ ...(window.history.state as object | null), [DEPTH_KEY]: depth }, "");

    let popped = false;
    const onPop = (e: PopStateEvent) => {
      if (depthOf(e.state) >= depth) return; // we came back no deeper than us — nothing to close
      popped = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!popped) window.history.back();
    };
  }, [open]);
}
