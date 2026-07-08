import type { DisciplineItemView } from "@/lib/api/types";

/**
 * Карта-тропа дисциплины (PRD §5.6; DESIGN §4.1): чеклист дня как извилистый маршрут
 * «утро → ночь» из 7 остановок. Пункты с target=2 (чтение/подкасты) дают ДВЕ остановки
 * в разных местах дня; «монстр» — тупиковое ответвление-детур от «офиса».
 *
 * Состояния выводятся из счётчиков (времени в модели нет, PRD §5.6):
 * - остановка done — count пункта ≥ её порядкового номера (occurrence);
 * - остановка missed — не сделана, но какая-то БОЛЕЕ ПОЗДНЯЯ уже сделана (день ушёл вперёд);
 * - стрелка после остановки: зелёная (done) / красная (missed) / нейтральная (ещё не дошли);
 * - все 7 сделаны — маршрут подсвечивается целиком (perfect).
 *
 * Геометрия статична (viewBox 400×210, бустрофедон 4+3 + детур) и живёт в этом файле:
 * новый пункт дисциплины = новая остановка = осознанный дизайн-проход по маршруту.
 * Вся палитра — токены волны: скин другой волны перекрашивает карту без правок разметки.
 */

interface QuestMapProps {
  items: DisciplineItemView[];
  /** Пил ли монстра (ветка-детур); вкус/подпись рендерит родитель. */
  monsterDone: boolean;
}

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
const SEGMENTS = [
  { d: "M60 45 Q92 37 125 45", ax: 92, ay: 40, deg: 0 },
  { d: "M155 45 Q187 53 220 45", ax: 187, ay: 50, deg: 0 },
  { d: "M250 45 Q282 37 315 45", ax: 282, ay: 40, deg: 0 },
  { d: "M344 53 Q382 78 372 115 Q364 143 318 154", ax: 375, ay: 100, deg: 105 },
  { d: "M285 160 Q245 168 205 160", ax: 245, ay: 166, deg: 180 },
  { d: "M175 160 Q132 152 90 160", ax: 132, ay: 154, deg: 180 },
] as const;

/** Детур на монстра: от «офиса» (S3) вниз-влево к тупиковому узлу. */
const MONSTER_XY = [172, 110] as const;
const MONSTER_SEGMENT = { d: "M226 57 Q200 78 184 98", ax: 203, ay: 78, deg: 130 } as const;

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

/** Стрелка-шеврон на сегменте (маркеры с context-stroke не везде живы — рисуем сами). */
function Chevron({ ax, ay, deg }: { ax: number; ay: number; deg: number }) {
  return (
    <path
      className="quest-chevron"
      d="M-4 -3.5 L3 0 L-4 3.5"
      transform={`translate(${ax} ${ay}) rotate(${deg})`}
    />
  );
}

export function QuestMap({ items, monsterDone }: QuestMapProps) {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const done = ROUTE.map((s) => (byKey.get(s.key)?.count ?? 0) >= s.occurrence);
  const doneCount = done.filter(Boolean).length;
  const perfect = doneCount === ROUTE.length;
  // «Пропущено» = не сделано, а день уже ушёл дальше (более поздняя остановка закрыта).
  const missed = done.map((d, i) => !d && done.some((later, j) => j > i && later));

  const stopClass = (i: number) =>
    done[i] ? "quest-stop--done" : missed[i] ? "quest-stop--missed" : "quest-stop--pending";
  const segClass = (i: number) =>
    done[i] ? "quest-seg--done" : missed[i] ? "quest-seg--broken" : "quest-seg--pending";

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
      className={`quest-map${perfect ? " quest-map--perfect" : ""}`}
      role="img"
      aria-label={`Дисциплина: ${doneCount} из ${ROUTE.length}${monsterDone ? ", монстр выпит" : ""}`}
      data-testid="quest-map"
    >
      {/* флажки старта и финиша маршрута (скин волны 01) */}
      <g className="quest-flag">
        <PixelIcon cells={ICONS.flag} cell={2.2} cx={18} cy={26} />
        <PixelIcon cells={ICONS.flag} cell={2.2} cx={32} cy={142} />
      </g>

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

      {/* тропа */}
      {SEGMENTS.map((s, i) => (
        <g key={s.d} className={`quest-seg ${segClass(i)}`}>
          <path d={s.d} />
          <Chevron ax={s.ax} ay={s.ay} deg={s.deg} />
        </g>
      ))}
      <g className={`quest-seg quest-seg--detour ${monsterDone ? "quest-seg--done" : "quest-seg--pending"}`}>
        <path d={MONSTER_SEGMENT.d} />
        <Chevron ax={MONSTER_SEGMENT.ax} ay={MONSTER_SEGMENT.ay} deg={MONSTER_SEGMENT.deg} />
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
            <circle cx={cx} cy={cy} r={15} />
            <PixelIcon cells={ICONS[s.key]} cell={2.4} cx={cx} cy={cy} />
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
        <circle cx={MONSTER_XY[0]} cy={MONSTER_XY[1]} r={13} />
        <PixelIcon cells={ICONS.monster} cell={2.1} cx={MONSTER_XY[0]} cy={MONSTER_XY[1]} />
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
