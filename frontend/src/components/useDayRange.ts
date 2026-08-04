"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readCache, writeCache } from "@/lib/api/cache";
import { getDays } from "@/lib/api/client";
import type { DaySummary } from "@/lib/api/types";

type Status = "loading" | "error" | "loaded";

/**
 * Загрузка диапазона дней с двумя правилами, которых нет у обычного тайла ([useTileData]).
 * Общий шов для окна календаря ([useCalendarWindow]) и выборки графиков: у обоих диапазон
 * ездит по воле читателя, и обоим есть чем занять экран на время загрузки.
 *
 * **Смена диапазона не гасит показанное.** Состояние `loading` рисует шиммер ВМЕСТО
 * содержимого, поэтому с обычным stale-while-revalidate каждый шаг листания схлопывал бы
 * плитку в пустую коробку. Пока едет новый диапазон, на экране остаётся прежний — вместе со
 * своей меткой [tag] (для календаря это опора окна: подпись месяца обязана описывать то, что
 * на экране, а не то, что ещё едет). Общее правило — DESIGN §7: лоадер уместен, только когда
 * показать нечего. Отказ сети это не продлевает: без новых данных статус честно уходит
 * в `error`, иначе прежний диапазон молча выдавал бы себя за запрошенный.
 *
 * **Ответ на брошенный диапазон игнорируется** — читатель листает быстрее, чем отвечает сеть.
 */
export function useDayRange<T>(
  from: string,
  to: string,
  tag: T,
): {
  days: DaySummary[];
  status: Status;
  /** Метка ПОКАЗАННОГО диапазона: пока едет новый, отстаёт от запрошенной — в этом её смысл. */
  shownTag: T;
  /** Начало показанного диапазона — с ним, а не с запрошенным, сверяют упор в генезис. */
  shownFrom: string;
  retry: () => void;
} {
  const [days, setDays] = useState<DaySummary[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [shownTag, setShownTag] = useState<T>(tag);
  const [shownFrom, setShownFrom] = useState(from);

  // Открытые в этой сессии диапазоны — накопитель ответов, а не отображаемое состояние.
  const memo = useRef<Record<string, DaySummary[]>>({});
  // Показано ли хоть что-то: решение «гасить или оставить» принимается внутри загрузки.
  const shown = useRef(false);
  // Диапазон, ответ на который ещё ждём; поздний ответ по любому другому отбрасывается.
  const awaiting = useRef<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const show = useCallback((rows: DaySummary[], nextTag: T, nextFrom: string) => {
    shown.current = true;
    setDays(rows);
    setShownTag(nextTag);
    setShownFrom(nextFrom);
    setStatus("loaded");
  }, []);

  useEffect(() => {
    const key = `days:${from}:${to}`;
    awaiting.current = key;

    // Уже открытый в этой сессии диапазон — из памяти и без сети: ход назад-вперёд не должен
    // стучаться за одним и тем же (сводки прошлых дней за сессию не меняются).
    const seen = memo.current[key];
    if (seen) {
      show(seen, tag, from);
      return;
    }

    // Копия с прошлой сессии — показываем сразу, но проверяем по сети (она межсессионная и
    // переживает F5 с мягким рейтлимитом публичных GET).
    const copy = readCache<DaySummary[]>(key);
    if (copy) show(copy, tag, from);
    else if (!shown.current) setStatus("loading"); // показывать нечего — честный лоадер

    getDays(from, to)
      .then((rows) => {
        if (awaiting.current !== key) return;
        memo.current[key] = rows;
        show(rows, tag, from);
        writeCache(key, rows);
      })
      .catch(() => {
        if (awaiting.current !== key || copy) return;
        setStatus("error");
      });
  }, [from, to, tag, nonce, show]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { days, status, shownTag, shownFrom, retry };
}
