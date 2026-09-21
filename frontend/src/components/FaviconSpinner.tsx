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
 * Spins the Earth in the tab icon; renders nothing. A turn is a swap of the icon's href over
 * ready-cut frame files — the only way to animate a tab icon in Chrome and Safari, which refuse
 * an animated GIF there. It degrades silently to the static planet. DESIGN §10.3
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

    const links = iconLinks();
    const show = (href: string) => links.forEach((link) => (link.href = href));

    /* The turn starts only once every frame is in the cache: an href pointing at a file still on
       its way leaves the tab blank, and at ten frames a second that reads as a flickering icon. */
    const warm = frames.map(
      (src) =>
        new Promise<boolean>((done) => {
          const image = new Image();
          image.onload = () => done(true);
          image.onerror = () => done(false); // a missing frame must not hold the whole turn back
          image.src = src;
        }),
    );

    void Promise.all(warm).then((ok) => {
      if (cancelled) return;
      // The frames never arrived: the static planet in `<head>` is a complete answer, and pointing
      // the tab at a file that 404s would replace it with a blank square. DESIGN §10.3
      if (!ok[0]) return;
      show(frames[0]);
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
        show(frames[frame]);
      }, sprite.frameMs);
    });

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [wave]);

  return null;
}
