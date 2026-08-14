"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type {
  DisciplineItemView,
  PodcastEpisodeView,
  ReadingBookView,
  TrackView,
} from "@/lib/api/types";
import { MONSTER_LENS_KEY, sameLens, type DisciplineLens } from "@/lib/disciplineLens";
import { monsterVerdict, type MonsterTone } from "@/lib/monster";
import { Cover, Marquee, NowPlayingCard } from "./NowPlayingCard";
import { cardTimeLines, episodeForStop } from "@/lib/podcastCard";
import { bookForStop, progressLabel } from "@/lib/readingCard";

/**
 * Карта-тропа дисциплины (PRD §5.6; DESIGN §4.1): чеклист дня как извилистый маршрут
 * «утро → ночь» из 7 остановок. Пункты с target=2 (чтение/подкасты) дают ДВЕ остановки
 * в разных местах дня; «монстр» стоит РЯДОМ с маршрутом и ни с чем не соединён — он не этап
 * дня, а факт про день, и говорит о себе сам: вердикт словами («не пил» / «пил») в своём
 * цвете под фигурой.
 *
 * Состояния выводятся из счётчиков (времени в модели нет; данные вносятся раз в день, PRD §5.6):
 * - остановка done — count пункта ≥ её порядкового номера (occurrence);
 * - иначе pending (не сделано). «Пропущено» отдельно НЕ выделяем: ввод раз в день = к концу дня
 *   этап либо сделан, либо нет — «ещё не дошёл» смысла не несёт (было три кольца, стало два);
 * - стрелка после остановки: зелёная (done) / нейтральная серая (не сделано);
 * - все 7 сделаны — маршрут подсвечивается целиком (perfect).
 *
 * Геометрия статична (viewBox 400×210, бустрофедон 4+3 + детур) и живёт в этом файле:
 * новый пункт дисциплины = новая остановка = осознанный дизайн-проход по маршруту.
 * Вся палитра — токены волны: скин другой волны перекрашивает карту без правок разметки.
 */

interface QuestMapProps {
  items: DisciplineItemView[];
  /** Был ли монстр выпит; `null` — за день записи нет вовсе, и вердикта у нас тоже нет.
   *  Третье состояние обязательно: без него отсутствие записи выдавалось за чистый день
   *  (будущие дни и дырки в записи молча читались как «не пил», DESIGN §4.1).
   *  Карта — единственное место монстра на плитке; арт вкуса (банка, название) — бэклог. */
  monsterDrunk: boolean | null;
  /** Inverse "clean" streak: consecutive days the monster was NOT drunk (§5.6). Shield badge ≥2. */
  monsterCleanStreak?: number;
  /** Active wave key (Board → TodayTile). Waves in [QUEST_SPRITE_WAVES] swap the hand-drawn
   *  pixel glyphs for generated raster sprites (DESIGN §12); other waves and tests (no wave)
   *  keep the currentColor cells and render unchanged. */
  wave?: string | null;
  /** Остановка, через которую сейчас смотрит календарь (§5.3) — приподнята и обведена. */
  lens?: DisciplineLens | null;
  /** Обработчик выбора линзы. Без него остановки НЕ интерактивны — карта рендерится как раньше
   *  (важно для скинов/тестов/будущих мест, где карта показывается только как картинка). */
  onLensChange?: (lens: DisciplineLens | null) => void;
}

/** Waves shipping a generated quest sprite set (/assets/waves/<wave>/quest/*.png, DESIGN §12). */
const QUEST_SPRITE_WAVES = new Set(["wave-01"]);

/** Маршрут дня: пункт + какое по счёту выполнение закрывает эту остановку. */
const ROUTE = [
  { key: "stretch", occurrence: 1, label: "растяжка" },
  { key: "podcasts", occurrence: 1, label: "подкаст" },
  { key: "office", occurrence: 1, label: "офис" },
  { key: "reading", occurrence: 1, label: "чтение" },
  { key: "podcasts", occurrence: 2, label: "подкаст" },
  { key: "reading", occurrence: 2, label: "чтение" },
  { key: "journal", occurrence: 1, label: "дневник" },
] as const;

/** Центры остановок (S1..S7) в координатах viewBox. */
const STOPS_XY: ReadonlyArray<readonly [number, number]> = [
  [45, 45],
  [140, 45],
  [235, 45],
  [330, 45],
  [300, 160],
  [190, 160],
  [75, 160],
];

/** Сегменты тропы между остановками + позиция/поворот стрелки-шеврона на середине. */
// Стрелки сидят на ТОЧНОЙ середине сегмента (t=0.5 квадратичной Безье), угол — по касательной
// (P2−P0). Раньше ax/ay/deg были прикинуты на глаз и съезжали с кривой (заметнее в нижнем ряду).
const SEGMENTS = [
  { d: "M60 45 Q92 37 125 45", ax: 92, ay: 41, deg: 0 },
  { d: "M155 45 Q187 53 220 45", ax: 187, ay: 49, deg: 0 },
  { d: "M250 45 Q282 37 315 45", ax: 282, ay: 41, deg: 0 },
  { d: "M344 53 Q382 78 372 115 Q364 143 318 154", ax: 372, ay: 115, deg: 105 },
  { d: "M285 160 Q245 168 205 160", ax: 245, ay: 164, deg: 180 },
  { d: "M175 160 Q132 152 90 160", ax: 132, ay: 156, deg: 180 },
] as const;

/** Линза монстра: на маршруте он одна остановка-тупик, поэтому occurrence всегда 1.
 *  Полярность отметки в календаре обратная (подсвечиваются ЧИСТЫЕ дни) — см. `lensMatch`. */
const MONSTER_LENS: DisciplineLens = { key: MONSTER_LENS_KEY, occurrence: 1, label: "монстр" };

/** Формулировка «чисто» — подпись огонька-стрика монстра (он считает дни БЕЗ него всегда). */
const CLEAN_PHRASE = monsterVerdict(false).phrase;

/**
 * Класс фигуры монстра по тону вердикта. «Нет данных» намеренно берёт `--pending` — тот же
 * серый пунктир, что у любой незакрытой остановки маршрута (решение владельца): день, за
 * который ничего не приходило, обязан выглядеть НЕзаполненным, а не чистым. Своего вида у
 * этого состояния нет и не нужно — «как все остальные картинки» здесь и есть ответ.
 */
const MONSTER_STOP_CLASS: Record<MonsterTone, string> = {
  clean: "quest-stop--clean",
  drunk: "quest-stop--drunk",
  unknown: "quest-stop--pending",
};

/** Монстр стоит ОТДЕЛЬНО от маршрута — в пустой полосе между рядами тропы, без связи с ней
 *  (сегмент-детур от «офиса» снят, см. рендер). */
const MONSTER_XY = [172, 110] as const;

