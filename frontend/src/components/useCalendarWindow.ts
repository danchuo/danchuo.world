"use client";

import { useMemo } from "react";
import type { DaySummary } from "@/lib/api/types";
import { hasEarlierWeeks } from "@/lib/calendarWindow";
import { weekWindowAround } from "@/lib/date";
import { useDayRange } from "./useDayRange";

type Status = "loading" | "error" | "loaded";

/**
 * Оконный слой календаря: четыре недели вокруг опоры [anchor] + их состояние (PRD §5.3).
 * Собственно загрузка — общий шов [useDayRange] (он же держит выборку графиков): там правила
 * «не гасить показанное» и «отбрасывать ответ на брошенный диапазон». Здесь остаётся то, что
 * есть только у календаря: перевод опоры в границы недель и упор в генезис.
 */
export function useCalendarWindow(
  anchor: string,
  weeksBefore: number,
  weeksAfter: number,
): {
  days: DaySummary[];
  status: Status;
  /** Опора ПОКАЗАННОГО окна: пока едет новое, отстаёт от запрошенной — и это её смысл. */
  shownAnchor: string;
  /** Есть ли что листать назад — по ответу бэка, а не по копии генезиса на фронте. */
  canGoBack: boolean;
  retry: () => void;
} {
  const { from, to } = useMemo(
    () => weekWindowAround(anchor, weeksBefore, weeksAfter),
    [anchor, weeksBefore, weeksAfter],
  );

  const { days, status, shownTag, shownFrom, retry } = useDayRange(from, to, anchor);

  // Пока окно едет, стрелку не гасим (оптимистично): «назад нечего» — это ответ бэка на
  // загруженное окно, а на промежуточном состоянии он относился бы к прошлой выборке.
  const canGoBack = status === "loaded" ? hasEarlierWeeks(days, shownFrom) : true;

  return { days, status, shownAnchor: shownTag, canGoBack, retry };
}
