/**
 * Пакет **core** — сквозные соглашения danchuo.world (PRD §3.1, §4; CLAUDE.md).
 *
 * Здесь живёт только то, что общее для всех feature-слайсов и не принадлежит
 * ни одному из них:
 * - [world.danchuo.core.security.IngestAuthFilter] — bearer-защита `/api/ingest/…`;
 *   все `GET` публичны.
 * - [world.danchuo.core.config.TimeConfig] / [world.danchuo.core.config.MskTime] —
 *   канон MSK (UTC+3) + генезис-дата.
 * - пакет `core.cache` — общий кэш-вайринг (Caffeine, in-process).
 *
 * Принцип open/closed: `core` закрыт на правку, открыт на использование.
 * Новая фича = новый слайс рядом ([world.danchuo.days] и т.п.), `core` не трогается.
 */
package world.danchuo.core
