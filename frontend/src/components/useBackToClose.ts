"use client";

import { useEffect, useRef } from "react";

/** Метка нашей записи в истории: номер слоя, считая от страницы (первое окно — 1). */
const DEPTH_KEY = "danchuoOverlay";

const depthOf = (state: unknown): number => {
  const value = (state as Record<string, unknown> | null)?.[DEPTH_KEY];
  return typeof value === "number" ? value : 0;
};

/**
 * Системное «Назад» закрывает всплывшее окно, а не уводит с сайта (DESIGN §9, PRD §5.10).
 *
 * На телефоне кнопка «Назад» — главный способ отменить действие, и пока открытое окно не попадало
 * в историю, браузеру нечего было отменять: из галереи дропа зритель вылетал с сайта целиком.
 * Открываясь, окно кладёт в историю свою запись, и «Назад» её снимает — а слушатель `popstate`
 * переводит это в закрытие.
 *
 * **Слои считаются глубиной, а не флагом.** Окон бывает несколько друг над другом (кадр во весь
 * экран поверх галереи), и каждое кладёт свою запись. В `popstate` приезжает состояние той
 * записи, к которой вернулись: слой закрывается, только если вернулись НИЖЕ него. Без этого
 * снятие верхнего слоя крестиком (мы сами делаем шаг назад) читалось бы нижним как «нажали
 * Назад», и одно закрытие схлопывало бы все окна разом.
 *
 * Закрытие не кнопкой (крестик, `Esc`, клик по фону) снимает свою запись само — иначе она висит
 * в истории, и следующее «Назад» уходит в пустой шаг: зритель жмёт кнопку, а на экране ничего.
 */
export function useBackToClose(open: boolean, onClose: () => void) {
  // Обработчик читаем из рефа: `onClose` у вызывающих обычно стрелка на месте, и без рефа
  // эффект переподписывался бы на каждый рендер — то есть снимал и снова клал запись в историю.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const depth = depthOf(window.history.state) + 1;
    // Своё поле добавляем К существующему состоянию: там лежит служебное хозяйство роутера,
    // и затирать его нельзя — по нему он узнаёт свои же записи.
    window.history.pushState({ ...(window.history.state as object | null), [DEPTH_KEY]: depth }, "");

    let popped = false;
    const onPop = (e: PopStateEvent) => {
      if (depthOf(e.state) >= depth) return; // вернулись не ниже нас — закрывать нечего
      popped = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!popped) window.history.back();
    };
  }, [open]);
}
