"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { mountArtifact, type ArtifactHandle } from "@/lib/artifact3dStage";

/**
 * **3D-артефакт — универсальный элемент борда** (DESIGN §12.5). Ставится в любой слот и
 * ведёт себя везде одинаково: в покое — статичная картинка (первый кадр модели), под
 * курсором — предмет оживает (вращение + встроенная анимация glTF, если она есть).
 *
 * ⚠️ «Артефакт» здесь — 3D-предмет волны, не запись слайса `artifacts` (витрина вещей,
 * `ArtifactMarquee`). Слова совпали, домены разные.
 *
 * Три правила, из-за которых он безопасен в любом количестве:
 * - **Грузится, только когда виден.** Пока слот за пределами экрана (или спрятан волной —
 *   `display: none` в наблюдатель не попадает), ни `three`, ни модель не скачиваются вовсе.
 * - **Контекст WebGL общий** на все артефакты — см. `artifact3dStage.ts`.
 * - **Сорвался — молчит.** Нет WebGL, не доехал файл, отказал 2D-контекст: слот остаётся
 *   пустым, вместо битой картинки. Артефакт — украшение строки, а не её содержание.
 *
 * Движение только по наведению и фокусу: `prefers-reduced-motion` держит предмет
 * неподвижным всегда, а на тач-устройствах (наведения нет) он просто стоит картинкой.
 */
export interface Artifact3DProps {
  /** Адрес модели (`.glb`/`.gltf`). */
  src: string;
  /**
   * Подпись для читалки. Не задана ⇒ предмет декоративный (`aria-hidden`) — так он стоит в
   * строке проекта, где рядом уже есть название с тем же адресом.
   */
  label?: string;
  className?: string;
  style?: CSSProperties;
  /** Оборотов в минуту под курсором. */
  rpm?: number;
  /** Поле вокруг предмета: 1 — впритык к краю слота. */
  padding?: number;
}

/** Плотность пикселей канваса: выше двойной не даёт видимой разницы, а стоит вчетверо. */
const MAX_DPR = 2;

export function Artifact3D({ src, label, className, style, rpm, padding }: Artifact3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<ArtifactHandle | null>(null);
  const [failed, setFailed] = useState(false);

  // Монтаж: ждём, пока слот покажется на экране, и только тогда тянем библиотеку и модель.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const abort = new AbortController();
    let disposed = false;

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const box = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(box.width * dpr));
      const h = Math.max(1, Math.round(box.height * dpr));
      if (canvas.width === w && canvas.height === h) return false;
      canvas.width = w;
      canvas.height = h;
      return true;
    };

    const start = () => {
      fit();
      mountArtifact(canvas, { src, rpm, padding, signal: abort.signal })
        .then((handle) => {
          if (disposed) {
            handle.dispose();
            return;
          }
          handleRef.current = handle;
        })
        .catch(() => {
          if (!disposed) setFailed(true);
        });
    };

    // Без наблюдателя (старый браузер, jsdom в тестах) грузим сразу: лучше лишний запрос,
    // чем пустой слот.
    if (typeof IntersectionObserver === "undefined") {
      start();
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect();
            start();
          }
        },
        { rootMargin: "200px" },
      );
      io.observe(canvas);
      abort.signal.addEventListener("abort", () => io.disconnect());
    }

    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (fit()) handleRef.current?.resize();
          });
    ro?.observe(canvas);

    return () => {
      disposed = true;
      abort.abort();
      ro?.disconnect();
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [src, rpm, padding]);

  const spin = (on: boolean) => {
    if (on && prefersReducedMotion()) return;
    handleRef.current?.setSpinning(on);
  };

  if (failed) return null;

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={style}
      // Курсор и фокус — единственные органы управления: борд не двигается сам по себе.
      onPointerEnter={() => spin(true)}
      onPointerLeave={() => spin(false)}
      onFocus={() => spin(true)}
      onBlur={() => spin(false)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

/**
 * Читаем настройку в момент наведения, а не на монтаже: посетитель включает её на ходу, и
 * борд обязан замереть сразу, не дожидаясь перезагрузки.
 */
function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
