"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getRideMonthSummary } from "@/lib/api/client";
import type { RideMonthSummaryView, RideView } from "@/lib/api/types";
import { relativeDayRu } from "@/lib/relativeDay";
import { formatDuration, formatKm, formatRideCost, formatStationAddress, pluralRu, rublesWhole } from "@/lib/rideFormat";
import { Icon } from "./Icon";
import { RideMap } from "./RideMap";

interface RidesModalProps {
  rides: RideView[];
  today: string;
  /** Активная волна — пробрасывается в карту для выбора пиксельных пинов (DESIGN §12). */
  wave?: string | null;
  onClose: () => void;
}

const hasCoords = (r: RideView | undefined): r is RideView =>
  !!r && r.startLat != null && r.startLon != null && r.finishLat != null && r.finishLon != null;

/**
 * Модалка «поездки» Велобайк (PRD §9 B4, DESIGN §7.6) — тот же контур, что у модалки фото-дропов
 * (§5.12): большое всплывающее окно, затемнённый фон, закрытие по `×`/`Esc`/клику по фону,
 * фокус-трап. Открывается по кнопке «предыдущие» ИЛИ по клику на мини-карту тайла.
 *
 * Сверху — **прилипшая карта** выбранной поездки (путь старт→финиш, пины активной волны), под ней
 * **выбираемый список** всех поездок (прокручивается независимо). По умолчанию выбрана самая
 * свежая (первая в списке = та, что на тайле); клик по строке перерисовывает карту динамически.
 * Список уже загружен тайлом (передаётся пропом) — модалка не делает повторный запрос.
 */
export function RidesModal({ rides, today, wave, onClose }: RidesModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [selectedId, setSelectedId] = useState<number | null>(rides[0]?.id ?? null);
  const [summary, setSummary] = useState<RideMonthSummaryView | null>(null);

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

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
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
  }, [onClose]);

  return (
    <div
      className="modal-scale fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(33, 26, 22, 0.55)" }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Прошлые поездки"
        className="pixel-tile flex w-full max-w-2xl flex-col p-4"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Подложка «коробочки» + белая внутренняя рамка (§2.4) — как у TileShell:
            панель-модалка несёт .pixel-tile сама, элементы слоёв добавляем сами. */}
        <span className="pixel-slab" aria-hidden />
        <span className="pixel-lid" aria-hidden />
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <span style={{ fontSize: "var(--fs-modal-title)", color: "var(--text-primary)" }}>поездки</span>
          <button
            ref={closeRef}
            type="button"
            className="tap-target"
            onClick={onClose}
            aria-label="Закрыть"
            style={{ ...monoTertiary, cursor: "pointer", background: "none", border: "none", display: "inline-flex" }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {rides.length === 0 ? (
          <p style={monoTertiary}>поездок пока нет</p>
        ) : (
          <>
            {/* Прилипшая карта выбранной поездки — путь старт→финиш (пины активной волны). Нет
                координат ⇒ тёплая заглушка вместо карты (виджет всё равно живёт списком). */}
            <div
              className="shrink-0"
              style={{ height: "var(--modal-map-h)", borderRadius: "var(--radius-sm)", overflow: "hidden", marginBottom: 10 }}
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

            {/* Сводка за текущий месяц — тихая однострочная подпись под картой (не скроллится со
                списком). Ненавязчиво: без плашки/рамки, приглушённый моно; числа чуть ярче единиц.
                Нет поездок в этом месяце ⇒ строки нет вовсе. */}
            {showSummary && (
              <div className="shrink-0 flex flex-wrap items-baseline" style={summaryRow} aria-label="Сводка за текущий месяц">
                <span style={summaryCaption}>в этом месяце</span>
                <SummaryStat value={summary.rides} unit={pluralRu(summary.rides, ["поездка", "поездки", "поездок"])} />
                <span style={summaryDot}>·</span>
                <SummaryStat value={summaryMinutes} unit={pluralRu(summaryMinutes, ["минута", "минуты", "минут"])} />
                <span style={summaryDot}>·</span>
                <SummaryStat value={summaryRubles} unit={pluralRu(summaryRubles, ["рубль", "рубля", "рублей"])} />
              </div>
            )}

            {/* Прокручиваемый список: строка = кнопка выбора, выделенная подсвечена. */}
            <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto" role="listbox" aria-label="Выбор поездки">
              {rides.map((r) => {
                const isSel = r.id === selected.id;
                return (
                  <li key={r.id} role="option" aria-selected={isSel}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className="tap-target flex w-full flex-col gap-1 text-left"
                      style={{
                        cursor: "pointer",
                        border: "none",
                        background: isSel ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "none",
                        borderLeft: isSel
                          ? "3px solid var(--accent)"
                          : "3px solid transparent",
                        borderRadius: "var(--radius-sm)",
                        padding: "6px 8px",
                      }}
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
                        {r.costKopecks != null
                          ? ` · ${formatRideCost(r.costKopecks, r.coveredByTariffKopecks)}`
                          : ""}
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
