/**
 * Feature-слайс **checklist** (PRD §3.1, §5.6) — пустой шов M0.
 *
 * Зона ответственности (M1): `ChecklistItem` (пункты дисциплины, расширяемые
 * записью в БД без релиза) + `ChecklistEntry` (отметки дня), идемпотентный
 * `ingest/daily` за bearer. Data-driven шов: новый пункт = строка в БД, не код.
 */
package world.danchuo.checklist
