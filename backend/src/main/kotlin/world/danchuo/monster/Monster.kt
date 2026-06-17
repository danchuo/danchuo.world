/**
 * Feature-слайс **monster** (PRD §3.1, §5.6; DESIGN §6).
 *
 * M1 (готово): `MonsterFlavor` — вкусы энергетика (data-driven: новый вкус = запись
 * в БД), у каждого `accentColor` для пиксель-метки дня. Резолв по ключу из `ingest/daily`
 * (`checklist`). «Монстр дня» = выбранный вкус либо «не пил»; день в цвет вкуса не красится.
 */
package world.danchuo.monster
