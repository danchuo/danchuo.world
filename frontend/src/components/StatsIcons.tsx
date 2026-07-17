/**
 * Иконки метрик статов (§7.4) — пиксельные PNG, **извлечённые из макета владельца** (crop →
 * border-flood-fill/recolor → trim, DESIGN §12.4; Recraft на минимальном стиле переусложнял).
 * Кроссовок «шаги» запечён на белый фон плитки (светлая заливка ≈ поверхность), месяцы —
 * прозрачные. Фикс-цвет (не токен): свой набор волны 01. Замена ассета → бампнуть [V] (кэш).
 */

const BASE = "/assets/waves/wave-01/stats";
const V = "1";

/** Пиксельная иконка из PNG: высота в px, ширина по натуральному соотношению, crisp. */
function PixelImg({ src, height, aspect }: { src: string; height: number; aspect: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        height,
        width: Math.round(height * aspect),
        backgroundImage: `url(${src}?v=${V})`,
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        imageRendering: "pixelated",
      }}
    />
  );
}

/** Кроссовок сбоку — «шаги». */
export function StepsIcon({ height = 16 }: { height?: number }) {
  return <PixelImg src={`${BASE}/sneaker.png`} height={height} aspect={336 / 312} />;
}

/** Тёмный месяц — «сон» (метка статов). */
export function SleepIcon({ height = 15 }: { height?: number }) {
  return <PixelImg src={`${BASE}/moon.png`} height={height} aspect={1} />;
}

/** Оранжевый месяц с «Zz» — крупная иконка виджета «сон» (§7.7). */
export function SleepBigIcon({ height = 28 }: { height?: number }) {
  return <PixelImg src={`${BASE}/moon-zzz.png`} height={height} aspect={728 / 632} />;
}

/** Пиксельная кровать — пустое состояние «сон» («нет данных о сне», §7.7). */
export function BedIcon({ height = 60 }: { height?: number }) {
  return <PixelImg src={`${BASE}/bed.png`} height={height} aspect={621 / 441} />;
}
