"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { getRideMonthSummary } from "@/lib/api/client";
import type { RideMonthSummaryView, RideView } from "@/lib/api/types";
import { relativeDayRu } from "@/lib/relativeDay";
import { formatDuration, formatKm, formatRideCost, formatStationAddress, pluralRu, rublesWhole } from "@/lib/rideFormat";
import { Icon } from "./Icon";
import { RideMap } from "./RideMap";
import { useBackToClose } from "./useBackToClose";
import { useDropMorph } from "./useDropMorph";

interface RidesModalProps {
  rides: RideView[];
  today: string;
  /** Активная волна — пробрасывается в карту для выбора пиксельных пинов (DESIGN §12). */
  wave?: string | null;
  /**
   * Редакция виджета (см. `RideEdition` в [RideTile]): `map` разворачивает окно в разворот —
   * карта слева, список справа, — всё прочее оставляет прежнюю колонку. Строка как есть.
   */
  edition?: string;
  /**
   * Карта на плитке борда, из которой растёт карта окна (проявка, DESIGN §7.5). Играть
   * движение или нет, решает скин волны (`--drop-morph`) — здесь только источник.
   */
  origin?: RefObject<HTMLElement | null>;
  onClose: () => void;
}

const hasCoords = (r: RideView | undefined): r is RideView =>
  !!r && r.startLat != null && r.startLon != null && r.finishLat != null && r.finishLon != null;

/**
 * Модалка «поездки» Велобайк (PRD §9 B4, DESIGN §7.6) — тот же контур, что у модалки фото-дропов
 * (§5.12): большое всплывающее окно, затемнённый фон, закрытие по `×`/`Esc`/клику по фону,
 * фокус-трап. Открывается по кнопке «предыдущие» ИЛИ по клику на карту тайла.
 *
 * Внутри — **карта** выбранной поездки (путь старт→финиш, пины активной волны), **выбираемый
 * список** всех поездок (прокручивается независимо) и **сводка за месяц** тихой строкой. По
 * умолчанию выбрана самая свежая (первая в списке = та, что на тайле); клик по строке
 * перерисовывает карту динамически. Список уже загружен тайлом (передаётся пропом) — модалка
 * не делает повторный запрос.
 *
 * Редакция `map` (её выбирает волна, см. `RideEdition`) раскладывает те же три части
 * **разворотом**: карта слева, список справа, сводка строкой под ними. Причина не в моде на
 * колонки: на плитке этой редакции карта занимает всё, и окно, открывающееся из неё узкой
 * полосой карты над списком, читалось бы шагом назад — карта обязана остаться главной.
 * Прочие редакции оставляют прежнюю колонку (карта сверху, список под ней).
 *
 * Карта приезжает **проявкой** из плитки (§7.5), если её попросил скин волны: шов [useDropMorph]
 * тот же, что у галереи дропа, и о поездках он не знает — ему нужны источник (`origin`), сцена
 * и «герой». Ждём при этом первых тайлов карты (`onReady`): пустой серый прямоугольник, летящий
 * через экран, — не то движение, ради которого шов заводили.
 */
