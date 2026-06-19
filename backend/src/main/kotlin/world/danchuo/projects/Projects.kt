/**
 * Feature-слайс **projects** (PRD §3.1, §5.7) — наполнен в M4.
 *
 * `Project` (сущность, data-driven) → `ProjectRepository` (публичный шов) → `ProjectView`
 * → `GET /api/projects` ([ProjectsResource]). Наполняется сидом/API; новый проект = запись,
 * не код. Сид/схема — `db/changelog/changes/0060-project.xml`.
 */
package world.danchuo.projects
