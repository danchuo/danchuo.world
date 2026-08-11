import type { KeyboardEvent } from "react";
import type { DisciplineItemView } from "@/lib/api/types";
import { MONSTER_LENS_KEY, sameLens, type DisciplineLens } from "@/lib/disciplineLens";
import { monsterVerdict, type MonsterTone } from "@/lib/monster";

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
  const byKey = new Map(items.map((i) => [i.key, i]));
  const done = ROUTE.map((s) => (byKey.get(s.key)?.count ?? 0) >= s.occurrence);
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
        return (
          <g
            key={`${s.key}-${s.occurrence}`}
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
    </svg>
  );
}
