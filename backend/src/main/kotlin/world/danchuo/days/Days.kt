/**
 * Feature-слайс **days** (вертикальный слайс, PRD §3.1).
 *
 * M1 (готово): `DayRecord` (ось данных — дата в MSK) + `DayRecordService` —
 * единая точка записи дня (find-or-create, генезис-гард, `updatedAt`), через неё
 * пишут `health` и `checklist`.
 *
 * M2 (готово, бэкенд): агрегатор дня [DayAggregator] + публичные `GET /api/days/{date}`
 * (полная проекция [DayView]) и `GET /api/days?from=&to=` (сводки [DaySummary] для
 * календаря/мини-графика). Агрегатор читает соседей (`health`/`checklist`)
 * через их публичные репозитории. Впереди (M2, фронт): Next.js-каркас, плитка
 * «Сегодня» и календарь поверх этого контракта.
 *
 * Рецепт наполнения (§3.1), не трогая `core`/соседей: сущность + Liquibase-чейнджлог
 * в `db/changelog/changes/` → публичные `GET` → (если телефон пушит) идемпотентный
 * `ingest/…` за bearer ([world.danchuo.core.security.IngestAuthFilter]) → кэш и его
 * инвалидация при ingest. Канон дат — MSK ([world.danchuo.core.config.MskTime]).
 */
package world.danchuo.days
