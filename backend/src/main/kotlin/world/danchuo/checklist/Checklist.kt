/**
 * Feature-слайс **checklist** (PRD §3.1, §5.6).
 *
 * M1 (готово): `ChecklistItem` (пункты дисциплины, data-driven: новый = строка в БД)
 * + `ChecklistEntry` (прогресс `0..target`) + `POST /api/ingest/daily` — имя дня,
 * прогресс пунктов и вкус монстра в один тап. Пункт `monster` — производная от выбора
 * вкуса (§5.6). Имя дня и вкус пишутся на `DayRecord` через `days`, вкус резолвится в `monster`.
 */
package world.danchuo.checklist
