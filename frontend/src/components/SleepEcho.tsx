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
 * пересортировывает те же бруски (см. [soundingGeometry]) — площадь цвета сохраняется по построению.
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

/**
 * Переключатель режима — пара миниатюр самих режимов, а не пара слов.
 *
 * Слова «сумма» и «по часам» называли то, чего зритель ещё не видел: понять их можно было,
 * только нажав и сравнив. Миниатюра показывает результат заранее — четыре бруска слева против
 * ступенчатого спуска ночи, — и ровно этот приём канонизирован как icon-only segmented control
 * (Apple HIG, Radix Themes): взаимоисключающие виды одного и того же, подсвечен текущий.
 *
 * Сегменты — не кнопки: кнопка тут вся плитка (§7.7), а вложенная кнопка в кнопке ещё и
 * невалидна. Поэтому пара целиком скрыта от скринридера, а жест называет `aria-label` плитки.
 */
function ModeSwitch({ timed }: { timed: boolean }) {
  return (
    <span className="sleep-echo__modes" data-testid="sleep-echo-modes" aria-hidden>
      <span className="sleep-echo__mode" data-on={!timed}>
        {/* Сумма: четыре бруска от левого края, длина — масса фазы. */}
        <svg viewBox="0 0 16 12" className="sleep-echo__glyph">
          <rect x="0" y="1" width="3" height="1.6" rx="0.4" />
          <rect x="0" y="4" width="7" height="1.6" rx="0.4" />
          <rect x="0" y="7" width="13" height="1.6" rx="0.4" />
          <rect x="0" y="10" width="5" height="1.6" rx="0.4" />
        </svg>
      </span>
      <span className="sleep-echo__mode" data-on={timed}>
        {/* По часам: то же дно ночи ступенькой — спуск и подъём между горизонтами. */}
        <svg viewBox="0 0 16 12" className="sleep-echo__glyph">
          <polyline points="0,2 3,2 3,8 6,8 6,5 10,5 10,11 13,11 13,4 16,4" />
        </svg>
      </span>
    </span>
  );
}

function Sounding({ night, times }: { night: EchoNight; times: string | null }) {
  const [timed, setTimed] = useState(false);
  const geometry = useMemo(() => echoGeometry(night), [night]);
  // Доли считает общий модуль фаз (одни проценты на все вёрстки виджета), а порядок здесь
  // СВОЙ — по глубине, как легли горизонты: подпись стоит легендой к рисунку, и читать её
  // в другом порядке, чем рисунок, значит заставлять зрителя сопоставлять по цвету.
  //
  // Пробуждения идут той же строкой первым пунктом, потому что верхний горизонт — такая же
  // нарисованная дорожка, как три остальных, и без своего пункта он оставался бы единственным
  // цветом на плитке, который не назван. Доли у него нет намеренно: «не спал» не часть сна,
  // и проценты в этой строке считаются от сна (§7.7); минуты у него, наоборот, есть — их
  // на рисунке не прочитать, верхний горизонт слишком короткий.
  //
  // У фаз сна в пункте стоит доля, а не минуты: строка обязана лечь в ОДНУ строку (перенос
  // поднимает полосу и съедает промер), а в ширину плитки помещается ровно одно число на фазу.
  // Выбрана доля: минуты — это та же доля, умноженная на длительность, которая крупно стоит
  // строкой выше, а вот сравнить ночь с ночью можно только долями.
  const legend = useMemo(() => {
    const byKey = sleepPhases({
      rem: night.totals.rem,
      deep: night.totals.deep,
      light: night.totals.light,
      awake: night.totals.awake,
    });
    if (!byKey) return null;
    return LANES.flatMap((lane) => {
      if (lane.stage === "awake") {
        return night.totals.awake > 0
          ? [{ key: "awake", color: STAGE_COLOR.awake, text: `не спал ${formatSleepShort(night.totals.awake)}` }]
          : [];
      }
      const p = byKey.find((x) => x.key === lane.stage);
      return p ? [{ key: p.key, color: STAGE_COLOR[p.key], text: `${p.label} ${p.pct}%` }] : [];
    });
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
      aria-label={night.timed ? "Ночь по часам" : undefined}
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
            // Сумма — один трансформ на брусок: сдвиг на его ранг и сжатие ко дну своего
            // горизонта. Геометрия при этом не трогается, поэтому переход играет CSS, а не rAF.
            style={time ? undefined : { transform: `translateX(${c.shift.toFixed(2)}px) scaleY(${c.squash.toFixed(4)})` }}
          />
        ))}

        <polyline className="sleep-echo__trace" points={geometry.profile} vectorEffect="non-scaling-stroke" />
      </svg>

      {/* Полоса подписи: два прохода блюра ростом С ПЛИТКУ, открытые маской только снизу.
          Ростом с плитку, а не с полосу, — выборка `backdrop-filter` зажимается краями бокса,
          и слой ростом с полосу дал бы вдоль её верхней кромки светлый смаз (docs/pitfalls.md);
          у слоя во всю плитку зажим приходится на её собственные края. */}
      <span className="sleep-echo__blur sleep-echo__blur--soft" aria-hidden />
      <span className="sleep-echo__blur sleep-echo__blur--deep" aria-hidden />

      <span className="sleep-echo__band">
        <span className="sleep-echo__head">
          <span className="sleep-echo__total">{formatSleep(night.asleep)}</span>
          {night.timed && <ModeSwitch timed={time} />}
          {/* «Лёг → встал» — рамка ночи, и стоит она на своей строке с длительностью, которую
              и задаёт. В хронологии это заодно подписи концов оси. */}
          {times && <span className="sleep-echo__times">{times}</span>}
        </span>
        {/* Доли фаз — они же вечная легенда: цвет подписи и есть цвет горизонта. */}
        <span className="sleep-echo__phases">
          {legend?.map((p) => (
            <span key={p.key} className="sleep-echo__phase" style={{ color: p.color }}>
              {p.text}
            </span>
          ))}
        </span>
      </span>
    </Root>
  );
}
