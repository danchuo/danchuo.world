/**
 * Feature-слайс **checklist** (PRD §3.1, §5.6).
 *
 * M1 (готово): `ChecklistItem` (пункты дисциплины, data-driven: новый = строка в БД)
 * + `ChecklistEntry` (прогресс `0..target`) + `POST /api/ingest/daily` — имя дня,
 * прогресс пунктов и монстр в один тап. Пункт `monster` ведётся своим полем приёма, а не
 * счётчиком в `items` (§5.6). Имя дня пишется на `DayRecord` через `days`.
 */
package world.danchuo.checklist
