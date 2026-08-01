package world.danchuo.film

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import io.quarkus.panache.common.Sort
import jakarta.enterprise.context.ApplicationScoped

/** Доступ к дропам — новые сверху (по дате дропа, затем по времени загрузки). */
@ApplicationScoped
class FilmDropRepository : PanacheRepository<FilmDrop> {
    fun listOrdered(): List<FilmDrop> =
        listAll(Sort.by("droppedOn", Sort.Direction.Descending).and("createdAt", Sort.Direction.Descending))

    /** Последний (самый свежий) дроп — для тайла-тизера (показывает только его). */
    fun latest(): FilmDrop? = listOrdered().firstOrNull()
}

/** Доступ к кадрам дропа — в порядке [FilmPhoto.sortOrder]. */
@ApplicationScoped
class FilmPhotoRepository : PanacheRepository<FilmPhoto> {
    fun listByDrop(dropId: Long): List<FilmPhoto> =
        list("dropId", Sort.by("sortOrder"), dropId)

    /** Удалить кадры дропа из БД (файлы из хранилища чистит сервис). */
    fun deleteByDrop(dropId: Long): Long = delete("dropId", dropId)
}

/** Доступ к находкам артефактов на кадрах (PRD §5.12). */
@ApplicationScoped
class ArtifactDetectionRepository : PanacheRepository<ArtifactDetection> {

    fun listByPhotos(photoIds: Collection<Long>): List<ArtifactDetection> =
        if (photoIds.isEmpty()) emptyList() else list("photoId in ?1", photoIds)

    /** Показываемые находки: отклонённые владельцем не рисуются ни публично, ни в админке. */
    fun listVisibleByPhotos(photoIds: Collection<Long>): List<ArtifactDetection> =
        if (photoIds.isEmpty()) {
            emptyList()
        } else {
            list("photoId in ?1 and source <> ?2", photoIds, ArtifactDetection.SOURCE_REJECTED)
        }

    fun listByPhoto(photoId: Long): List<ArtifactDetection> = list("photoId", photoId)

    /**
     * Снести находки модели по кадру, ручные — оставить: перепрогон не должен затирать правку,
     * сделанную руками (тот же приоритет, что у ручной галочки над производной).
     */
    fun deleteLlmByPhoto(photoId: Long): Long =
        delete("photoId = ?1 and source = ?2", photoId, ArtifactDetection.SOURCE_LLM)

    fun deleteByPhotos(photoIds: Collection<Long>): Long =
        if (photoIds.isEmpty()) 0 else delete("photoId in ?1", photoIds)

    fun findOne(photoId: Long, artifactId: Long): ArtifactDetection? =
        find("photoId = ?1 and artifactId = ?2", photoId, artifactId).firstResult()
}