/** Значок стрика показываем от 2: серия в 1 день (или 0) на карте — шум, не достижение. */
const STREAK_MIN = 2;
/** Огонёк стрика — компактный вектор ~12px. Один и тот же и у пунктов, и у монстра (DESIGN §4.1). */
const FLAME_D = "M0 -6 C3 -2 3 0 2 2 C1 4 -1 4 -2 2 C-3 0 -2 -2 -1 -3 C-1 -1 1 -2 0 -6 Z";

// Камни-декор вдоль тропы (только волны со спрайт-набором) — «оживляж» пустот, как в референсе.
// Позиции — в пустых участках viewBox, подальше от остановок/подписей; лёгкий разнобой размера.
const ROCKS: ReadonlyArray<{ x: number; y: number; s: number }> = [
  { x: 60, y: 118, s: 13 },
  { x: 258, y: 104, s: 9 },
  { x: 360, y: 104, s: 12 },
  { x: 356, y: 168, s: 10 },
  { x: 128, y: 194, s: 11 },
  { x: 22, y: 66, s: 8 },
];

type Cell = readonly [number, number];

function rect(x1: number, x2: number, y1: number, y2: number, skip: Cell[] = []): Cell[] {
  const out: Cell[] = [];
  for (let y = y1; y <= y2; y++)
    for (let x = x1; x <= x2; x++)
      if (!skip.some(([sx, sy]) => sx === x && sy === y)) out.push([x, y]);
  return out;
}

/** Пиксель-иконки остановок: клетки сетки 8×8, рендерятся rect-ами (DESIGN §2.4 — декор). */
const ICONS: Record<string, Cell[]> = {
  stretch: [
    [3, 0], [4, 0], [1, 1], [6, 1], [2, 2], [3, 2], [4, 2], [5, 2],
    [3, 3], [4, 3], [3, 4], [4, 4], [2, 5], [5, 5], [2, 6], [5, 6],
  ],
  podcasts: [
    [3, 0], [4, 0], [2, 1], [5, 1], [1, 2], [6, 2], [1, 3], [6, 3],
    [0, 4], [1, 4], [6, 4], [7, 4], [0, 5], [1, 5], [6, 5], [7, 5],
  ],
  office: rect(1, 6, 1, 6, [[2, 2], [5, 2], [2, 4], [5, 4], [3, 6], [4, 6]]),
  reading: [
    [3, 1], [4, 1],
    ...rect(1, 6, 2, 2), ...rect(0, 7, 3, 4),
    [0, 5], [1, 5], [6, 5], [7, 5],
  ],
  journal: [...rect(1, 5, 1, 6, [[2, 3], [3, 3], [4, 3]]), [6, 2], [7, 1]],
  monster: [[3, 0], [4, 0], ...rect(2, 5, 1, 7, [[3, 3], [4, 4], [3, 5]])],
  flag: [...rect(0, 0, 0, 6), ...rect(1, 3, 0, 1), [1, 2], [2, 2]],
  sun: [
    ...rect(2, 5, 2, 5),
    [3, 0], [4, 0], [0, 3], [0, 4], [7, 3], [7, 4], [3, 7], [4, 7],
    [1, 1], [6, 1], [1, 6], [6, 6],
  ],
  moon: [
    [3, 0], [4, 0], [5, 0], [2, 1], [3, 1], [1, 2], [2, 2], [1, 3], [2, 3],
    [1, 4], [2, 4], [2, 5], [3, 5], [3, 6], [4, 6], [5, 6],
  ],
  star: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]], // сетка 3×3
};

/** Облако-подставка остановки (декор скина волны 02): тело + нижняя грань-тень, сетка 14×6. */
const CLOUD_BODY: Cell[] = [
  ...rect(5, 8, 0, 0), ...rect(3, 10, 1, 1), ...rect(2, 11, 2, 2),
  ...rect(1, 12, 3, 3), ...rect(1, 12, 4, 4),
];
const CLOUD_SHADE: Cell[] = rect(2, 11, 5, 5);

function PixelIcon({
  cells, cell, cx, cy, gridW = 8, gridH = 8,
}: { cells: Cell[]; cell: number; cx: number; cy: number; gridW?: number; gridH?: number }) {
  // сетка gridW×gridH центрируется вокруг (cx, cy)
  const offX = (gridW / 2) * cell;
  const offY = (gridH / 2) * cell;
  return (
    <g aria-hidden>
      {cells.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={cx - offX + x * cell}
          y={cy - offY + y * cell}
          width={cell}
          height={cell}
          fill="currentColor"
        />
      ))}
    </g>
  );
}

/** Декор-слои, включаемые скином волны (по умолчанию скрыты CSS-ом, см. common.css). */
function Cloud({ cx, cy, cell }: { cx: number; cy: number; cell: number }) {
  return (
    <g className="quest-cloud" aria-hidden>
      <g className="quest-cloud__body">
        <PixelIcon cells={CLOUD_BODY} cell={cell} cx={cx} cy={cy} gridW={14} gridH={6} />
      </g>
      <g className="quest-cloud__shade">
        <PixelIcon cells={CLOUD_SHADE} cell={cell} cx={cx} cy={cy} gridW={14} gridH={6} />
      </g>
    </g>
  );
}

/** Стрелка-шеврон на сегменте (маркеры с context-stroke не везде живы — рисуем сами).
 *  В sprite-режиме — жирный ЗАЛИТЫЙ наконечник (под пиксельный стиль набора), иначе тонкий
 *  штриховой `>`. Вектор ⇒ чисто вращается на любой угол сегмента. */
function Chevron({ ax, ay, deg, sprite }: { ax: number; ay: number; deg: number; sprite?: boolean }) {
  const tf = `translate(${ax} ${ay}) rotate(${deg})`;
  return sprite ? (
    <path className="quest-chevron quest-chevron--bold" d="M-4 -5 L5 0 L-4 5 L-1 0 Z" transform={tf} />
  ) : (
    <path className="quest-chevron" d="M-4 -3.5 L3 0 L-4 3.5" transform={tf} />
  );
}

/** Растровый спрайт остановки (волна со своим набором): сгенерированная пиксель-иконка,
 *  центрированная в (cx,cy). Спрайт ПОСТОЯНЕН — состояние (done/missed/pending) несут кольцо
 *  и стрелки, а не сама иконка (DESIGN §12.1). preserveAspectRatio хранит пропорции спрайта. */
