"use client";

import { useCallback, useId, useMemo, useState, type CSSProperties } from "react";
import { getSleepNight } from "@/lib/api/client";
import type { SleepStagesView } from "@/lib/api/types";
import { formatSleep, formatSleepShort } from "@/lib/format";
import { moonLitPath, moonPhase } from "@/lib/moonPhase";
import { LANES, STAGE_COLOR, clockLabel, type SleepStageKey } from "./nightGeometry";
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
 * Переключатель — вся плитка, как вход в разворот у карты велобайка: второго жеста у плитки
 * нет, а пара миниатюр в конце строки с длительностью только показывает текущий вид. Режим
 * при этом не подменяет картинку, а пересортировывает те же бруски (см. [soundingGeometry]) —
 * площадь цвета сохраняется по построению.
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
      date={date}
      times={
        data?.band
          ? {
              from: clockLabel(data.band.onsetMinute, data.axisStartHour),
              to: clockLabel(data.band.wakeMinute, data.axisStartHour),
            }
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
 *
 * Место пары — правый конец строки с длительностью, то есть нижний угол плитки. Строкой,
 * а не столбиком: в полосе она стоит в потоке и место себе отнимает сама, поэтому ни ряды
 * суммы, ни их подписи с ней столкнуться не могут — а угол рисунка возвращается рисунку.
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

/**
 * Луна над этой ночью — знак, которым плитка называет свой предмет. Слова «сон» у редакции нет
 * (§7.7), а промер глубины сам по себе про сон не говорит: без знака полоса начиналась прямо
 * с числа. Фаза при этом настоящая, из даты (см. [moonPhase]), — декор волны, который не врёт.
 *
 * Диск рисуется целиком и всегда, а поверх него — освещённая часть: тёмная сторона Луны это
 * не пустота, а сама Луна в тени, и без диска молодой серп в полтора десятка пикселей просто
 * терялся, а новолуние не рисовалось вовсе.
 */
function MoonMark({ date }: { date: string }) {
  const phase = moonPhase(date);
  if (!phase) return null;
  return (
    <svg className="sleep-echo__moon" viewBox="-8 -8 16 16" aria-hidden>
      <circle className="sleep-echo__moon-disc" r={MOON_R} />
      {/* Убывающую Луну рисует тот же контур в зеркале: освещённый край переходит на левую
          сторону диска, а форма серпа от этого не зависит. */}
      <path
        className="sleep-echo__moon-lit"
        d={moonLitPath(phase.cycle, MOON_R)}
        transform={phase.waxing ? undefined : "scale(-1 1)"}
      />
    </svg>
  );
}

const MOON_R = 6;

function Sounding({
  night,
  date,
  times,
}: {
  night: EchoNight;
  date: string;
  times: { from: string; to: string } | null;
}) {
  const [timed, setTimed] = useState(false);
  // Градиенты обязаны быть уникальными НА ЭКЗЕМПЛЯР: борд держит в DOM обе раскладки сразу
  // (бенто и мобильный стек, переключает их CSS), то есть плитка сна в документе всегда в двух
  // копиях. С общим id `url(#…)` уводит на первое совпадение — а оно в скрытой раскладке, где
  // краски нет, и бруски видимой копии рисовались нечем. Символы `useId` в ссылку-фрагмент
  // не пускаем: id ещё и уезжает в `url()`.
  const uid = useId().replace(/[^a-z0-9]/gi, "");
  const paint = useCallback((stage: string) => `sleep-echo-${uid}-${stage}`, [uid]);
  const geometry = useMemo(() => echoGeometry(night), [night]);
  const durations = useMemo(() => LANES.flatMap((lane, index) => {
    if (night.totals[lane.stage] <= 0) return [];
    const columns = geometry.columns.filter((c) => c.stage === lane.stage);
    const barHeight = geometry.columns[0].height * geometry.columns[0].squash;
    return [{
      stage: lane.stage,
      minutes: night.totals[lane.stage],
      // Позиция — по концу НАРИСОВАННОГО ряда, а число — из минут ночи: квота брусков
      // округляет пропорции, и считать по ней время значило бы округлять и его.
      end: Math.max(0, ...columns.map((c) => c.x + c.shift + c.width)) / ECHO_VIEW.width,
      center: (geometry.floors[index] - barHeight / 2) / ECHO_VIEW.height,
    }];
  }), [geometry, night]);
  // Легенда с долями — ТОЛЬКО для хронологии (§7.7): в сумме точные минуты стоят у своих
  // рядов, и доля рядом с ними была бы тем же фактом, сказанным дважды. В хронологии подписи
  // с рядов ушли, строка свободна, и доля — единственное, чего на рисунке не прочитать.
  //
  // Доли считает общий модуль фаз (одни проценты на все вёрстки виджета), а порядок здесь
  // СВОЙ — по глубине, как легли горизонты: подпись стоит легендой к рисунку, и читать её
  // в другом порядке, чем рисунок, значит заставлять зрителя сопоставлять по цвету.
  //
  // Пробуждений в этой строке нет: доли считаются от сна, а «не спал» не его часть (§7.7), —
  // минуты среди процентов стояли единственным пунктом другой размерности и при этом самым
  // длинным. Верхний горизонт называет сумма: там его минуты стоят у самого ряда. Строка же
  // обязана ложиться в ОДНУ линию — её концы несут начало и конец ночи, и перенос уводил бы
  // пробуждение под легенду (проверено в e2e).
  //
  // Имя фазы берётся ОТТУДА ЖЕ, откуда доля, и достаётся обоим режимам: у правого края ряда
  // в сумме и в легенде хронологии стоит одно и то же слово. Разойдясь, они назвали бы один
  // горизонт в двух режимах по-разному, и переключение читалось бы как смена данных.
  const { legend, names } = useMemo(() => {
    const byKey = sleepPhases({
      rem: night.totals.rem,
      deep: night.totals.deep,
      light: night.totals.light,
      awake: night.totals.awake,
    });
    const names: Partial<Record<SleepStageKey, string>> = { awake: "не спал" };
    byKey?.forEach((p) => {
      names[p.key] = p.label;
    });
    if (!byKey) return { legend: null, names };
    const legend = LANES.flatMap((lane) => {
      if (lane.stage === "awake") return [];
      const p = byKey.find((x) => x.key === lane.stage);
      return p ? [{ key: p.key, color: STAGE_COLOR[p.key], text: `${p.label} ${p.pct}%` }] : [];
    });
    return { legend, names };
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
      style={{ "--sleep-summary-extent": Math.max(...durations.map((d) => d.end), 0.01) } as CSSProperties}
      aria-pressed={night.timed ? time : undefined}
      aria-label={night.timed ? "Ночь по часам" : undefined}
      onClick={night.timed ? () => setTimed((v) => !v) : undefined}
    >
      <span className="sleep-echo__plot">
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
                id={paint(stage)}
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

          <g className="sleep-echo__columns">
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
                fill={`url(#${paint(c.stage)})`}
                // Сумма — один трансформ на брусок: сдвиг на его ранг и сжатие ко дну своего
                // горизонта. Геометрия при этом не трогается, поэтому переход играет CSS, а не rAF.
                style={time ? undefined : { transform: `translateX(${c.shift.toFixed(2)}px) scaleY(${c.squash.toFixed(4)})` }}
              />
            ))}
          </g>

          <polyline className="sleep-echo__trace" points={geometry.profile} vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="sleep-echo__durations" data-testid="sleep-echo-durations" aria-hidden={time}>
          {durations.map((d) => (
            <span key={d.stage} style={{ color: STAGE_COLOR[d.stage] }}>
              {/* Длительность идёт СРАЗУ за своим рядом и красится в цвет фазы: цвет её и
                  называет, поэтому слова «REM» при числе не нужно.
                  Формат КОРОТКИЙ («3ч 53м»): число стоит между концом ряда и прижатым к краю
                  именем, и в полной записи этот зазор съедался целиком — ряды приходилось
                  укорачивать, чтобы подписи не наезжали друг на друга. Точность та же,
                  а полная запись остаётся у скринридера и у длительности ночи в полосе. */}
              <span
                className="sleep-echo__duration"
                data-testid={`sleep-duration-${d.stage}`}
                aria-label={`${names[d.stage] ?? ""}: ${formatSleep(d.minutes)}`}
                style={{
                  left: `calc(${d.end * 100}% * var(--sleep-summary-scale) + var(--sleep-duration-gap))`,
                  top: `${d.center * 100}%`,
                }}
              >
                {formatSleepShort(d.minutes)}
              </span>
              {/* Имя фазы — у правого края, тем же цветом, но тусклее числа: подпись работает
                  легендой к ряду, а не данными, и первым в строке обязано читаться число. */}
              <span
                className="sleep-echo__name"
                data-testid={`sleep-name-${d.stage}`}
                style={{ top: `${d.center * 100}%` }}
              >
                {names[d.stage]}
              </span>
            </span>
          ))}
        </span>
      </span>

      {/* Полоса подписи: два прохода блюра ростом С ПЛИТКУ, открытые маской только снизу.
          Ростом с плитку, а не с полосу, — выборка `backdrop-filter` зажимается краями бокса,
          и слой ростом с полосу дал бы вдоль её верхней кромки светлый смаз (docs/pitfalls.md);
          у слоя во всю плитку зажим приходится на её собственные края. */}
      <span className="sleep-echo__blur sleep-echo__blur--soft" aria-hidden />
      <span className="sleep-echo__blur sleep-echo__blur--deep" aria-hidden />

      <span className="sleep-echo__band">
        <span className="sleep-echo__head">
          <MoonMark date={date} />
          <span className="sleep-echo__total">{formatSleep(night.asleep)}</span>
          {night.timed && <ModeSwitch timed={time} />}
        </span>
        {/* Вторая строка полосы — только в хронологии. «Лёг» и «встал» встают её КОНЦАМИ:
            ось рисунка и полоса одной ширины, поэтому левый край строки и есть начало ночи,
            а правый — пробуждение. Подписи концов при этом лежат на скриме полосы, а не на
            брусках, — длинная фаза не может отнять у них место (стрелка снята как лишний знак).
            В сумме оси времени нет, и рамка ночи с плитки уходит совсем. */}
        {time && (
          <span className="sleep-echo__phases">
            {times && <span className="sleep-echo__edge">{times.from}</span>}
            {legend?.map((p) => (
              <span key={p.key} className="sleep-echo__phase" style={{ color: p.color }}>
                {p.text}
              </span>
            ))}
            {times && <span className="sleep-echo__edge" data-side="to">{times.to}</span>}
          </span>
        )}
      </span>
    </Root>
  );
}
