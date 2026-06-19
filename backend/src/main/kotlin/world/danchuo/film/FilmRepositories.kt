package world.danchuo.film

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import io.quarkus.panache.common.Sort
import jakarta.enterprise.context.ApplicationScoped

/** Доступ к дропам — новые сверху (по дате дропа, затем [FilmDrop.sortOrder]). */
@ApplicationScoped
class FilmDropRepository : PanacheRepository<FilmDrop> {
    fun listOrdered(): List<FilmDrop> =
        listAll(Sort.by("droppedOn", Sort.Direction.Descending).and("sortOrder", Sort.Direction.Ascending))
}

/** Доступ к кадрам дропа — в порядке [FilmPhoto.sortOrder]. */
@ApplicationScoped
class FilmPhotoRepository : PanacheRepository<FilmPhoto> {
    fun listByDrop(dropId: Long): List<FilmPhoto> =
        list("dropId", Sort.by("sortOrder"), dropId)
}
