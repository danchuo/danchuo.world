package world.danchuo.film

import com.fasterxml.jackson.annotation.JsonProperty
import io.quarkus.runtime.annotations.RegisterForReflection

/**
 * Проекции фото-дропов (PRD §5.12; DESIGN §7.5). Публичные — на чтение борда/архива/модалки;
 * админские — под bearer для управления через /admin (B1). URL-ы вариантов кадров строит
 * [PhotoStorage] из ключа, поэтому проекции собираются в ресурсах (а не в `from`-фабрике).
 */

/** Дроп для тизер-тайла/архива: подпись + обложка-thumb + число кадров. */
// Response-wrapped views need explicit reflection registration for native-image (else {} in JSON).
@RegisterForReflection
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
@RegisterForReflection
data class FilmPhotoView(
    val imageUrl: String,
    val thumbUrl: String,
    val width: Int?,
    val height: Int?,
)

// ── Админские проекции (за bearer, /api/ingest/drops) ──

/** Дроп в админке: всё для управления, включая текущую обложку. */
@RegisterForReflection
data class AdminDropView(
    val id: Long,
    val title: String,
    val droppedOn: String,
    val monthLabel: String?,
    val photoCount: Int,
    val coverPhotoId: Long?,
)

/** Кадр в админ-сетке выбора обложки: id + thumb + признак текущей обложки. */
@RegisterForReflection
data class AdminPhotoView(
    val id: Long,
    val thumbUrl: String,
    // Runtime Jackson has no Kotlin module (test-only dep) and strips the "is" prefix from
    // boolean getters — pin the wire name to what the frontend type expects.
    @get:JsonProperty("isCover")
    val isCover: Boolean,
    /** Итог проверки поворота (B9): `none`/`cw90`/`ccw90`/`r180`/`ambiguous`/`manual`, `null` — не проверялся. */
    val orientation: String?,
)

/** Статус проверки поворота дропа (B9): поллится админкой, пока `state == "running"`. */
@RegisterForReflection
data class OrientationStatusView(
    /** `idle` (не запускалась) / `running` / `done` / `failed`. */
    val state: String,
    /** Сколько кадров было непроверенных на старте прогона (или всего кадров при `idle`). */
    val total: Int,
    val checked: Int,
    val rotated: Int,
    /** Пропущено (LLM молчала/битые байты) — останутся непроверенными до следующего прогона. */
    val skipped: Int,
)

/** Итог загрузки zip: созданный дроп + сколько кадров обработано/пропущено (HEIC/битые). */
@RegisterForReflection
data class UploadResultView(
    val drop: AdminDropView,
    val processed: Int,
    val skipped: Int,
)