export function RidesModal({ rides, today, wave, edition, origin, onClose }: RidesModalProps) {
  const spread = edition === "map";
  const sceneRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [selectedId, setSelectedId] = useState<number | null>(rides[0]?.id ?? null);
  const [summary, setSummary] = useState<RideMonthSummaryView | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [atEnd, setAtEnd] = useState(true);

  const selected = useMemo(
    () => rides.find((r) => r.id === selectedId) ?? rides[0],
    [rides, selectedId],
  );

  // Сводка за текущий месяц (шапка под картой) — тянем лениво при открытии модалки; сбой
  // глотаем (строка второстепенна, без неё модалка живёт списком). Деньги считает бэк с учётом
  // дедупликации покупок тарифов — на фронте это не восстановить (см. `RideMonthSummaryView`).
  useEffect(() => {
    const ctrl = new AbortController();
    getRideMonthSummary({ signal: ctrl.signal }).then(setSummary).catch(() => {});
    return () => ctrl.abort();
  }, []);

  const showSummary = summary != null && summary.rides > 0;
  const summaryMinutes = summary ? Math.round(summary.durationSeconds / 60) : 0;
  const summaryRubles = summary ? rublesWhole(summary.spentKopecks) : 0;

  // Проявка: карта растёт из плитки борда (DESIGN §7.5). Шов общий с галереей дропа, включает
  // его волна (`--drop-morph`), поэтому здесь нет ни ключа волны, ни единого числа анимации.
  const { playIn, requestClose } = useDropMorph({ origin, sceneRef, onClose });
  // Играем, когда карте есть что показать: тайлы приехали — или показывать нечего в принципе
  // (у поездки нет координат, на месте карты заглушка). Layout-эффект, а не обычный, — как у
  // галереи: трансформация обязана лечь ДО первой отрисовки окна.
  useLayoutEffect(() => {
    if (mapReady || !hasCoords(selected)) playIn();
  }, [mapReady, selected, playIn]);

  // Системное «Назад» закрывает окно, а не уводит с сайта (DESIGN §9).
  useBackToClose(true, requestClose);

  // Список докручен до конца? От этого зависит растворение нижней строки (аффорданс прокрутки,
  // common.css): пока внизу что-то есть — строка уходит под край, докрутили — маска снимается.
  // «Влезло целиком» считается тем же условием и даёт `true` — фейд не появляется вовсе.
  // Пересчёт и на прокрутку, и на изменение размера колонки: разворот доезжает до своих размеров
  // уже после открытия (проявка), и замер на маунте сам по себе не окончателен.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    if (typeof ResizeObserver === "undefined") return () => el.removeEventListener("scroll", measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [rides]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        requestClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  // Карта выбранной поездки. Один и тот же узел в обеих редакциях — меняется только место,
  // куда его кладут: колонкой сверху или левой половиной разворота. Он же «герой» проявки
  // (`data-morph-hero`) и её «лицо» (`data-morph-face` — слой, который режется клипом на время
  // полёта; у дропа лицом работает снимок, здесь — сама карта).
  const map = (
    <div
      className={spread ? "ride-modal__map" : "shrink-0"}
      data-morph-hero
      data-morph-face
      style={
        spread
          ? undefined
          : { height: "var(--modal-map-h)", borderRadius: "var(--radius-sm)", overflow: "hidden", marginBottom: 10 }
      }
    >
      {hasCoords(selected) ? (
        <RideMap
          key={selected.id}
          startLat={selected.startLat!}
          startLon={selected.startLon!}
          finishLat={selected.finishLat!}
          finishLon={selected.finishLon!}
          wave={wave}
          interactivePins
          startLabel={formatStationAddress(selected.startAddress)}
          finishLabel={formatStationAddress(selected.finishAddress)}
          onReady={() => setMapReady(true)}
        />
      ) : (
        <div
          className="flex h-full items-center justify-center"
          style={{ ...monoTertiary, background: "var(--bg-surface-muted)" }}
        >
          нет данных о маршруте
        </div>
      )}
    </div>
  );

  /* Сводка за текущий месяц — тихая однострочная подпись (не скроллится со списком).
     Ненавязчиво: без плашки/рамки, приглушённый моно; числа чуть ярче единиц. Нет поездок
     в этом месяце ⇒ строки нет вовсе. */
  const summaryLine = showSummary && (
    <div
      className="ride-modal__summary shrink-0 flex flex-wrap items-baseline"
      style={summaryRow}
      aria-label="Сводка за текущий месяц"
    >
      <span style={summaryCaption}>в этом месяце</span>
      <SummaryStat value={summary.rides} unit={pluralRu(summary.rides, ["поездка", "поездки", "поездок"])} />
      <span style={summaryDot}>·</span>
      <SummaryStat value={summaryMinutes} unit={pluralRu(summaryMinutes, ["минута", "минуты", "минут"])} />
      <span style={summaryDot}>·</span>
      <SummaryStat value={summaryRubles} unit={pluralRu(summaryRubles, ["рубль", "рубля", "рублей"])} />
    </div>
  );

  /* Прокручиваемый список: строка = кнопка выбора, выделенная подсвечена. В развороте ползунок
     снят, а взамен нижняя строка растворяется под краем колонки (`--fade`, common.css) — знание
     о том, что список длиннее окна, обязано остаться, когда полосу убрали. */
  const list = (
    <ul
      ref={listRef}
      className={`ride-modal__list flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto ${
        spread ? `scroll-invisible ride-modal__list--fade ${atEnd ? "is-at-end" : ""}` : ""
      }`}
      role="listbox"
      aria-label="Выбор поездки"
    >
      {rides.map((r) => {
        const isSel = r.id === selected.id;
        const cost = formatRideCost(r); // «406 ₽ (доступ 399 + 7 сверх)» и прочие формы
        return (
          <li key={r.id} role="option" aria-selected={isSel}>
            <button
              type="button"
              onClick={() => setSelectedId(r.id)}
              className={`ride-modal__row tap-target flex w-full flex-col gap-1 text-left ${
                isSel ? "is-selected" : ""
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  style={{
                    color: isSel ? "var(--accent)" : "var(--text-primary)",
                    fontSize: "var(--fs-modal-row)",
                  }}
                >
                  {relativeDayRu(r.rideDate, today)}
                </span>
                <span style={{ ...mono, color: "var(--text-secondary)", fontSize: "var(--fs-modal-meta)" }}>{r.rideDate}</span>
              </div>
              <div style={{ ...mono, color: "var(--text-secondary)", fontSize: "var(--fs-modal-meta)" }}>
                {formatKm(r.distanceMeters)} · {formatDuration(r.durationSeconds)}
                {r.calories != null && r.calories > 0 ? ` · ${r.calories} ккал` : ""}
                {cost ? ` · ${cost}` : ""}
              </div>
              {(r.startAddress || r.finishAddress) && (
                <div style={{ ...mono, color: "var(--text-tertiary)", fontSize: "var(--fs-modal-note)" }}>
                  {(formatStationAddress(r.startAddress) ?? "?") + " → " + (formatStationAddress(r.finishAddress) ?? "?")}
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    // `drop-scene` — сцена проявки, а не «слой дропа»: затемнение (`--modal-scrim`), такты
    // движения и экранное стекло волны живут на ней (common.css). Имя осталось от первого
    // жильца, как и весь словарь шва (`--drop-morph-*`); второй жилец переезжает в него,
    // а не заводит рядом свой.
    <div
      ref={sceneRef}
      className="drop-scene modal-scale fixed inset-0 z-50 flex items-center justify-center p-6"
      onClick={requestClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Прошлые поездки"
        className={`ride-modal__panel pixel-tile flex w-full flex-col p-4 ${spread ? "max-w-[64rem]" : "max-w-2xl"}`}
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Подложка «коробочки» + белая внутренняя рамка (§2.4) — как у TileShell:
            панель-модалка несёт .pixel-tile сама, элементы слоёв добавляем сами. */}
        <span className="pixel-slab" aria-hidden />
        <span className="pixel-lid" aria-hidden />
        <div className="ride-modal__head mb-3 flex shrink-0 items-center justify-between">
          <span style={{ fontSize: "var(--fs-modal-title)", color: "var(--text-primary)" }}>поездки</span>
          <button
            ref={closeRef}
            type="button"
            className="tap-target"
            onClick={requestClose}
            aria-label="Закрыть"
            style={{ ...monoTertiary, cursor: "pointer", background: "none", border: "none", display: "inline-flex" }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {rides.length === 0 ? (
          <p style={monoTertiary}>поездок пока нет</p>
        ) : spread ? (
          <>
            {/* Разворот: карта слева, список справа — обе половины ужимаются вместе с окном,
                сводка лежит строкой под ними во всю ширину. */}
            <div className="ride-modal__body flex min-h-0 flex-1">
              {map}
              {list}
            </div>
            {summaryLine}
          </>
        ) : (
          <>
            {map}
            {summaryLine}
            {list}
          </>
        )}
      </div>
    </div>
  );
}

/** Один показатель сводки месяца в строку: число (чуть ярче) + просклонённая единица (приглушённо). */
function SummaryStat({ value, unit }: { value: number; unit: string }) {
  return (
    <span style={{ ...mono, fontSize: "var(--fs-modal-meta)" }}>
      <span style={{ color: "var(--text-primary)" }}>{value}</span>
      <span style={{ color: "var(--text-tertiary)" }}> {unit}</span>
    </span>
  );
}

const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;
const monoTertiary = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-modal-meta)",
  color: "var(--text-tertiary)",
} satisfies CSSProperties;

// Сводка месяца — тихая однострочная подпись под картой (ненавязчиво, без плашки/рамки): числа в
// строку через точку-разделитель, приглушённый моно. Ниже карты с небольшим зазором, не наезжает.
const summaryRow = {
  columnGap: 6,
  rowGap: 2,
  marginBottom: 12,
} satisfies CSSProperties;

const summaryCaption = {
  ...mono,
  fontSize: "var(--fs-modal-small)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-tertiary)",
} satisfies CSSProperties;

const summaryDot = {
  ...mono,
  fontSize: "var(--fs-modal-meta)",
  color: "var(--text-tertiary)",
} satisfies CSSProperties;
