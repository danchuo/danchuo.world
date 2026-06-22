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