function Sprite({
  wave, name, cx, cy, size,
}: { wave: string; name: string; cx: number; cy: number; size: number }) {
  return (
    <image
      href={`/assets/waves/${wave}/quest/${name}.png`}
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}

/** Русская форма слова «день» для числа (1 день / 2 дня / 5 дней; 11–14 — «дней»). */
function pluralDays(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return "дней";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дней";
}

/**
 * Значок стрика над остановкой (§5.6): огонёк = сколько дней подряд пункт ВЫПОЛНЯЕТСЯ; у монстра —
 * тот же огонёк, но считает дни, когда монстр НЕ пьётся (полярность в [title]). Отсчёт «по вчера»
 * (сегодня не входит, пока не заполнено) — считает бэк. Рисуем только при value ≥ [STREAK_MIN];
 * цвет — токен волны (см. common.css).
 *
 * [title] — пояснение (accessible-имя значка + текст тултипа). Тултип рисуем **сами** мини-плиткой
 * в стиле активной волны (тёплая заливка + глиняный кант — токены), а не системным `<title>`:
 * показывается по ховеру значка (CSS). Ширина подложки считается по длине строки — SVG не умеет
 * авто-размер; и клампится в границы viewBox, чтобы не выпасть за карту у крайних остановок.
 */
function StreakBadge({
  cx, cy, value, testId, title, tone = "fire",
}: {
  cx: number; cy: number; value: number; testId: string; title: string;
  /** Цвет огонька: `fire` — акцент волны (пункты маршрута), `clean` — зелёный «чисто»
   *  (монстр). Огонёк монстра считает ОБРАТНОЕ — дни без него, — и горит тем же цветом,
   *  что вердикт под остановкой, иначе акцент читался бы как «сделал это N дней подряд». */
  tone?: "fire" | "clean";
}) {
  if (value < STREAK_MIN) return null;
  const tipW = title.length * 4.2 + 12;
  const tipH = 14;
  // Горизонтальный сдвиг тултипа, чтобы подложка целиком осталась в пределах viewBox [0,400].
  const half = tipW / 2;
  let tipDX = 0;
  if (cx + half > 396) tipDX = 396 - (cx + half);
  if (cx - half + tipDX < 4) tipDX = 4 - (cx - half);
  return (
    <g
      className={`quest-streak quest-streak--${tone}`}
      transform={`translate(${cx} ${cy})`}
      data-testid={testId}
      role="img"
      aria-label={title}
    >
      {/* невидимая площадка расширяет зону наведения (иконки мелкие) */}
      <rect className="quest-streak__hit" x={-6} y={-8} width={20} height={16} fill="transparent" />
      <path className="quest-streak__glyph" d={FLAME_D} aria-hidden />
      <text className="quest-streak__num" x={6} y={0} aria-hidden>
        {value}
      </text>
      {/* Тултип-мини-плитка волны (появляется по ховеру, см. common.css) */}
      <g className="quest-tip" transform={`translate(${tipDX} -9)`} aria-hidden>
        <rect className="quest-tip__box" x={-half} y={-tipH} width={tipW} height={tipH} rx={1.5} />
        <text className="quest-tip__text" x={0} y={-tipH / 2 - 0.5}>
          {title}
        </text>
      </g>
    </g>
  );
}

/** Ключ пункта, у остановок которого всплывают карточки прослушанного (§5.6). */
const PODCAST_KEY = "podcasts";

// Геометрия карточки в единицах viewBox (400×210), как и вся остальная карта.
const CARD_W = 214;
const CARD_H = 54;
/**
 * Высота карточки, у которой две строки времени (заход + итог эпизода за день): ровно на строку
 * `--fs-music-meta` с её отступом больше. Фиксировать высоту приходится потому, что карточка
 * живёт в `foreignObject` — SVG отводит окно заранее и по содержимому не растёт, а лишнее
 * подрезает (`overflow: hidden` на боксе).
 */
const CARD_H_SPLIT = 68;
const CARD_COVER = 40;
/** Насколько край карточки заходит под площадку нажатия (r=22) — чтобы ховер не срывался. */
const CARD_LIFT = 20;
/** Запас до края viewBox: ближе — считаем, что карточка не помещается. */
const VIEWBOX_MARGIN = 2;
/** Зазор между карточкой и превью, над которым она встаёт. */
const CARD_GAP = 3;

/** Сторона превью обложки эпизода (единицы viewBox): ~26 CSS-пикселей на мобильной ширине. */
const PREVIEW_SIZE = 30;
/** Насколько близко к ЦЕНТРУ диска (r=17) подходит нижний-правый угол превью: чем меньше,
 *  тем глубже картинка уходит под иконку остановки. 6 — угол скрыт больше чем наполовину
 *  радиуса, картинка явно лежит ПОД остановкой, а не рядом с ней. */
const PREVIEW_TUCK = 6;

/**
 * Отсрочка закрытия карточки. Указатель, переезжающий с превью на карточку, сперва покидает
 * одно (pointerleave) и лишь потом входит в другое (mouseenter) — а между ними бывает и голый
 * зазор карты. Без паузы карточка гасла бы на полпути к своим ссылкам.
 */
const CLOSE_DELAY_MS = 140;

/** Левый-верхний угол превью у остановки в (cx, cy). */
function previewXY(cx: number, cy: number): [number, number] {
  return [cx - PREVIEW_TUCK - PREVIEW_SIZE, cy - PREVIEW_TUCK - PREVIEW_SIZE];
}

/** Ключ пункта чтения: его остановки несут обложки книг (§5.16). */
const READING_KEY = "reading";

/**
 * Превью книги портретное: обложка книги — не квадрат подкаста, и приводить её к квадрату
 * значило бы либо смять корешок, либо срезать половину названия.
 */
const BOOK_PREVIEW_W = 22;
const BOOK_PREVIEW_H = 33;

/** Обложка внутри карточки книги — та же пропорция, крупнее. */
const BOOK_CARD_COVER_W = 30;
const BOOK_CARD_COVER_H = 45;
/**
 * Высота карточки книги. Строк у неё **три** (название, автор, проценты); часов у чтения нет
 * (см. `readingCard.ts`), и высоту теперь держит не текст, а обложка: 45 + поля 6×2 = 57.
 *
 * ⚠️ Число обязано покрывать содержимое целиком: карточка живёт в `foreignObject`, а он отводит
 * окно ЗАРАНЕЕ и по содержимому не растёт — не хватило, и `overflow: hidden` молча срежет нижнюю
 * строку (ловилось владельцем: пропадало время захода). Считать надо и рамку: окно отводится
 * снаружи, а `overflow` режет ВНУТРИ неё, поэтому 57 содержимого просят 59 окна. Замер на борде
 * (`scrollHeight` против `clientHeight`): при 58 карточка переполнялась ровно на пиксель.
 */
const BOOK_CARD_H = 60;

/**
 * Левый-верхний угол превью обложки книги. Стороны у двух остановок РАЗНЫЕ (решение владельца):
 * у верхней книга выглядывает слева, у нижней — справа. Дело не в симметрии ради симметрии:
 * остановки чтения стоят в разных рядах тропы, и две картинки с одной стороны читались бы как
 * одна колонка, оторванная от своих кружков.
 */
function bookPreviewXY(cx: number, cy: number, side: "left" | "right"): [number, number] {
  const x = side === "left" ? cx - PREVIEW_TUCK - BOOK_PREVIEW_W : cx + PREVIEW_TUCK;
  return [x, cy - PREVIEW_TUCK - BOOK_PREVIEW_H];
}

/** Сторона превью по номеру остановки: первая — слева, вторая и дальше — справа. */
const bookSide = (occurrence: number): "left" | "right" => (occurrence === 1 ? "left" : "right");

/** Поля и зазор карточки книги — те же, что в её CSS; ширина считается по ним. */
const BOOK_CARD_PAD = 6;
const BOOK_CARD_GAP = 6;
/** Запас к оценке ширины: дешевле пары лишних единиц, чем строка, ушедшая в многоточие. */
const BOOK_CARD_SLACK = 4;
/** Уже этого карточка не жмётся: у совсем короткого названия она перестала бы читаться карточкой. */
const BOOK_CARD_MIN_W = 104;

/**
 * Ширина карточки книги — **по содержимому**, а не фиксированная.
 *
 * У подкаста карточка одной ширины на всё, и это оправдано: название эпизода почти всегда
 * длинное. У книги наоборот — «Дюна» оставляла бы две трети карточки пустыми (замечено
 * владельцем), а полоса пустоты справа читается как недогрузившийся виджет.
 *
 * Ширина строк **оценивается**, а не измеряется: карточка живёт в `foreignObject`, который
 * отводит окно ЗАРАНЕЕ, — к моменту, когда что-то можно померить, окно уже назначено. Оценка
 * идёт по числу знаков и кеглю; коэффициенты подобраны с запасом (кириллица шире латиницы),
 * а ошибиться она может только в одну сторону: не хватило — название поедет бегущей строкой,
 * ровно как у подкаста. Потолок — та же [CARD_W], чтобы карточки двух пунктов не расходились
 * в разные габариты.
 */
function bookCardWidth(book: ReadingBookView): number {
  // Доля кегля на знак — ЗАМЕРЕНА на борде, а не прикинута: моноширинный шрифт дал
  // 0.60–0.71 em/знак. Берём верх диапазона плюс запас ниже: ошибка в меньшую сторону стоит
  // многоточия, в большую — только лишней пустоты, от которой мы и уходим.
  //
  // Доля одна на все три строки, потому что и гарнитура одна: карточка целиком набрана
  // моноширинным, как карточка подкаста (DESIGN §2.2). Пока название и автор были
  // пропорциональными, тут стояла вторая доля (0.65) — вернётся она только вместе с
  // пропорциональным шрифтом в карточке, не раньше: оценка обязана считать ТУ ЖЕ гарнитуру,
  // какой строка будет набрана, иначе название едет бегущей строкой там, где оно влезает.
  const mono = 0.7;
  const titleW = book.title.length * 11 * mono;
  const authorW = (book.author?.length ?? 0) * 8.5 * mono;
  const progressW = (progressLabel(book)?.length ?? 0) * 8.5 * mono;

  const text = Math.max(titleW, authorW, progressW) + BOOK_CARD_SLACK;
  const total = BOOK_CARD_PAD * 2 + BOOK_CARD_COVER_W + BOOK_CARD_GAP + text;
  return Math.round(Math.min(CARD_W, Math.max(BOOK_CARD_MIN_W, total)));
}

/**
 * Мышиный ли это указатель. Тач и перо честно называют себя в `pointerType`; отсутствие типа
 * (jsdom его не знает — PointerEvent там не реализован) считаем мышью.
 *
 * Разделение обязано быть именно на pointer-событиях: тач-тап досылает следом ЭМУЛИРОВАННЫЕ
 * мышиные события (mouseenter/click), и на них ховер-ветка сработала бы вторым заходом, гася
 * только что открытую тапом карточку.
 */
const isMouse = (e: { pointerType?: string }) => e.pointerType !== "touch" && e.pointerType !== "pen";

/**
 * Кегли карточки в единицах viewBox. Штатные `--fs-music-*` заданы в `cqw` и настроены на
 * плитку в CSS-пикселях; внутри `foreignObject` единица другая, и без переопределения текст
 * приехал бы вместе с двойным масштабом.
 *
 * Подобраны так, чтобы три строки плюс поля выбирали высоту карточки целиком: при мелких кеглях
 * снизу оставалась пустая полоса в треть высоты, и карточка читалась незаполненной. На экране
 * это выходит около 14/12/11 CSS-пикселей — в размер самой плитки «сейчас играет».
 */
const CARD_TYPE_SCALE = {
  "--fs-music-title": "11px",
  "--fs-music-artists": "9px",
  "--fs-music-meta": "8.5px",
} as CSSProperties;

/**
 * Превью обложки эпизода у остановки подкаста (§5.6). Стоит СВЕРХУ-СЛЕВА от диска, и его
 * нижний-правый угол уходит ПОД диск: перекрытие связывает картинку с остановкой (это её
 * эпизод, а не отдельный кадр на карте) и даёт плоской тропе слой глубины. Отсюда же порядок
 * разметки — превью рисуется ДО остановки, иначе в SVG (где нет z-index) угол лёг бы поверх.
 *
 * Оно же — единственная ручка карточки: раскрывает её наведение НА ПРЕВЬЮ, а не на всю
 * остановку. Остановка — переключатель линзы календаря, и пока карточку звала она, любой проход
 * указателя по маршруту вываливал тултип поверх карты.
 *
 * Обложку рисует [Cover] из карточки плеера, а не свой `<image>`: это одна и та же обложка
 * одного и того же эпизода — и `null` (обложки нет) оба должны показывать одинаково. Отсюда
 * `foreignObject`, как и у самой карточки. Рамки у превью НЕТ: кант в единицах viewBox
 * приезжает на экран дробным пикселем и ложится неровно, а держать картинку и без него есть
 * чему — её край и так очерчен диском остановки.
 */
function EpisodePreview({
  cx,
  cy,
  episode,
  occurrence,
  onHover,
  onTap,
}: {
  cx: number;
  cy: number;
  episode: PodcastEpisodeView;
  occurrence: number;
  onHover: () => void;
  onTap: () => void;
}) {
  const [x, y] = previewXY(cx, cy);
  return (
    <g
      className="quest-preview"
      data-testid={`quest-preview-${PODCAST_KEY}-${occurrence}`}
      onPointerEnter={(e) => isMouse(e) && onHover()}
      onPointerDown={(e) => !isMouse(e) && onTap()}
      aria-hidden
    >
      <foreignObject x={x} y={y} width={PREVIEW_SIZE} height={PREVIEW_SIZE}>
        <div className="quest-preview__box">
          <Cover url={episode.imageUrl} alt="" size={PREVIEW_SIZE} />
        </div>
      </foreignObject>
    </g>
  );
}

/**
 * Карточка прослушанного эпизода у остановки подкастов (§5.6): обложка, эпизод и шоу со
 * ссылками, сколько слушали. Тот же язык, что у [StreakBadge] — поверхность и кант волны,
 * всплывает по наведению.
 *
 * Два отличия от `.quest-tip`, и оба вынужденные. Во-первых, карточка ЛОВИТ события: в ней живые
 * ссылки, и указатель должен доехать до них, не погасив её, — поэтому нижний край заходит под
 * площадку нажатия остановки, чтобы между ними не было щели, на которой ховер срывается.
 * Во-вторых, она рендерится СОСЕДОМ кнопки-остановки, а не внутри: ссылка внутри `role="button"`
 * — вложенная интерактивность, которую скринридер разобрать не может.
 *
 * Внутри — ТОТ ЖЕ [NowPlayingCard], что рисует музыкальная плитка, а не похожая на неё вёрстка:
 * вопрос один и тот же («что это было»), и ответ обязан выглядеть одинаково. Отсюда
 * `foreignObject`: карта — SVG, а виджет живёт в HTML, где есть и перенос строк, и бегущая
 * строка, и `text-overflow`. Ручная резка подписей по ширине после этого не нужна.
 * Снизу добавлены строки, которых у плитки нет и быть не может: сколько из скольких минут, а у
 * эпизода, разложенного на несколько заходов, — ещё и когда был ИМЕННО ЭТОТ заход (§5.6).
 */
function PodcastCard({
  cx,
  cy,
  episode,
  open,
  onOpen,
  onClose,
}: {
  cx: number;
  cy: number;
  episode: PodcastEpisodeView;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const half = CARD_W / 2;
  // Сдвиг, чтобы карточка целиком осталась в пределах viewBox [0,400] — как у тултипа стрика.
  let dx = 0;
  if (cx + half > 396) dx = 396 - (cx + half);
  if (cx - half < 4) dx = 4 - (cx - half);

  // Строк времени одна или две (§5.6) — от этого зависит окно foreignObject и точка, от которой
  // карточка встаёт над превью.
  const timeLines = cardTimeLines(episode);
  const height = timeLines.length > 1 ? CARD_H_SPLIT : CARD_H;

  // Над ПРЕВЬЮ (а не просто над остановкой), иначе карточка накрывала бы собственную ручку:
  // превью висит сверху-слева от диска, и «над остановкой» приходилось ровно на него.
  // Не помещается сверху — падает под остановку: у верхнего ряда тропы места сверху нет вовсе,
  // карточка вылезала за viewBox и её срезало краем карты, а следом датой в шапке плитки.
  // Тот же ход, что у подсказки дня жизни (HoverTip), и по той же причине.
  const above = cy - PREVIEW_TUCK - PREVIEW_SIZE - CARD_GAP - height;
  const top = above >= VIEWBOX_MARGIN ? above : cy + CARD_LIFT;

  return (
    <g
      className={`quest-card${open ? " quest-card--open" : ""}`}
      data-testid="quest-card"
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
    >
      <foreignObject x={cx + dx - half} y={top} width={CARD_W} height={height}>
        <div className="quest-card__box" style={CARD_TYPE_SCALE}>
          <NowPlayingCard track={trackOf(episode)} coverSize={CARD_COVER}>
            {timeLines.map((line, i) => (
              // Вторая строка (итог эпизода за день) — фоном к первой: карточка отвечает
              // прежде всего за СВОЙ заход, день идёт справкой.
              <div key={line} className={`quest-card__time${i > 0 ? " quest-card__time--day" : ""}`}>
                {line}
              </div>
            ))}
          </NowPlayingCard>
        </div>
      </foreignObject>
    </g>
  );
}

/**
 * Превью обложки книги, выглядывающее из-под остановки чтения (§5.16) — тот же приём, что у
 * подкастов, и по той же причине: остановка отвечает «что именно ты читал», не дожидаясь ховера.
 *
 * Отличий от подкастового два, и оба от предмета. Пропорция портретная (обложка книги — не
 * конверт), и сторона зависит от номера остановки ([bookPreviewXY]).
 */
function BookPreview({
  cx,
  cy,
  book,
  occurrence,
  onHover,
  onTap,
}: {
  cx: number;
  cy: number;
  book: ReadingBookView;
  occurrence: number;
  onHover: () => void;
  onTap: () => void;
}) {
  const [x, y] = bookPreviewXY(cx, cy, bookSide(occurrence));
  return (
    <g
      className="quest-preview"
      data-testid={`quest-preview-${READING_KEY}-${occurrence}`}
      onPointerEnter={(e) => isMouse(e) && onHover()}
      onPointerDown={(e) => !isMouse(e) && onTap()}
      aria-hidden
    >
      <foreignObject x={x} y={y} width={BOOK_PREVIEW_W} height={BOOK_PREVIEW_H}>
        <div className="quest-preview__box">
          <Cover url={book.coverUrl} alt="" size={BOOK_PREVIEW_W} height={BOOK_PREVIEW_H} />
        </div>
      </foreignObject>
    </g>
  );
}

/**
 * Карточка прочитанного у остановки чтения (§5.16): обложка, книга и автор, пройденный кусок и
 * когда/сколько читали. Тот же язык и та же механика всплытия, что у [PodcastCard].
 *
 * Ссылок внутри нет — книга лежит на полке владельца, вести с неё некуда. Поэтому карточка не
 * обязана ловить указатель ради своих ссылок, но события всё равно слушает: иначе она гасла бы,
 * стоило указателю с превью заехать на неё саму.
 *
 * Строк текста три, и порядок в них по убыванию вопроса: что читал → сколько прошёл → когда и
 * сколько. Пройденный кусок стоит выше времени, потому что именно он отвечает «а был ли толк»;
 * его может не быть вовсе (импортированный день), и тогда строка просто не рисуется.
 */
function BookCard({
  cx,
  cy,
  book,
  occurrence,
  open,
  onOpen,
  onClose,
}: {
  cx: number;
  cy: number;
  book: ReadingBookView;
  occurrence: number;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const width = bookCardWidth(book);
  const half = width / 2;
  let dx = 0;
  if (cx + half > 396) dx = 396 - (cx + half);
  if (cx - half < 4) dx = 4 - (cx - half);

  // Над своим превью, а не над остановкой: иначе карточка накрыла бы собственную ручку.
  const above = cy - PREVIEW_TUCK - BOOK_PREVIEW_H - CARD_GAP - BOOK_CARD_H;
  const top = above >= VIEWBOX_MARGIN ? above : cy + CARD_LIFT;
  const progress = progressLabel(book);

  return (
    <g
      className={`quest-card${open ? " quest-card--open" : ""}`}
      data-testid="quest-card"
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
    >
      <foreignObject x={cx + dx - half} y={top} width={width} height={BOOK_CARD_H}>
        <div className="quest-card__box quest-card__box--book" style={CARD_TYPE_SCALE}>
          <Cover
            url={book.coverUrl}
            alt=""
            size={BOOK_CARD_COVER_W}
            height={BOOK_CARD_COVER_H}
          />
          <div className="quest-book__text">
            {/* Название — единственная строка, которой оценка ширины может не хватить (длинные
                заголовки с подзаголовком). Не влезло — едет бегущей строкой, тем же механизмом,
                что у подкаста, а не обрывается многоточием. */}
            <Marquee>
              <div className="quest-book__title" data-testid={`quest-book-title-${occurrence}`}>
                {book.title}
              </div>
            </Marquee>
            {book.author && <div className="quest-book__author">{book.author}</div>}
            {progress && <div className="quest-book__progress">{progress}</div>}
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

/**
 * Эпизод в форму карточки плеера: «исполнитель» — это шоу со своей ссылкой, обложка эпизода
 * встаёт на место обложки альбома, альбома нет (виджет эту строку просто не рисует). Ровно то
 * же приведение делает бэкенд для плитки «сейчас играет» — здесь оно повторено на готовых
 * данных дня, без похода в Spotify.
 */
function trackOf(episode: PodcastEpisodeView): TrackView {
  return {
    title: episode.episodeName,
    url: episode.episodeUrl,
    artists: [{ name: episode.showName, url: episode.showUrl }],
    album: null,
    albumImageUrl: episode.imageUrl,
    durationMs: null,
  };
}

export function QuestMap({
  items,
  monsterDrunk,
  monsterCleanStreak = 0,
  wave,
  lens = null,
  onLensChange,
}: QuestMapProps) {
  // Волна со своим спрайт-набором ⇒ рисуем растровые иконки; иначе — ручные пиксель-клетки.
  const spriteWave = wave && QUEST_SPRITE_WAVES.has(wave) ? wave : null;
  const interactive = onLensChange != null;
  // Вердикт монстра — один на всю карту: подпись, цвет глагола, класс состояния и озвучка.
  const monster = monsterVerdict(monsterDrunk);

  /**
   * Пропсы остановки-кнопки. Клик по уже выбранной снимает линзу (тоггл) — это единственный
   * способ выключить её прямо на карте; второй (крестик в ярлыке календаря) живёт там, потому
   * что в выходной карты на экране нет вовсе.
   *
   * [ariaName] подменяет подпись остановки в озвучке. Нужен монстру: `aria-label` кнопки
   * ПЕРЕКРЫВАЕТ текст внутри группы, поэтому «пил/не пил» из подписи до скринридера иначе
   * не доходит — он слышит только слово «монстр», ровно ту двусмысленность, что чиним.
   */
  const stopProps = (candidate: DisciplineLens, ariaName: string = candidate.label) => {
    if (!interactive) return {};
    const focused = sameLens(lens, candidate);
    const toggle = () => onLensChange(focused ? null : candidate);
    return {
      role: "button",
      tabIndex: 0,
      "aria-pressed": focused,
      "aria-label": `${ariaName}: показать в календаре`,
      onClick: toggle,
      onKeyDown: (e: KeyboardEvent<SVGGElement>) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault(); // пробел иначе прокручивает страницу
        toggle();
      },
    };
  };
  /**
   * Какая карточка подкаста раскрыта. Через состояние, а не через CSS `:hover` у предка:
   * карточки рисуются ОТДЕЛЬНЫМ слоем в самом конце SVG (см. ниже), то есть живут вне
   * поддерева своей остановки, и descendant-селектор до них не дотягивается.
   */
  const [openCard, setOpenCard] = useState<string | null>(null);
  const closeTimer = useRef<number | null>(null);
  /** Зеркало [openCard] для обработчиков: тап-переключатель и слушатель документа читают
   *  состояние из замыканий, созданных один раз. */
  const openRef = useRef<string | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current === null) return;
    clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const open = useCallback((key: string) => {
    cancelClose();
    openRef.current = key;
    setOpenCard(key);
  }, [cancelClose]);

  const closeNow = useCallback(() => {
    cancelClose();
    openRef.current = null;
    setOpenCard(null);
  }, [cancelClose]);

  /** Закрытие с отсрочкой [CLOSE_DELAY_MS] — см. комментарий у константы. */
  const close = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(closeNow, CLOSE_DELAY_MS);
  }, [cancelClose, closeNow]);

  /** Тач: тап по превью показывает карточку, повторный — прячет (ховера на пальце нет). */
  const toggle = useCallback((key: string) => {
    if (openRef.current === key) closeNow();
    else open(key);
  }, [closeNow, open]);

  /**
   * Тап мимо — закрыть. На тач-устройстве «увести указатель» нечем, и без этого раскрытая
   * карточка осталась бы висеть поверх карты навсегда. Слушаем на фазе перехвата и пропускаем
   * тапы по самой карточке (в ней живые ссылки) и по превью (у него свой переключатель).
   */
  useEffect(() => {
    if (openCard === null) return;
    const onDown = (e: Event) => {
      const target = e.target as Element | null;
      if (typeof target?.closest !== "function") return;
      if (target.closest(".quest-card--open") || target.closest(".quest-preview")) return;
      closeNow();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [openCard, closeNow]);

  useEffect(() => () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
  }, []);

  const byKey = new Map(items.map((i) => [i.key, i]));
  const done = ROUTE.map((s) => (byKey.get(s.key)?.count ?? 0) >= s.occurrence);
  // Карточки собираем заранее — рисуются они последним слоем, отдельно от своих остановок.
  const podcastCards = ROUTE.flatMap((s, i) => {
    if (s.key !== PODCAST_KEY) return [];
    const episode = episodeForStop(byKey.get(s.key)?.episodes, s.occurrence);
    if (!episode) return [];
    const [cx, cy] = STOPS_XY[i];
    return [{ key: `${s.key}-${s.occurrence}`, cx, cy, episode }];
  });
  const readingCards = ROUTE.flatMap((s, i) => {
    if (s.key !== READING_KEY) return [];
    const book = bookForStop(byKey.get(s.key)?.books, s.occurrence);
    if (!book) return [];
    const [cx, cy] = STOPS_XY[i];
    return [{ key: `${s.key}-${s.occurrence}`, cx, cy, book, occurrence: s.occurrence }];
  });

  const doneCount = done.filter(Boolean).length;
  const perfect = doneCount === ROUTE.length;
  // «Пропущено» = не сделано, а день уже ушёл дальше (более поздняя остановка закрыта).
  // Два состояния: сделано (сплошное коралловое кольцо) / не сделано (серый пунктир). «Пропущено»
  // (красный) убрано — при вводе раз в день оно не отличимо от «ещё не дошёл» (см. доккоммент).
  const stopClass = (i: number) =>
    done[i] ? "quest-stop--done" : "quest-stop--pending";
  const segClass = (i: number) =>
    done[i] ? "quest-seg--done" : "quest-seg--pending";

  // Дробь прогресса пункта (для скинов, показывающих счётчики под подписями):
  // target из данных, фолбэк — сколько остановок пункт занимает на маршруте.
  const fracOf = (key: string) => {
    const it = byKey.get(key);
    const target = it?.target ?? ROUTE.filter((r) => r.key === key).length;
    return `${it?.count ?? 0}/${target}`;
  };

  /**
   * Измеренные минуты пункта — занимают ТУ ЖЕ строку под подписью, что и дробь, и вытесняют её
   * (§5.6). Третьей строки нет намеренно: подписи и так ужимаются первыми на мелких плитках,
   * а у бинарного пункта дробь `1/1` не сообщает ничего сверх состояния кольца. Показывается
   * на ВСЕХ волнах — это данные, а не декор скина (дробь скин вправе гасить, минуты нет).
   * Только у первой остановки пункта: измерение принадлежит дню, а не конкретному вхождению.
   */
  const minutesOf = (key: string, occurrence: number) => {
    // Есть карточка ⇒ измерение принадлежит ЭПИЗОДУ, и под остановкой стоят ЕЁ минуты.
    // Иначе подпись спорила бы с тултипом прямо над ней: в карточке «30 из 128 мин»,
    // а под кружком — сумма за сутки «62 мин». Заодно вторая остановка перестаёт молчать.
    const episode = episodeForStop(byKey.get(key)?.episodes, occurrence);
    if (episode) return `${episode.listenedMinutes} мин`;
    // У чтения ровно так же: под кружком стоят минуты СВОЕЙ сессии, а не сумма за сутки.
    const book = bookForStop(byKey.get(key)?.books, occurrence);
    if (book) return `${book.readMinutes} мин`;
    // Дневник (и подкасты, не набравшие ни одной карточки) — измерение дня, только у первой
    // остановки: «6 мин» под незакрытым кружком отвечает «почему не засчиталось».
    if (occurrence !== 1) return null;
    const measured = byKey.get(key)?.measuredMinutes;
    return typeof measured === "number" ? `${measured} мин` : null;
  };

  return (
    <svg
      viewBox="0 0 400 210"
      className={`quest-map${perfect ? " quest-map--perfect" : ""}${spriteWave ? " quest-map--sprites" : ""}`}
      role="img"
      // Монстр назван ВСЕГДА, в т.ч. чистым днём: молчание про чистый день было неотличимо
      // от «данных нет» — то же самое, чем плоха была немая подпись «монстр» на картинке.
      aria-label={`Дисциплина: ${doneCount} из ${ROUTE.length}, ${monster.phrase}`}
      data-testid="quest-map"
    >
      {/* старт/финиш маршрута: растровые спрайты (волна со своим набором) или пиксель-флажки скина */}
      {spriteWave ? (
        <>
          <Sprite wave={spriteWave} name="start" cx={20} cy={26} size={34} />
          <Sprite wave={spriteWave} name="finish" cx={30} cy={140} size={34} />
        </>
      ) : (
        <g className="quest-flag">
          <PixelIcon cells={ICONS.flag} cell={2.2} cx={18} cy={26} />
          <PixelIcon cells={ICONS.flag} cell={2.2} cx={32} cy={142} />
        </g>
      )}

      {/* небо маршрута «утро → ночь»: солнце у старта, луна со звёздами у финиша
          (декор скина волны 02; в базовом скине скрыт) */}
      <g className="quest-sky" aria-hidden>
        <g className="quest-sun">
          <PixelIcon cells={ICONS.sun} cell={2.4} cx={18} cy={22} />
        </g>
        <g className="quest-moon">
          <PixelIcon cells={ICONS.moon} cell={2.4} cx={30} cy={136} />
        </g>
        <g className="quest-star">
          <PixelIcon cells={ICONS.star} cell={2} cx={15} cy={122} gridW={3} gridH={3} />
        </g>
        <g className="quest-star">
          <PixelIcon cells={ICONS.star} cell={1.6} cx={46} cy={152} gridW={3} gridH={3} />
        </g>
      </g>

      {/* камни-декор вдоль тропы (волна со спрайт-набором) */}
      {spriteWave && (
        <g className="quest-rocks" aria-hidden>
          {ROCKS.map((r) => (
            <image
              key={`${r.x}-${r.y}`}
              href={`/assets/waves/${spriteWave}/decor/rock.png`}
              x={r.x - r.s / 2}
              y={r.y - r.s / 2}
              width={r.s}
              height={r.s}
              preserveAspectRatio="xMidYMid meet"
            />
          ))}
        </g>
      )}

      {/* тропа */}
      {SEGMENTS.map((s, i) => (
        <g key={s.d} className={`quest-seg ${segClass(i)}`}>
          <path d={s.d} />
          <Chevron ax={s.ax} ay={s.ay} deg={s.deg} sprite={!!spriteWave} />
        </g>
      ))}
      {/* Тропы к монстру НЕТ — решение владельца. Ответвление-детур со стрелкой описывало его
          как этап дня («свернул туда и сходил»), а покрасить эту тропу было нечем: пройденной
          она хвалила за выпитое, непройденной — ругала за чистый день. Монстр не этап
          маршрута, а факт рядом с ним, поэтому и стоит отдельной фигурой в пустой полосе
          между рядами тропы. */}
      {/* остановки */}
      {ROUTE.map((s, i) => {
        const [cx, cy] = STOPS_XY[i];
        // Стрик именно этой остановки (occurrence): у второго вхождения (count≥2) он ≤ первого.
        const streak = byKey.get(s.key)?.occurrenceStreaks?.[s.occurrence - 1] ?? 0;
        const candidate: DisciplineLens = { key: s.key, occurrence: s.occurrence, label: s.label };
        const focused = sameLens(lens, candidate);
        // Карточка есть только у подкастов и только пока эпизодов хватает на эту остановку.
        const episode = s.key === PODCAST_KEY
          ? episodeForStop(byKey.get(s.key)?.episodes, s.occurrence)
          : null;
        // То же у чтения: карточка есть, пока сессий хватает на эту остановку (§5.16).
        const book = s.key === READING_KEY
          ? bookForStop(byKey.get(s.key)?.books, s.occurrence)
          : null;
        // Ховер-механика общая: слот гасит карточку, превью её раскрывает.
        const hasCard = !!episode || !!book;
        const cardKey = `${s.key}-${s.occurrence}`;
        return (
          <g
            key={cardKey}
            className="quest-slot"
            // Закрытие висит на ВСЁМ слоте, а раскрытие — только на превью: пока указатель
            // ходит внутри остановки (диск, площадка нажатия, подписи), карточка не гаснет,
            // и до её ссылок можно доехать через диск. Клавиатуре превью не досталось (оно
            // aria-hidden — обложку уже несёт сама карточка), поэтому фокус остановки
            // раскрывает карточку сам: иначе с клавиатуры до неё было бы не добраться.
            onPointerLeave={hasCard ? (e) => isMouse(e) && close() : undefined}
            onFocus={hasCard ? () => open(cardKey) : undefined}
            onBlur={hasCard ? close : undefined}
          >
          {episode && (
            <EpisodePreview
              cx={cx}
              cy={cy}
              episode={episode}
              occurrence={s.occurrence}
              onHover={() => open(cardKey)}
              onTap={() => toggle(cardKey)}
            />
          )}
          {book && (
            <BookPreview
              cx={cx}
              cy={cy}
              book={book}
              occurrence={s.occurrence}
              onHover={() => open(cardKey)}
              onTap={() => toggle(cardKey)}
            />
          )}
          <g
            className={`quest-stop ${stopClass(i)}${interactive ? " quest-stop--interactive" : ""}${focused ? " quest-stop--focused" : ""}`}
            data-testid={`quest-stop-${s.key}-${s.occurrence}`}
            data-done={done[i]}
            data-focused={focused || undefined}
            {...stopProps(candidate)}
          >
            <Cloud cx={cx} cy={cy + 11} cell={2.6} />
            {/* Площадка нажатия шире рисунка (тач-таргет) и служит кольцом выбора/фокуса. */}
            {interactive && <circle className="quest-stop__hit" cx={cx} cy={cy} r={22} />}
            <circle cx={cx} cy={cy} r={17} />
            {spriteWave ? (
              <Sprite wave={spriteWave} name={s.key} cx={cx} cy={cy} size={26} />
            ) : (
              <PixelIcon cells={ICONS[s.key]} cell={2.4} cx={cx} cy={cy} />
            )}
            <text className="quest-label" x={cx} y={cy + 29}>
              {s.label}
            </text>
            {minutesOf(s.key, s.occurrence) ? (
              <text
                className="quest-minutes"
                x={cx}
                y={cy + 41}
                data-testid={`quest-minutes-${s.key}-${s.occurrence}`}
              >
                {minutesOf(s.key, s.occurrence)}
              </text>
            ) : (
              <text
                className="quest-frac"
                x={cx}
                y={cy + 41}
                data-testid={`quest-frac-${s.key}-${s.occurrence}`}
              >
                {fracOf(s.key)}
              </text>
            )}
            <StreakBadge
              cx={cx + 18}
              cy={cy - 17}
              value={streak}
              testId={`quest-streak-${s.key}-${s.occurrence}`}
              title={`${s.label}: ${streak} ${pluralDays(streak)} подряд`}
            />
          </g>
          </g>
        );
      })}

      {/* Монстр — отдельная фигура рядом с маршрутом. У него СВОЯ пара состояний
          (clean/drunk), а не done/pending маршрута: монстр — событие, а не пункт дисциплины,
          и «сделано» не подходит ни в одну сторону («выпил» — не достижение, «не выпил» — не
          пропуск). Пока он делил состояния с маршрутом, выпитый монстр закрывал остановку
          кольцом достижения. */}
      <g
        className={`quest-stop quest-stop--monster ${MONSTER_STOP_CLASS[monster.tone]}${interactive ? " quest-stop--interactive" : ""}${sameLens(lens, MONSTER_LENS) ? " quest-stop--focused" : ""}`}
        data-testid="quest-stop-monster"
        data-tone={monster.tone}
        data-done={monsterDrunk ?? false}
        data-focused={sameLens(lens, MONSTER_LENS) || undefined}
        {...stopProps(MONSTER_LENS, monster.phrase)}
      >
        <Cloud cx={MONSTER_XY[0]} cy={MONSTER_XY[1] + 10} cell={2.1} />
        {interactive && (
          <circle className="quest-stop__hit" cx={MONSTER_XY[0]} cy={MONSTER_XY[1]} r={20} />
        )}
        <circle cx={MONSTER_XY[0]} cy={MONSTER_XY[1]} r={15} />
        {spriteWave ? (
          <Sprite wave={spriteWave} name="monster" cx={MONSTER_XY[0]} cy={MONSTER_XY[1]} size={22} />
        ) : (
          <PixelIcon cells={ICONS.monster} cell={2.1} cx={MONSTER_XY[0]} cy={MONSTER_XY[1]} />
        )}
        {/* Подпись-вердикт вместо голого слова «монстр»: глагол ПЕРЕД именем и в своём
            цвете — та же формулировка и та же пара цветов, что в сцене выходного (§4.2).
            Слово «монстр» одно отвечало на вопрос «что это», но не на «пил или нет», а
            единственным ответом был ховер по огоньку-стрику — и то у серии от 2 дней.
            Дроби `1/1` под подписью больше нет: она читалась как закрытый пункт.
            Неразрывный пробел — SVG схлопывает пробельные узлы между tspan-ами. */}
        <text
          className="quest-label"
          x={MONSTER_XY[0]}
          y={MONSTER_XY[1] + 26}
          data-testid="quest-monster-verdict"
        >
          {monster.verb && (
            <tspan
              className="quest-monster-verb"
              data-testid="quest-monster-verb"
              style={{ fill: monster.color }}
            >
              {monster.verb}
            </tspan>
          )}
          {/* Без вердикта подпись — просто «монстр»: ведущий пробел тогда не нужен,
              иначе строка съехала бы влево от центра на его ширину. */}
          <tspan>{monster.verb ? " монстр" : "монстр"}</tspan>
        </text>
        <StreakBadge
          cx={MONSTER_XY[0] + 16}
          cy={MONSTER_XY[1] - 15}
          value={monsterCleanStreak}
          testId="quest-streak-monster"
          tone="clean"
          // Огонёк считает ЧИСТЫЕ дни всегда — его подпись не зависит от сегодняшнего
          // вердикта, поэтому берётся «чистая» формулировка, а не `monster.phrase`.
          title={`${CLEAN_PHRASE}: ${monsterCleanStreak} ${pluralDays(monsterCleanStreak)} подряд`}
        />
      </g>

      {/* Итога дня «N/7» в углу больше нет (решение владельца): счёт остановок и так виден
          самой тропой — закрытые кружки против пустых, — а цифра поверх картинки читалась
          как оценка за день. Число остаётся в `aria-label` карты: скринридеру тропу не видно,
          и для него это единственный способ узнать прогресс. */}
      {/* Карточки подкастов — ПОСЛЕДНИЙ слой карты. В SVG нет z-index: кто нарисован позже,
          тот и сверху, а внутри своей остановки карточку перекрывал монстр (он идёт ниже по
          разметке). Отдельный слой в конце держит их поверх всего и не сломается, когда после
          остановок добавят ещё один декор. Ценой этого раскрытие переехало в состояние: из
          чужого поддерева CSS-ховер до карточки не достаёт. */}
      {podcastCards.length > 0 && (
        <g className="quest-cards">
          {podcastCards.map((c) => (
            <PodcastCard
              key={c.key}
              cx={c.cx}
              cy={c.cy}
              episode={c.episode}
              open={openCard === c.key}
              onOpen={() => open(c.key)}
              onClose={close}
            />
          ))}
        </g>
      )}
      {/* Карточки книг — тем же последним слоем и по той же причине (§5.16). */}
      {readingCards.length > 0 && (
        <g className="quest-cards">
          {readingCards.map((c) => (
            <BookCard
              key={c.key}
              cx={c.cx}
              cy={c.cy}
              book={c.book}
              occurrence={c.occurrence}
              open={openCard === c.key}
              onOpen={() => open(c.key)}
              onClose={close}
            />
          ))}
        </g>
      )}
    </svg>
  );
}
