"use client";

import { useEffect, useState } from "react";
import { faviconFrameAt, resolveFavicon } from "@/lib/favicon";

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
 * Spins the Earth in the tab icon; renders nothing. Frames come as a sprite sheet sliced on a
 * canvas into data-URLs, which is the only way to animate a tab icon in Chrome and Safari — they
 * refuse animated GIFs there. It degrades silently to the static planet. DESIGN §10.3
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
    const canvas = document.createElement("canvas");
    canvas.width = sprite.cell;
    canvas.height = sprite.cell;
    const ctx = canvas.getContext("2d");
    if (!ctx) return; // an ancient browser — the static icon is there anyway

    let cancelled = false;
    let timer = 0;

    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      // The sheet is sliced once: after that the animation is only a change of string in href, with
      // no canvas per frame (the tab icon redraws ten times a second).
      const frames: string[] = [];
      for (let i = 0; i < sprite.frames; i += 1) {
        ctx.clearRect(0, 0, sprite.cell, sprite.cell);
        ctx.drawImage(image, i * sprite.cell, 0, sprite.cell, sprite.cell, 0, 0, sprite.cell, sprite.cell);
        frames.push(canvas.toDataURL("image/png"));
      }

      const links = iconLinks();
      const show = (href: string) => links.forEach((link) => (link.href = href));
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
    };
    image.onerror = () => {}; // the sprite did not arrive — stay on the static icon

    image.src = sprite.src;

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [wave]);

  return null;
}
