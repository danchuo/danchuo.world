"use client";

import { useCallback, useMemo, useState } from "react";
import { getSleepNight } from "@/lib/api/client";
import type { SleepStagesView } from "@/lib/api/types";
import { formatSleep, formatSleepShort } from "@/lib/format";
import { LANES, STAGE_COLOR, clockLabel } from "./nightGeometry";
import { ECHO_VIEW, echoGeometry, echoNight, echoNightFromStages, type EchoNight } from "./soundingGeometry";
import { SleepNoData } from "./SleepNoData";
import { sleepPhases } from "./sleepPhases";
import { useTileData } from "./useTileData";

/**
 * Редакция «эхолот» (DESIGN §7.7, §10.1) — ночь как промер глубины во всю плитку.
 *
 * Строй взят у плитки последнего дропа: предмет падает в раму целиком, полей нет, подписи
 * «сон» нет, а весь текст лежит НА самой ночи в полосе прогрессивного блюра. Предметом здесь
 * работает сама ночь — готового кадра у сна нет, и рисовать её всё равно приходится.
 *
 * Переключатель — вся плитка, как вход в разворот у карты велобайка: ссылка в углу спорила бы
 * с рисунком, а второго жеста у плитки нет. Режим при этом не подменяет картинку, а
 * пересортировывает те же минуты (см. [soundingGeometry]) — площадь цвета сохраняется по построению.
 */
export function SleepEcho({ date, stages }: { date: string; stages: SleepStagesView | null | undefined }) {
  const fetcher = useCallback((signal: AbortSignal) => getSleepNight(date, { signal }), [date]);
  const { phase, data } = useTileData(fetcher, `sleep-night:${date}`);

  // Ночь по минутам — из кусков; их нет (часы отдали только итоги) ⇒ те же фазы без хронологии,
  // и плитка честно остаётся в одном режиме вместо выдуманного порядка минут.
  const night = useMemo(
    () => echoNight(data?.band) ?? echoNightFromStages(stages),
    [data?.band, stages],
  );

  if (phase === "loading") {
    return <div className="pixel-shimmer absolute inset-0" aria-hidden />;
  }
  if (!night) {
    return <SleepNoData />;
  }
  return (
    <Sounding
      night={night}
      times={
        data?.band
          ? `${clockLabel(data.band.onsetMinute, data.axisStartHour)} → ${clockLabel(data.band.wakeMinute, data.axisStartHour)}`
          : null
      }
    />
  );
}

function Sounding({ night, times }: { night: EchoNight; times: string | null }) {
  const [timed, setTimed] = useState(false);
  const geometry = useMemo(() => echoGeometry(night), [night]);
  // Доли считает общий модуль фаз (одни проценты на все вёрстки виджета), а порядок здесь
  // СВОЙ — по глубине, как легли горизонты: подпись стоит легендой к рисунку, и читать её
  // в другом порядке, чем рисунок, значит заставлять зрителя сопоставлять по цвету.
  const phases = useMemo(() => {
    const byKey = sleepPhases({
      rem: night.totals.rem,
      deep: night.totals.deep,
      light: night.totals.light,
      awake: night.totals.awake,
    });
    if (!byKey) return null;
    return LANES.map((lane) => byKey.find((p) => p.key === lane.stage)).filter((p) => p !== undefined);
  }, [night]);
  // Хронологии нет ⇒ показывать её нечем: плитка остаётся суммой и жестом не притворяется.
  const time = night.timed && timed;
  // Плитка-кнопка, только если жест что-то меняет: управление, которое ничего не делает,
  // не должно выглядеть управлением (и ловить фокус).
  const Root = night.timed ? "button" : "span";

  return (
    <Root
      type={night.timed ? "button" : undefined}
      className={`sleep-echo${time ? " is-timed" : ""}`}
      aria-pressed={night.timed ? time : undefined}
      onClick={night.timed ? () => setTimed((v) => !v) : undefined}
    >
      <svg
        className="sleep-echo__sounding"
        viewBox={`0 0 ${ECHO_VIEW.width} ${ECHO_VIEW.height}`}
        // Все фигуры промера — прямоугольники по осям, поэтому неравномерное растяжение их не
        // портит, а плитке не нужен ни замер, ни ResizeObserver.
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          {/* Столб набирает плотность с глубиной: у поверхности вода светлая, у дна густая.
              `userSpaceOnUse` — намеренно: градиент общий на весь промер, поэтому мелкий
              столб показывает только свой верхний, светлый кусок, а глубокий — весь спуск. */}
          {Object.entries(STAGE_COLOR).map(([stage, color]) => (
            <linearGradient
              key={stage}
              id={`sleep-echo-${stage}`}
              gradientUnits="userSpaceOnUse"
              x1={0}
              y1={0}
              x2={0}
              y2={ECHO_VIEW.height}
            >
              <stop offset="0" stopColor={color} stopOpacity="0.1" />
              <stop offset="1" stopColor={color} stopOpacity="0.9" />
            </linearGradient>
          ))}
        </defs>

        {/* Горизонты глубин — тончайшая гравировка: без неё пустой уровень теряется совсем. */}
        {geometry.floors.map((y) => (
          <line key={y} className="sleep-echo__floor" x1={0} x2={ECHO_VIEW.width} y1={y} y2={y} />
        ))}

        {geometry.columns.map((c, i) => (
          <rect
            key={i}
            className="sleep-echo__col"
            data-testid="sleep-echo-col"
            data-stage={c.stage}
            x={c.x}
            y={c.y}
            width={c.width}
            height={c.height}
            fill={`url(#sleep-echo-${c.stage})`}
            // Сумма — один трансформ на столб: сдвиг на его ранг и сжатие ко дну своего
            // горизонта. Геометрия при этом не трогается, поэтому переход играет CSS, а не rAF.
            style={time ? undefined : { transform: `translateX(${c.shift.toFixed(2)}px) scaleY(${c.squash.toFixed(4)})` }}
          />
        ))}

        <polyline className="sleep-echo__trace" points={geometry.profile} vectorEffect="non-scaling-stroke" />
      </svg>

      {/* Полоса подписи: два прохода блюра ростом С ПЛИТКУ, открытые маской только снизу.
          Ростом с плитку, а не с полосу — выборка `backdrop-filter` зажимается краями бокса,
          и слой ростом с полосу дал бы вдоль её верхней кромки светлый смаз (docs/pitfalls.md);
          у слоя во всю плитку зажим приходится на её собственные края. */}
      <span className="sleep-echo__blur sleep-echo__blur--soft" aria-hidden />
      <span className="sleep-echo__blur sleep-echo__blur--deep" aria-hidden />

      <span className="sleep-echo__band">
        <span className="sleep-echo__head">
          <span className="sleep-echo__total">{formatSleep(night.asleep)}</span>
          {/* Слово режима — состояние, а не кнопка: кнопка тут вся плитка. */}
          {night.timed && <span className="sleep-echo__mode">{time ? "по часам" : "сумма"}</span>}
          <span className="sleep-echo__meta">
            {times && <span>{times}</span>}
            {night.totals.awake > 0 && <span>не спал {formatSleepShort(night.totals.awake)}</span>}
          </span>
        </span>
        {/* Доли фаз — они же вечная легенда: цвет подписи и есть цвет горизонта. */}
        <span className="sleep-echo__phases">
          {phases?.map((p) => (
            <span key={p.key} className="sleep-echo__phase" style={{ color: STAGE_COLOR[p.key] }}>
              {p.label} {formatSleepShort(p.minutes)} {p.pct}%
            </span>
          ))}
        </span>
      </span>
    </Root>
  );
}
