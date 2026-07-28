"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { DaySummary } from "@/lib/api/types";
import { dayOfMonth, weekdayShortRu } from "@/lib/date";
import { TileShell, type TileState } from "./TileShell";

interface WeekStripProps {
  days: DaySummary[];
  selected: string;
  today: string;
  onSelect: (date: string) => void;
  state: TileState;
  onRetry?: () => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * Недельная полоса — мобильная замена сетки календаря (<640px, DESIGN §8). Горизонтальный
 * скролл только внутри полосы; ячейки шире (тач-таргет ≥44px): день недели + число.
 * Цвет вкуса монстра не рисуется. Тап = выбор/перефокус. При загрузке полоса автопрокручена
 * так, что «сегодня» стоит по центру (окно начинается за две недели — иначе полоса открывается
 * на самой старой дате).
 */
export function WeekStrip({
  days,
  selected,
  today,
  onSelect,
  state,
  onRetry,
  className,
  style,
}: WeekStripProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Center today's cell once the window data lands: the range starts two whole weeks in the
  // past, so an unscrolled strip would open on the oldest date and hide today off-screen.
  // Manual scrollLeft (not scrollIntoView) — it must never move the page's own scroll.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const cell = scroller?.querySelector<HTMLElement>("[data-today]");
    if (!scroller || !cell) return;
    scroller.scrollLeft =
      cell.offsetLeft - scroller.offsetLeft - (scroller.clientWidth - cell.offsetWidth) / 2;
  }, [days]);

  return (
    <TileShell state={state} onRetry={onRetry} ariaLabel="Календарь (полоса)" className={className} style={style}>
      <div ref={scrollerRef} className="flex gap-2 overflow-x-auto" role="grid">
        {days.map((d) => {
          const isToday = d.date === today;
          const isSelected = d.date === selected;
          return (
            <button
              key={d.date}
              type="button"
              role="gridcell"
              data-testid={`week-day-${d.date}`}
              data-today={isToday || undefined}
              data-selected={isSelected || undefined}
              aria-current={isToday ? "date" : undefined}
              onClick={() => onSelect(d.date)}
              className="flex shrink-0 cursor-pointer flex-col items-center justify-center"
              style={{
                fontFamily: "var(--font-mono)",
                minWidth: 44,
                minHeight: 44,
                padding: 8,
                border: isToday
                  ? "2px solid var(--border-pixel)"
                  : isSelected
                    ? "2px solid var(--accent)"
                    : "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: d.hasData ? "var(--bg-surface)" : "var(--bg-surface-muted)",
              }}
            >
              <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
                {weekdayShortRu(d.date)}
              </span>
              <span style={{ fontWeight: isToday ? 500 : 400 }}>{dayOfMonth(d.date)}</span>
            </button>
          );
        })}
      </div>
    </TileShell>
  );
}
