"use client";

import { useEffect, useState } from "react";

/**
 * Указатель без ховера — телефон/планшет, а не мышь.
 *
 * Тот же сигнал, по которому борд выбирает режим (DESIGN §8): спрашиваем про **указатель**, а
 * не про ширину окна. Узкое окно на десктопе остаётся десктопом, а планшет с большим экраном —
 * тачем; ширина отвечала бы не на тот вопрос.
 *
 * Развилка живёт в JS, а не в CSS, там, где отличается **разметка**, а не оформление: на мыши
 * рамок находок в полноэкранном кадре нет вовсе, и прятать их стилем значило бы держать в DOM
 * то, чего нет на экране (в том числе для скринридера). Подписка на изменение обязательна —
 * к планшету подключают мышь, и наоборот.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => matches());

  useEffect(() => {
    const mql = window.matchMedia?.(QUERY);
    if (!mql) return;
    const sync = () => setCoarse(mql.matches);
    sync(); // между первым рендером и эффектом среда могла измениться
    mql.addEventListener?.("change", sync);
    return () => mql.removeEventListener?.("change", sync);
  }, []);

  return coarse;
}

const QUERY = "(hover: none), (pointer: coarse)";

/** `false` на сервере и там, где `matchMedia` нет: мышь — безопасный дефолт. */
function matches(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.(QUERY).matches === true;
}
