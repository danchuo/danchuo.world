"use client";

import { useEffect, useState } from "react";
import { faviconFrameAt, resolveFavicon } from "@/lib/favicon";

/** Все иконки вкладки в `<head>`; если статической нет — заводим свою. */
function iconLinks(): HTMLLinkElement[] {
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
  if (links.length > 0) return links;
  const link = document.createElement("link");
  link.rel = "icon";
  document.head.appendChild(link);
  return [link];
}

/**
 * Крутит Землю в иконке вкладки (DESIGN §10.3). Ничего не рендерит.
 *
 * Кадры лежат спрайт-лентой (см. `lib/favicon.ts`): один запрос, дальше нарезка канвасом в
 * data-URL и смена `href` у `<link rel="icon">` — единственный способ анимировать вкладку в
 * Chrome/Safari, они анимированный GIF в фавиконе не крутят.
 *
 * Волну берём с `<html data-wave>`: её ставит SSR-layout, а переключатель волн меняет вживую —
 * MutationObserver ловит своп и перезаряжает спрайт, не трогая WaveProvider (иконка вкладки
 * не про раскладку борда, поэтому в контекст не лезем).
 *
 * Деградирует молча и всегда в пользу статики: нет канваса, не доехал спрайт,
 * `prefers-reduced-motion` — на вкладке остаётся неподвижная планета (`app/icon.png`).
 */
export function FaviconSpinner() {
  const [wave, setWave] = useState<string | null>(() =>
    typeof document === "undefined" ? null : document.documentElement.getAttribute("data-wave"),
  );

  useEffect(() => {
    const read = () => setWave(document.documentElement.getAttribute("data-wave"));
    read(); // волну мог поставить переключатель до того, как эффект успел подписаться
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
    if (!ctx) return; // древний браузер — статическая иконка и так на месте

    let cancelled = false;
    let timer = 0;

    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      // Нарезаем ленту один раз: дальше анимация — это только смена строки в href,
      // без канваса на каждый кадр (иконка вкладки перерисовывается 10 раз в секунду).
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
        // Фоновая вкладка: иконку всё равно никто не смотрит, а браузер душит таймер —
        // держим кадр и не жжём CPU. Кадр считается от времени, поэтому после возврата
        // планета оказывается там, где была бы, если б крутилась всё это время.
        if (document.hidden) return;
        const frame = faviconFrameAt(Date.now() - startedAt, sprite);
        if (frame === shown) return;
        shown = frame;
        show(frames[frame]);
      }, sprite.frameMs);
    };
    image.onerror = () => {}; // спрайт не доехал — остаёмся на статической иконке

    image.src = sprite.src;

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [wave]);

  return null;
}
