import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Размонтируем дерево между тестами — изоляция DOM.
afterEach(() => cleanup());
