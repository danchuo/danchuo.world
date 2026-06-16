/**
 * Feature-слайс **days** (вертикальный слайс, PRD §3.1) — пустой шов M0.
 *
 * Зона ответственности (наполняется в M1): `DayRecord`, агрегатор дня,
 * публичные `GET /api/days*` (источник плитки «Сегодня» и календаря).
 *
 * Рецепт наполнения (§3.1), не трогая `core`/соседей: сущность + Liquibase-чейнджлог
 * в `db/changelog/changes/` → публичные `GET` → (если телефон пушит) идемпотентный
 * `ingest/…` за bearer ([world.danchuo.core.security.IngestAuthFilter]) → кэш и его
 * инвалидация при ingest. Канон дат — MSK ([world.danchuo.core.config.MskTime]).
 */
package world.danchuo.days
