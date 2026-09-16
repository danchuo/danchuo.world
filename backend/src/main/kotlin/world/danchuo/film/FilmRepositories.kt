package world.danchuo.film

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import io.quarkus.panache.common.Sort
import jakarta.enterprise.context.ApplicationScoped

/** Access to drops, newest first (by drop date, then upload time). */
@ApplicationScoped
class FilmDropRepository : PanacheRepository<FilmDrop> {
    fun listOrdered(): List<FilmDrop> =
        listAll(Sort.by("droppedOn", Sort.Direction.Descending).and("createdAt", Sort.Direction.Descending))

    fun latest(): FilmDrop? = listOrdered().firstOrNull()
}

/** Access to a drop's frames, in [FilmPhoto.sortOrder]. */
@ApplicationScoped
class FilmPhotoRepository : PanacheRepository<FilmPhoto> {
    fun listByDrop(dropId: Long): List<FilmPhoto> =
        list("dropId", Sort.by("sortOrder"), dropId)

    /** Deletes a drop's frames from the DB (the service cleans the storage files). */
    fun deleteByDrop(dropId: Long): Long = delete("dropId", dropId)
}

/** Access to artifact findings on frames (PRD §5.12). */
@ApplicationScoped
class ArtifactDetectionRepository : PanacheRepository<ArtifactDetection> {

    /** Displayable findings: ones the owner rejected are drawn neither publicly nor in admin. */
    fun listVisibleByPhotos(photoIds: Collection<Long>): List<ArtifactDetection> =
        if (photoIds.isEmpty()) {
            emptyList()
        } else {
            list("photoId in ?1 and source <> ?2", photoIds, ArtifactDetection.SOURCE_REJECTED)
        }

    fun listByPhoto(photoId: Long): List<ArtifactDetection> = list("photoId", photoId)

    /**
     * Clears the model's findings for a frame but keeps manual ones: a re-run must not wipe an
     * edit made by hand (the same precedence a manual tick has over a derived one).
     */
    fun deleteLlmByPhoto(photoId: Long): Long =
        delete("photoId = ?1 and source = ?2", photoId, ArtifactDetection.SOURCE_LLM)

    /**
     * The same for one item only: a pass started for a new artifact must not touch the others'
     * findings. The model is non-deterministic, and a blanket clear would erase good boxes on
     * neighbouring items nobody asked to recheck.
     */
    fun deleteLlmByPhotoAndArtifact(photoId: Long, artifactId: Long): Long =
        delete(
            "photoId = ?1 and artifactId = ?2 and source = ?3",
            photoId,
            artifactId,
            ArtifactDetection.SOURCE_LLM,
        )

    fun findOne(photoId: Long, artifactId: Long): ArtifactDetection? =
        find("photoId = ?1 and artifactId = ?2", photoId, artifactId).firstResult()
}
