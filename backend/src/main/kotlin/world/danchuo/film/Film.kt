/**
 * Feature-слайс **film** (PRD §5.12, §7; DESIGN §7.5) — фото-дропы (B1 реализован).
 *
 * Фото выкладываются дропами (≈36 кадров за день, как альбом-событие). Канал загрузки — /admin
 * (PRD §9 п.7): zip с кадрами за bearer, ~36 файлов нельзя залить iOS-шорткатом. Загрузка
 * распаковывает zip, ресайзит каждый кадр в web+thumb ([FilmImaging], с учётом EXIF-поворота),
 * кладёт в [PhotoStorage] (локальный диск, позже S3/R2) и пишет строки в БД ([FilmService]).
 *
 * Слои: `FilmDrop`/`FilmPhoto` (`width/height` web-варианта для justified-композиции) →
 * репозитории → [FilmService] → ресурсы: публичные [FilmResource] (`/api/drops*`) и
 * [FilmMediaResource] (раздача кадров), приватный [FilmAdminResource] (`/api/ingest/drops*`).
 * До первой загрузки эндпоинты отдают пусто/404 — борд не ломается. Слайс вертикальный:
 * хранилище и обработка изображений не торчат в ядро (§3.1 guardrail).
 */
package world.danchuo.film
