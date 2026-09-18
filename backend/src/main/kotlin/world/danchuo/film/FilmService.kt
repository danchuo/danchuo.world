package world.danchuo.film

import io.quarkus.narayana.jta.QuarkusTransaction
import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import java.nio.file.Path
import java.time.Instant
import java.time.LocalDate
import java.util.zip.ZipFile

/**
 * Photo-drop orchestration (B1, PRD §5.12): zip upload (unpack, resize, storage, DB), cover
 * choice, deletion, projection assembly. The slice stays vertical — the core knows nothing of the
 * storage or the image processing. A frame key is `"{dropId}/{sortOrder}"`.
 */
@ApplicationScoped
class FilmService(
    private val drops: FilmDropRepository,
    private val photos: FilmPhotoRepository,
    private val storage: PhotoStorage,
    private val imaging: FilmImaging,
    private val detections: ArtifactDetectionRepository,
    private val artifacts: world.danchuo.social.ArtifactRepository,
) {

    // -- Upload --

    /**
     * Builds a drop from a zip: every supported frame is resized into web+thumb, stored and
     * written as a row, unusable files skipped. The heavy work stays OUTSIDE the DB transaction —
     * one transaction spanning hundreds of MB hits the manager's 60s timeout and rolls back.
     */
    fun upload(zipPath: Path, title: String, droppedOn: LocalDate): UploadResultView {
        // 1) Short transaction: the drop row, giving us the id the storage keys need.
        val dropId = QuarkusTransaction.requiringNew().call<Long> {
            val drop = FilmDrop().apply {
                this.title = title.trim()
                this.droppedOn = droppedOn
                this.monthLabel = monthLabel(droppedOn)
                this.photoCount = 0
                this.createdAt = Instant.now()
            }
            drops.persist(drop)
            drop.id!!
        }

        try {
            // 2) No transaction: unpack, resize and write files to storage — this is the slow part.
            var seq = 0
            var skipped = 0
            val frames = mutableListOf<FrameMeta>()
            ZipFile(zipPath.toFile()).use { zip ->
                val imageEntries = zip.entries().asSequence()
                    .filter { !it.isDirectory && isImageEntry(it.name) }
                    .sortedBy { it.name }
                    .toList()
                for (entry in imageEntries) {
                    val bytes = zip.getInputStream(entry).use { it.readBytes() }
                    val processed = imaging.process(bytes)
                    if (processed == null) {
                        skipped++
                        continue
                    }
                    val key = "$dropId/$seq"
                    storage.put(key, PhotoVariant.WEB, processed.webBytes)
                    storage.put(key, PhotoVariant.THUMB, processed.thumbBytes)
                    frames.add(FrameMeta(seq, processed.width, processed.height))
                    seq++
                }
            }

            // 3) Short transaction: frame rows, the counter and the default cover.
            return QuarkusTransaction.requiringNew().call {
                for (f in frames) {
                    photos.persist(
                        FilmPhoto().apply {
                            this.dropId = dropId
                            this.sortOrder = f.seq
                            this.width = f.width
                            this.height = f.height
                        },
                    )
                }
                val drop = drops.findById(dropId)!!
                drop.photoCount = frames.size
                if (frames.isNotEmpty()) drop.coverPhotoId = photos.listByDrop(dropId).first().id
                UploadResultView(adminDropView(drop), processed = frames.size, skipped = skipped)
            }
        } catch (e: Exception) {
            // Rollback: clean storage files and the drop row, each in its own short transaction.
            runCatching {
                QuarkusTransaction.requiringNew().run(Runnable {
                    drops.findById(dropId)?.let {
                        photos.deleteByDrop(dropId)
                        drops.delete(it)
                    }
                })
            }
            storage.deleteDrop(dropId)
            throw e
        }
    }

    /** Metadata of a processed frame, gathered outside the transaction and written in one block. */
    private data class FrameMeta(val seq: Int, val width: Int?, val height: Int?)

    // -- Management --

    /**
     * Marks a frame as the cover. `null` when the drop is not found (404). Throws
     * [IllegalArgumentException] when the frame is not this drop's (400).
     */
    @Transactional
    fun setCover(dropId: Long, photoId: Long): AdminDropView? {
        val drop = drops.findById(dropId) ?: return null
        val photo = photos.findById(photoId)
        require(photo != null && photo.dropId == dropId) { "photo_not_in_drop" }
        drop.coverPhotoId = photoId
        return adminDropView(drop)
    }

    /**
     * Deletes one frame, row and files alike, and returns the refreshed list. `null` = no such
     * drop, [IllegalArgumentException] = the frame belongs to another one. Remaining `sortOrder`s
     * are NOT renumbered: holes are harmless and storage keys stay stable. No originals, no undo.
     */
    @Transactional
    fun deletePhoto(dropId: Long, photoId: Long): List<AdminPhotoView>? {
        val drop = drops.findById(dropId) ?: return null
        val photo = photos.findById(photoId)
        require(photo != null && photo.dropId == dropId) { "photo_not_in_drop" }
        val key = photo.storageKey
        photos.delete(photo)
        val remaining = photos.listByDrop(dropId)
        if (drop.coverPhotoId == photoId) drop.coverPhotoId = remaining.firstOrNull()?.id
        drop.photoCount = remaining.size
        storage.delete(key)
        return remaining.map { p ->
            AdminPhotoView(
                id = p.id!!,
                thumbUrl = mediaUrl(p, PhotoVariant.THUMB),
                imageUrl = mediaUrl(p, PhotoVariant.WEB),
                isCover = p.id == drop.coverPhotoId,
                orientation = p.orientationApplied,
            )
        }
    }

    /** Deletes a drop: frames from the DB, the drop row, files from storage. `false` when absent. */
    @Transactional
    fun delete(dropId: Long): Boolean {
        val drop = drops.findById(dropId) ?: return false
        photos.deleteByDrop(dropId)
        drops.delete(drop)
        storage.deleteDrop(dropId)
        return true
    }

    // -- Projections (public) --

    fun publicList(): List<FilmDropView> = drops.listOrdered().map { drop ->
        FilmDropView(
            id = drop.id!!,
            title = drop.title,
            droppedOn = drop.droppedOn.toString(),
            monthLabel = drop.monthLabel,
            photoCount = drop.photoCount,
            coverPhotoUrl = coverThumbUrl(drop),
        )
    }

    /** A drop's frames for the modal; `null` when the drop is not found (404). */
    fun publicPhotos(dropId: Long): List<FilmPhotoView>? {
        drops.findById(dropId) ?: return null
        val frames = photos.listByDrop(dropId)
        // Findings and artifact names: two queries for the whole drop, not per frame (N+1).
        val boxes = detections.listVisibleByPhotos(frames.mapNotNull { it.id })
            .groupBy { it.photoId }
        // Not just the name: the box tooltip also needs the item's catalogue picture.
        val known = artifacts.listAll().associateBy { it.id }
        return frames.map { p ->
            FilmPhotoView(
                imageUrl = mediaUrl(p, PhotoVariant.WEB),
                thumbUrl = mediaUrl(p, PhotoVariant.THUMB),
                width = p.width,
                height = p.height,
                artifacts = boxes[p.id].orEmpty().mapNotNull { d ->
                    known[d.artifactId]?.let { a ->
                        ArtifactBoxView(
                            d.artifactId, a.name, a.imageUrl, a.rotatable, a.model3dUrl,
                            d.x0, d.y0, d.x1, d.y1,
                        )
                    }
                },
            )
        }
    }

    // -- Projections (admin) --

    fun listAdmin(): List<AdminDropView> = drops.listOrdered().map(::adminDropView)

    /** A drop's frames for the admin cover-picking grid; `null` when the drop is not found. */
    fun adminPhotos(dropId: Long): List<AdminPhotoView>? {
        val drop = drops.findById(dropId) ?: return null
        val frames = photos.listByDrop(dropId)
        // Admin needs the findings to show what was found and to let the owner remove extras.
        val boxes = detections.listVisibleByPhotos(frames.mapNotNull { it.id })
            .groupBy { it.photoId }
        val known = artifacts.listAll().associateBy { it.id }
        return frames.map { p ->
            AdminPhotoView(
                id = p.id!!,
                thumbUrl = mediaUrl(p, PhotoVariant.THUMB),
                imageUrl = mediaUrl(p, PhotoVariant.WEB),
                isCover = p.id == drop.coverPhotoId,
                orientation = p.orientationApplied,
                artifacts = boxes[p.id].orEmpty().mapNotNull { d ->
                    known[d.artifactId]?.let { a ->
                        ArtifactBoxView(
                            d.artifactId, a.name, a.imageUrl, a.rotatable, a.model3dUrl,
                            d.x0, d.y0, d.x1, d.y1,
                        )
                    }
                },
            )
        }
    }

    // -- Internal --

    private fun adminDropView(d: FilmDrop) = AdminDropView(
        id = d.id!!,
        title = d.title,
        droppedOn = d.droppedOn.toString(),
        monthLabel = d.monthLabel,
        photoCount = d.photoCount,
        coverPhotoId = d.coverPhotoId,
    )

    private fun coverThumbUrl(drop: FilmDrop): String? {
        val cover = drop.coverPhotoId?.let { photos.findById(it) }
            ?: photos.listByDrop(drop.id!!).firstOrNull()
            ?: return null
        return mediaUrl(cover, PhotoVariant.THUMB)
    }

    /**
     * URL of a frame variant. Frames are cached as immutable (30 days in [FilmMediaResource]), but
     * straightening the orientation (B9) rewrites the bytes — the URL then carries a `?v=` version
     * off [FilmPhoto.rotatedAt] and caches fetch the fresh file.
     */
    private fun mediaUrl(p: FilmPhoto, variant: PhotoVariant): String {
        val base = storage.url(p.storageKey, variant)
        val version = p.rotatedAt?.epochSecond ?: return base
        return "$base?v=$version"
    }

    private fun isImageEntry(name: String): Boolean {
        val base = name.substringAfterLast('/')
        if (base.startsWith(".") || name.startsWith("__MACOSX")) return false
        val ext = base.substringAfterLast('.', "").lowercase()
        return ext in IMAGE_EXTS
    }

    private fun monthLabel(date: LocalDate): String = "${MONTHS[date.monthValue - 1]} ${date.year}"

    private companion object {
        val IMAGE_EXTS = setOf("jpg", "jpeg", "png", "gif", "bmp", "tif", "tiff", "webp", "heic")
        val MONTHS = listOf(
            "январь", "февраль", "март", "апрель", "май", "июнь",
            "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
        )
    }
}
