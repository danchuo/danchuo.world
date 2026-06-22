import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Размонтируем дерево между тестами — изоляция DOM. Чистим localStorage, чтобы кэш тайлов
// (stale-while-revalidate) одного теста не подменял пустое/ошибочное состояние в другом.
afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    /* без jsdom-localStorage — ничего чистить */
  }
});
