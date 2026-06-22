package world.danchuo.film

/**
 * Проекции фото-дропов (PRD §5.12; DESIGN §7.5). Публичные — на чтение борда/архива/модалки;
 * админские — под bearer для управления через /admin (B1). URL-ы вариантов кадров строит
 * [PhotoStorage] из ключа, поэтому проекции собираются в ресурсах (а не в `from`-фабрике).
 */

/** Дроп для тизер-тайла/архива: подпись + обложка-thumb + число кадров. */
data class FilmDropView(
    val id: Long,
    val title: String,
    val droppedOn: String,
    val monthLabel: String?,
    val photoCount: Int,
    /** Thumb-URL кадра-обложки (или `null`, если кадров нет). */
    val coverPhotoUrl: String?,
)

/** Кадр дропа для модалки: [imageUrl] (web) + [thumbUrl] (превью) + размеры для композиции. */
data class FilmPhotoView(
    val imageUrl: String,
    val thumbUrl: String,
    val width: Int?,
    val height: Int?,
)

// ── Админские проекции (за bearer, /api/ingest/drops) ──

/** Дроп в админке: всё для управления, включая текущую обложку. */
data class AdminDropView(
    val id: Long,
    val title: String,
    val droppedOn: String,
    val monthLabel: String?,
    val photoCount: Int,
    val coverPhotoId: Long?,
)

/** Кадр в админ-сетке выбора обложки: id + thumb + признак текущей обложки. */
data class AdminPhotoView(
    val id: Long,
    val thumbUrl: String,
    val isCover: Boolean,
)

/** Итог загрузки zip: созданный дроп + сколько кадров обработано/пропущено (HEIC/битые). */
data class UploadResultView(
    val drop: AdminDropView,
    val processed: Int,
    val skipped: Int,
)
