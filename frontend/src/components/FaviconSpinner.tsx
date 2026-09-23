"use client";

import { useEffect, useState } from "react";
import { faviconFrameAt, faviconFrameSrc, resolveFavicon } from "@/lib/favicon";

/** Every tab icon in `<head>`; if there is no static one, we add our own. */
function iconLinks(): HTMLLinkElement[] {
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
  if (links.length > 0) return links;
  const link = document.createElement("link");
  link.rel = "icon";
  document.head.appendChild(link);
  return [link];
}

/**
 * Frame file → object URL, kept for the page's lifetime. A network href is revalidated on EVERY
 * swap — ten requests a second per tab, enough for the edge to 429 the whole site. DESIGN §10.3
 */
const frameUrls = new Map<string, string>();

function loadFrame(src: string): Promise<string | null> {
  const known = frameUrls.get(src);
  if (known) return Promise.resolve(known);
  return fetch(src)
    .then((res) => (res.ok ? res.blob() : null))
    .then((blob) => {
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      frameUrls.set(src, url);
      return url;
    })
    .catch(() => null); // a missing frame must not hold the whole turn back
}

/**
 * Spins the Earth in the tab icon; renders nothing. A turn is a swap of the icon's href over
 * ready-cut frames held as object URLs — the only way to animate a tab icon in Chrome and Safari,
 * which refuse an animated GIF there. It degrades silently to the static planet. DESIGN §10.3
 */
export function FaviconSpinner() {
  const [wave, setWave] = useState<string | null>(() =>
    typeof document === "undefined" ? null : document.documentElement.getAttribute("data-wave"),
  );

  useEffect(() => {
    const read = () => setWave(document.documentElement.getAttribute("data-wave"));
    read(); // the switcher may have set the wave before the effect subscribed
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-wave"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sprite = resolveFavicon(wave);
    const frames = Array.from({ length: sprite.frames }, (_, i) => faviconFrameSrc(sprite, i));

    let cancelled = false;
    let timer = 0;

    // Links are looked up per frame: Next streams its own `/icon` link in later, and one left on
    // the network is refetched by Chrome on every swap. DESIGN §10.3
    const show = (href: string) => iconLinks().forEach((link) => (link.href = href));

    /* The turn starts only once every frame is in memory: an href pointing at a file still on
       its way leaves the tab blank, and at ten frames a second that reads as a flickering icon. */
    void Promise.all(frames.map(loadFrame)).then((urls) => {
      if (cancelled) return;
      // The frames never arrived: the static planet in `<head>` is a complete answer, and pointing
      // the tab at a file that 404s would replace it with a blank square. DESIGN §10.3
      const first = urls[0];
      if (!first) return;
      const ready = urls.map((url) => url ?? first);
      show(first);
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

      const startedAt = Date.now();
      let shown = 0;
      timer = window.setInterval(() => {
        // A background tab: nobody is looking anyway and the browser throttles the timer, so we
        // hold the frame and burn no CPU. The frame is derived from time, so on return the planet
        // is where it would have been had it kept spinning.
        if (document.hidden) return;
        const frame = faviconFrameAt(Date.now() - startedAt, sprite);
        if (frame === shown) return;
        shown = frame;
        show(ready[frame]);
      }, sprite.frameMs);
    });

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [wave]);

  return null;
}
