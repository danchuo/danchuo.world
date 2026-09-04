/**
 * Геометрия «плёнки» — редакции галереи дропа, где кадры едут одной лентой (DESIGN §7.5).
 * Чистые функции: лента живёт в браузере, но её арифметика проверяется без DOM.
 */

/**
 * Кадр, чей центр ближе всего к середине окна ленты. Позиция ленты — единственный источник
 * истины: и крупный кадр, и засечки читают её прокрутку, а не своё состояние.
 *
 * Равное расстояние отдаётся кадру, который в ленте РАНЬШЕ: иначе на границе между двумя
 * соседями индекс дрожал бы туда-сюда на дробном пикселе прокрутки.
 */
export function nearestFrameIndex(centers: number[], mid: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < centers.length; i += 1) {
    const distance = Math.abs(centers[i] - mid);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/**
 * С какого кадра открыть плёнку. Плитка «последний дроп» в редакции кадра показывает ОДИН
 * снимок — открывать галерею с начала значило бы потерять тот кадр, по которому кликнули.
 * Опознаём по адресу картинки, а не по индексу: у плитки и у галереи это один и тот же ответ
 * бэкенда, но полагаться на совпадение порядка незачем — адрес и есть тождество кадра.
 *
 * Кадра нет в дропе (или адрес не передан) ⇒ первый: галерея обязана открыться в любом случае.
 */
export function startFrameIndex(photos: readonly { imageUrl: string }[], startAt?: string | null): number {
  if (!startAt) return 0;
  const found = photos.findIndex((p) => p.imageUrl === startAt);
  return found >= 0 ? found : 0;
}

/**
 * Боковой запас ленты — полокна минус полкадра.
 *
 * Без него КРАЙНИЕ кадры недостижимы: при `scroll-snap-align: center` лента доезжает до конца,
 * а по центру окна встаёт не последний кадр, а тот, что отстоит от края на полокна (на замере
 * прототипа — пятый с конца). Запас даёт первому и последнему кадру место встать по центру,
 * и максимум прокрутки означает ровно «последний кадр».
 */
export function stripPadding(viewportW: number, itemW: number): number {
  return Math.max(0, (viewportW - itemW) / 2);
}

/** Дельта колеса, с которой событие считается МЫШИНЫМ ЩЕЛЧКОМ (браузеры шлют ~100px на щелчок). */
const WHEEL_NOTCH = 50;
/** Сколько накопить мелких трекпадных дельт на один кадр. */
const WHEEL_STEP = 40;
/** Дельта в строках (`deltaMode: 1`, Firefox на мыши) в пикселях. */
const LINE_PX = 16;

/** Решение колеса: на сколько кадров шагнуть и что осталось в накопителе. */
export interface WheelDecision {
  dir: -1 | 0 | 1;
  acc: number;
}

/**
 * Шаг плёнки по одному событию колеса — «не один кадр на всё движение, а кадр на каждый
 * щелчок» (формулировка владельца).
 *
 * Мышь и трекпад разведены по величине события, а не по типу устройства (его браузер не
 * сообщает): щелчок мыши приходит крупной дельтой и стоит ровно один кадр, каким бы длинным он
 * ни был; трекпад сыплет мелкими, и они копятся до порога — иначе одно движение пальцем
 * пролистывало бы полдропа. Ось берём ту, по которой жест сильнее: боковой свайп по трекпаду
 * для ленты естественнее вертикального, и запрещать его незачем.
 *
 * Накопитель сбрасывается при смене направления: «вниз-вниз-вверх» не должно копиться в шаг
 * вниз — жест уже передумал.
 */
export function wheelStep(deltaX: number, deltaY: number, deltaMode: number, acc: number): WheelDecision {
  const k = deltaMode === 1 ? LINE_PX : 1;
  const raw = (Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX) * k;
  if (raw === 0) return { dir: 0, acc };
  if (Math.abs(raw) >= WHEEL_NOTCH) return { dir: Math.sign(raw) as -1 | 1, acc: 0 };
  const next = Math.sign(raw) === Math.sign(acc) || acc === 0 ? acc + raw : 0;
  if (Math.abs(next) >= WHEEL_STEP) return { dir: Math.sign(next) as -1 | 1, acc: 0 };
  return { dir: 0, acc: next };
}

/** Размер и положение ползунка на дорожке (px). */
export interface SliderGeometry {
  width: number;
  offset: number;
}

/**
 * Ползунок над засечками: он говорит две вещи разом — **где** мы в дропе и **сколько** дропа
 * видно в ленте. Поэтому ширина пропорциональна видимой доле, как у полосы прокрутки: на
 * 37 кадрах видно ~4, и короткий ползунок честно показывает, что впереди ещё много.
 *
 * [minThumb] — пол ширины: за ползунок надо уметь схватиться мышью, а пропорция на длинном
 * дропе даёт нитку в пару пикселей.
 */
export function sliderGeometry(
  scrollLeft: number,
  clientW: number,
  scrollW: number,
  trackW: number,
  minThumb: number,
): SliderGeometry {
  if (scrollW <= clientW || trackW <= 0) return { width: trackW, offset: 0 };
  const width = Math.max(minThumb, Math.min(trackW, (clientW / scrollW) * trackW));
  const progress = scrollLeft / (scrollW - clientW);
  const offset = Math.max(0, Math.min(trackW - width, progress * (trackW - width)));
  return { width, offset };
}

/**
 * Куда прокрутить ленту, когда по дорожке ткнули или потащили ползунок. Точка считается
 * ЦЕНТРОМ ползунка (палец держит середину, а не левый край), поэтому у краёв дорожки ход
 * ограничен половиной его ширины — и клик по самому краю всё равно доводит ленту до конца.
 */
export function scrollFromPointer(
  pointerX: number,
  trackW: number,
  thumbW: number,
  clientW: number,
  scrollW: number,
): number {
  const span = trackW - thumbW;
  const maxScroll = Math.max(0, scrollW - clientW);
  if (span <= 0 || maxScroll === 0) return 0;
  const offset = Math.max(0, Math.min(span, pointerX - thumbW / 2));
  return (offset / span) * maxScroll;
}
