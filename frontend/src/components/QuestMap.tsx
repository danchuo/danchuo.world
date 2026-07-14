import type { DisciplineItemView } from "@/lib/api/types";

/**
 * Карта-тропа дисциплины (PRD §5.6; DESIGN §4.1): чеклист дня как извилистый маршрут
 * «утро → ночь» из 7 остановок. Пункты с target=2 (чтение/подкасты) дают ДВЕ остановки
 * в разных местах дня; «монстр» — тупиковое ответвление-детур от «офиса».
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
  /** Whether the monster was drunk (detour stop). The map is the only place monster shows
   *  up on the today tile; flavor-specific art (can, name) is backlogged to land here too. */
  monsterDone: boolean;
  /** Active wave key (Board → TodayTile). Waves in [QUEST_SPRITE_WAVES] swap the hand-drawn
   *  pixel glyphs for generated raster sprites (DESIGN §12); other waves and tests (no wave)
   *  keep the currentColor cells and render unchanged. */
  wave?: string | null;
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

/** Детур на монстра: от «офиса» (S3) вниз-влево к тупиковому узлу. */
const MONSTER_XY = [172, 110] as const;
const MONSTER_SEGMENT = { d: "M226 57 Q200 78 184 98", ax: 203, ay: 78, deg: 136 } as const;

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

export function QuestMap({ items, monsterDone, wave }: QuestMapProps) {
  // Волна со своим спрайт-набором ⇒ рисуем растровые иконки; иначе — ручные пиксель-клетки.
  const spriteWave = wave && QUEST_SPRITE_WAVES.has(wave) ? wave : null;
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

  return (
    <svg
      viewBox="0 0 400 210"
      className={`quest-map${perfect ? " quest-map--perfect" : ""}${spriteWave ? " quest-map--sprites" : ""}`}
      role="img"
      aria-label={`Дисциплина: ${doneCount} из ${ROUTE.length}${monsterDone ? ", монстр выпит" : ""}`}
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
      <g className={`quest-seg quest-seg--detour ${monsterDone ? "quest-seg--done" : "quest-seg--pending"}`}>
        <path d={MONSTER_SEGMENT.d} />
        <Chevron ax={MONSTER_SEGMENT.ax} ay={MONSTER_SEGMENT.ay} deg={MONSTER_SEGMENT.deg} sprite={!!spriteWave} />
      </g>

      {/* остановки */}
      {ROUTE.map((s, i) => {
        const [cx, cy] = STOPS_XY[i];
        return (
          <g
            key={`${s.key}-${s.occurrence}`}
            className={`quest-stop ${stopClass(i)}`}
            data-testid={`quest-stop-${s.key}-${s.occurrence}`}
            data-done={done[i]}
          >
            <Cloud cx={cx} cy={cy + 11} cell={2.6} />
            <circle cx={cx} cy={cy} r={17} />
            {spriteWave ? (
              <Sprite wave={spriteWave} name={s.key} cx={cx} cy={cy} size={26} />
            ) : (
              <PixelIcon cells={ICONS[s.key]} cell={2.4} cx={cx} cy={cy} />
            )}
            <text className="quest-label" x={cx} y={cy + 29}>
              {s.label}
            </text>
            <text
              className="quest-frac"
              x={cx}
              y={cy + 41}
              data-testid={`quest-frac-${s.key}-${s.occurrence}`}
            >
              {fracOf(s.key)}
            </text>
          </g>
        );
      })}

      {/* тупик-детур: монстр */}
      <g
        className={`quest-stop quest-stop--monster ${monsterDone ? "quest-stop--done" : "quest-stop--pending"}`}
        data-testid="quest-stop-monster"
        data-done={monsterDone}
      >
        <Cloud cx={MONSTER_XY[0]} cy={MONSTER_XY[1] + 10} cell={2.1} />
        <circle cx={MONSTER_XY[0]} cy={MONSTER_XY[1]} r={15} />
        {spriteWave ? (
          <Sprite wave={spriteWave} name="monster" cx={MONSTER_XY[0]} cy={MONSTER_XY[1]} size={22} />
        ) : (
          <PixelIcon cells={ICONS.monster} cell={2.1} cx={MONSTER_XY[0]} cy={MONSTER_XY[1]} />
        )}
        <text className="quest-label" x={MONSTER_XY[0]} y={MONSTER_XY[1] + 26}>
          монстр
        </text>
        <text
          className="quest-frac"
          x={MONSTER_XY[0]}
          y={MONSTER_XY[1] + 38}
          data-testid="quest-frac-monster"
        >
          {monsterDone ? "1/1" : "0/1"}
        </text>
      </g>

      {/* итог дня */}
      <text className="quest-total" x={396} y={14} data-testid="quest-total">
        {doneCount}/{ROUTE.length}
      </text>
    </svg>
  );
}
