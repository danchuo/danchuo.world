package world.danchuo.film

import io.quarkus.narayana.jta.QuarkusTransaction
import jakarta.annotation.PreDestroy
import jakarta.enterprise.context.ApplicationScoped
import org.jboss.logging.Logger
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/**
 * Orchestrates the frame-orientation check: background runs in a single worker, so drops go
 * strictly in turn under the provider's shared rate limit, applying [OrientationDecider]'s verdict
 * to storage and DB. A frame whose LLM was unavailable stays unchecked for the next run. PRD §9
 */
@ApplicationScoped
class FilmOrientationService(
    private val drops: FilmDropRepository,
    private val photos: FilmPhotoRepository,
    private val storage: PhotoStorage,
    private val imaging: FilmImaging,
    private val decider: OrientationDecider,
) {

    private val log = Logger.getLogger(FilmOrientationService::class.java)

    private val executor = Executors.newSingleThreadExecutor { r ->
        Thread(r, "film-orientation").apply { isDaemon = true }
    }

    /** The drop's last pass (running/done/failed); no history is kept, only the current status. */
    private val jobs = ConcurrentHashMap<Long, OrientationJob>()

    @PreDestroy
    fun shutdown() {
        executor.shutdownNow()
    }

    // -- Public slice API --

    /**
     * Starts the background check of a drop's unchecked frames. Idempotent: a running pass is not
     * duplicated, its status is returned instead. `null` when the drop is not found.
     */
    fun start(dropId: Long): OrientationStatusView? {
        drops.findById(dropId) ?: return null
        val job = jobs.compute(dropId) { _, existing ->
            if (existing != null && existing.state == "running") {
                existing
            } else {
                val pending = photos.listByDrop(dropId).count { it.orientationCheckedAt == null }
                OrientationJob(total = pending).also { fresh ->
                    if (pending == 0) {
                        fresh.state = "done"
                    } else {
                        executor.execute { run(dropId, fresh) }
                    }
                }
            }
        }!!
        return job.view()
    }

    /** Whether a pass is running for the drop — the gate for frame mutations. */
    fun isRunning(dropId: Long): Boolean = jobs[dropId]?.state == "running"

    /** Check status: the running or last pass, else a snapshot off the DB. `null` when no drop. */
    fun status(dropId: Long): OrientationStatusView? {
        drops.findById(dropId) ?: return null
        jobs[dropId]?.let { return it.view() }
        val all = photos.listByDrop(dropId)
        return OrientationStatusView(
            state = "idle",
            total = all.size,
            checked = all.count { it.orientationCheckedAt != null },
            rotated = all.count { it.rotatedAt != null },
            skipped = 0,
        )
    }

    /**
     * Manual frame rotation from the admin UI (an override of the LLM). Throws
     * [IllegalStateException] while a pass is running on the drop, since they would race for the
     * same bytes, and [IllegalArgumentException] when the frame is not this drop's.
     */
    fun rotateManually(dropId: Long, photoId: Long, rotation: FrameRotation): Boolean {
        check(jobs[dropId]?.state != "running") { "orientation_running" }
        // Validation runs in a short transaction so the frame entity does not settle in the
        // request session: the write is a separate transaction, and the reply would otherwise
        // read a pre-rotation snapshot out of the L1 session cache.
        val key = tx {
            if (drops.findById(dropId) == null) return@tx null
            val photo = photos.findById(photoId) ?: return@tx null
            require(photo.dropId == dropId) { "photo_not_in_drop" }
            photo.storageKey
        } ?: return false
        return rotateStored(photoId, key, rotation, applied = "manual")
    }

    // -- Background pass --

    private fun run(dropId: Long, job: OrientationJob) {
        try {
            val pending = tx {
                photos.listByDrop(dropId)
                    .filter { it.orientationCheckedAt == null }
                    .map { it.id!! }
            }
            for (photoId in pending) {
                processFrame(photoId, job)
            }
            job.state = "done"
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            job.state = "failed"
        } catch (e: Exception) {
            log.error("прогон ориентации дропа $dropId упал", e)
            job.state = "failed"
        }
    }

    private fun processFrame(photoId: Long, job: OrientationJob) {
        // A fresh snapshot: the frame may have been deleted or rotated while the pass queued.
        val key = tx {
            photos.findById(photoId)?.takeIf { it.orientationCheckedAt == null }?.storageKey
        } ?: return
        val thumb = storage.get(key, PhotoVariant.THUMB)
        if (thumb == null) {
            job.skipped.incrementAndGet()
            return
        }
        when (val decision = decider.decide(thumb)) {
            OrientationDecision.Unavailable -> job.skipped.incrementAndGet()
            OrientationDecision.Upright -> {
                markChecked(photoId, applied = "none")
                job.checked.incrementAndGet()
            }
            OrientationDecision.Ambiguous -> {
                markChecked(photoId, applied = "ambiguous")
                job.checked.incrementAndGet()
            }
            is OrientationDecision.Rotate -> {
                if (rotateStored(photoId, key, decision.rotation, applied = decision.rotation.code)) {
                    job.rotated.incrementAndGet()
                    job.checked.incrementAndGet()
                } else {
                    job.skipped.incrementAndGet()
                }
            }
        }
    }

    // -- Applying --

    /**
     * Rotates the stored web and thumb variants and records the result. Bytes are written before
     * the mark: should the process die between them, the next pass sees an upright frame and
     * simply marks it.
     */
    private fun rotateStored(photoId: Long, key: String, rotation: FrameRotation, applied: String): Boolean {
        val web = storage.get(key, PhotoVariant.WEB)?.let { imaging.rotate(it, rotation) }
        val thumb = storage.get(key, PhotoVariant.THUMB)?.let { imaging.rotate(it, rotation) }
        if (web == null || thumb == null) return false
        storage.put(key, PhotoVariant.WEB, web)
        storage.put(key, PhotoVariant.THUMB, thumb)
        tx {
            photos.findById(photoId)?.let { photo ->
                if (rotation.swapsDimensions) {
                    val w = photo.width
                    photo.width = photo.height
                    photo.height = w
                }
                photo.orientationCheckedAt = Instant.now()
                photo.orientationApplied = applied
                photo.rotatedAt = Instant.now()
            }
        }
        return true
    }

    private fun markChecked(photoId: Long, applied: String) {
        tx {
            photos.findById(photoId)?.let { photo ->
                photo.orientationCheckedAt = Instant.now()
                photo.orientationApplied = applied
            }
        }
    }

    private fun <T> tx(block: () -> T): T = QuarkusTransaction.requiringNew().call(block)

    /** Counters of the running pass (read by the admin UI's status polling). */
    private class OrientationJob(val total: Int) {
        val checked = AtomicInteger()
        val rotated = AtomicInteger()
        val skipped = AtomicInteger()

        @Volatile
        var state: String = "running"

        fun view() = OrientationStatusView(
            state = state,
            total = total,
            checked = checked.get(),
            rotated = rotated.get(),
            skipped = skipped.get(),
        )
    }
}
