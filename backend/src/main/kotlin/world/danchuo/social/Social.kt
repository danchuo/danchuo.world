/**
 * Feature-слайс **social** (PRD §3.1, §5.8) — наполнен в M4.
 *
 * `SocialLink` (соцссылки) и `Artifact` (предметы marquee — картинка + подпись + дата
 * первого упоминания) → репозитории ([SocialLinkRepository]/[ArtifactRepository]) →
 * `GET /api/social-links` и `GET /api/artifacts` ([SocialResource]). Data-driven: новый
 * артефакт/ссылка = запись. Сид/схема — `db/changelog/changes/0070-social.xml`.
 */
package world.danchuo.social
