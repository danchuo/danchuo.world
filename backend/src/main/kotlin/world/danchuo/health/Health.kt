/**
 * Feature-слайс **health** (PRD §3.1).
 *
 * M1 (готово): `Workout` + `POST /api/ingest/health` — шаги/сон/фазы сна на `DayRecord`
 * (через [world.danchuo.days.DayRecordService]) и тренировки дня. Идемпотентно: статы
 * upsert по дате, тренировки заменяются набором (Health отдаёт весь день). Сон относится
 * ко дню пробуждения; null ≠ 0 (§5.4); канон MSK.
 *
 * Заметка: экранное время Apple программно недоступно — сущность/эндпоинт не заводим
 * (PRD §9 B2, guardrail §3.1); ручное поле `screenTimeMinutes` живёт в `days`.
 */
package world.danchuo.health
