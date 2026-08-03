"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readCache, writeCache } from "@/lib/api/cache";
import { getDay } from "@/lib/api/client";
import type { DayView } from "@/lib/api/types";

type Status = "loading" | "error" | "loaded";

/**
 * Дневной слой борда: выбранный день + его состояние (DESIGN §7 — per-tile состояния,
 * общего спиннера нет). Тот же stale-while-revalidate, что и в [useTileData], но с двумя
 * особенностями, которых у обычного тайла нет.
 *
 * **Пока едет новый день, на экране остаётся предыдущий.** Состояние `loading` рисует шиммер
 * ВМЕСТО содержимого, а в мобильном стеке у плитки «Сегодня» нет высоты от родителя (высота
 * там по контенту, см. `stackHeights.css`) — поэтому каждое переключение дня схлопывало
 * доминанту борда в ноль и экран дёргался. Подмены высотой тут мало: пропадала ещё и
 * мета-подпись плитки. Показанный день той же формы, что и следующий (заголовок в одну строку,
 * карта-тропа и сцена выходного делят одну `aspect-ratio`), поэтому смена содержимого проходит
 * без сдвига вовсе. Цена — короткая задержка: пока день не приехал, в шапке стоит прежняя дата.
 * Отказ сети её не продлевает: без данных выбранного дня статус честно уходит в `error`,
 * иначе чужой день молча выдавал бы себя за выбранный.
 *
 * **Ответ на брошенный день игнорируется.** Дни листают быстрее, чем отвечает сеть, и без
 * этого поздний ответ по отменённой дате перебивал бы уже выбранную.
 */
export function useSelectedDay(date: string): {
  day: DayView | null;
  status: Status;
  retry: () => void;
} {
  const [day, setDay] = useState<DayView | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  // Загруженные дни — накопитель ответов сети, а не отображаемое состояние: держим в ref,
  // чтобы запись в кэш не вызывала лишний рендер.
  const memo = useRef<Record<string, DayView>>({});
  // Показанный день — тоже ref: решение «гасить или оставить» принимается внутри загрузки,
  // и брать его из состояния значило бы пересобирать её на каждый приезд дня.
  const shown = useRef<DayView | null>(null);
  // Дата, ответ на которую ещё ждём; поздний ответ по любой другой отбрасывается.
  const awaiting = useRef<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const show = useCallback((d: DayView | null, next: Status) => {
    shown.current = d;
    setDay(d);
    setStatus(next);
  }, []);

  useEffect(() => {
    awaiting.current = date;
    // Уже загруженный в этой сессии день — из памяти и без сети: листание назад-вперёд по
    // календарю не должно стучаться за одним и тем же днём (данные дня за сессию не меняются).
    const seen = memo.current[date];
    if (seen) {
      show(seen, "loaded");
      return;
    }

    // Копия с прошлой сессии — показываем сразу, но проверяем по сети: она межсессионная
    // и вполне могла устареть (переживает F5 и мягкий рейтлимит публичных GET).
    const copy = readCache<DayView>(`day:${date}`);
    if (copy) show(copy, "loaded");
    else if (!shown.current) show(null, "loading"); // показывать нечего — честный лоадер

    getDay(date)
      .then((d) => {
        if (awaiting.current !== date) return;
        memo.current[date] = d;
        show(d, "loaded");
        writeCache(`day:${date}`, d);
      })
      .catch(() => {
        if (awaiting.current !== date || copy) return;
        setStatus("error");
      });
  }, [date, nonce, show]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { day, status, retry };
}
