package world.danchuo.film

import io.quarkus.narayana.jta.QuarkusTransaction
import jakarta.annotation.PreDestroy
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.jboss.logging.Logger
import world.danchuo.social.ArtifactRepository
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/**
 * Artifact search over a drop's frames: background runs, one drop at a time in a single worker,
 * plus manual box edits from admin. A frame is marked checked ONLY if the model answered — a
 * silent provider must never be recorded as "no artifacts here". Pace and limits: PRD §5.12.
 */
@ApplicationScoped
class ArtifactDetectionService(
    private val drops: FilmDropRepository,
    private val photos: FilmPhotoRepository,
    private val detections: ArtifactDetectionRepository,
    private val artifacts: ArtifactRepository,
    private val storage: PhotoStorage,
    private val detector: ArtifactDetector,
    @param:ConfigProperty(name = "danchuo.film.artifacts.throttle-ms") private val throttleMs: Long,
) {

    private val log = Logger.getLogger(ArtifactDetectionService::class.java)

    private val executor = Executors.newSingleThreadExecutor { r ->
        Thread(r, "film-artifacts").apply { isDaemon = true }
    }

    private val jobs = ConcurrentHashMap<Long, DetectionJob>()

    /**
     * The current whole-archive run: the drop queue goes to the executor at once, so the summary
     * and the cancellation must live above the individual drops rather than inside them.
     */
    @Volatile
    private var archiveRun: ScanRun? = null

    @PreDestroy
    fun shutdown() {
        executor.shutdownNow()
    }

    // -- Public slice API --

    /**
     * Starts the background search over a drop's unchecked frames. Idempotent: a running pass is
     * not duplicated. [recheck] revisits already-checked frames, after artifact descriptions
     * changed or a new item was added. `null` when the drop does not exist.
     */
    fun start(dropId: Long, recheck: Boolean = false, onlyArtifactId: Long? = null): ArtifactScanStatusView? {
        drops.findById(dropId) ?: return null
        val job = jobs.compute(dropId) { _, existing ->
            if (existing != null && existing.state in ACTIVE) {
                existing
            } else {
                val pending = pendingIds(dropId, recheck).size
                DetectionJob(dropId = dropId, total = pending).also { fresh ->
                    if (pending == 0) {
                        fresh.state = "done"
                    } else {
                        executor.execute { execute(dropId, recheck, onlyArtifactId, fresh) }
                    }
                }
            }
        }!!
        return job.view()
    }

    /**
     * Runs EVERY drop — the "added an artifact, look for it in old frames" path. Always a
     * `recheck`, since existing frames already carry the checked mark. Manual only: one paid call
     * per frame across the archive. [onlyArtifactId] narrows the question asked, not the cost.
     */
    fun startAll(onlyArtifactId: Long? = null): ArtifactScanRunView {
        val name = onlyArtifactId?.let { id -> tx { artifacts.findById(id)?.name } }
        require(onlyArtifactId == null || name != null) { "artifact_not_found" }
        val ids = drops.listOrdered().mapNotNull { it.id }
        // A new pass clears the previous cancellation, or it would die before starting.
        val fresh = ScanRun(artifactName = name)
        archiveRun = fresh
        ids.forEach { start(it, recheck = true, onlyArtifactId = onlyArtifactId) }
        fresh.jobs.addAll(ids.mapNotNull { jobs[it] })
        return fresh.view()
    }

    /**
     * Stops the archive pass. A frame begun before the cancellation is finished — there is no
     * point tearing it up mid-write — and the queue is not taken further. Returns `false` when
     * there is nothing to stop. Unchecked frames simply stay unchecked, so data stays consistent.
     */
    fun cancel(): Boolean {
        val current = archiveRun ?: return false
        if (current.view().state != "running") return false
        current.cancelled.set(true)
        return true
    }

    /** Summary of the last archive pass; `idle` when there has not been one. */
    fun runStatus(): ArtifactScanRunView = archiveRun?.view() ?: ScanRun(artifactName = null).view()

    /** Whether a pass is running — the gate for manual box edits, which would otherwise race. */
    fun isRunning(dropId: Long): Boolean = jobs[dropId]?.state in ACTIVE

    /** Status: the running or last pass, else a snapshot off the DB. `null` when no such drop. */
    fun status(dropId: Long): ArtifactScanStatusView? {
        drops.findById(dropId) ?: return null
        jobs[dropId]?.let { return it.view() }
        val all = photos.listByDrop(dropId)
        return ArtifactScanStatusView(
            state = "idle",
            total = all.size,
            checked = all.count { it.artifactsCheckedAt != null },
            found = detections.listVisibleByPhotos(all.mapNotNull { it.id }).size,
            skipped = 0,
        )
    }

    /**
     * Places or moves a box by hand. It overwrites the model's finding for the same frame-artifact
     * pair and marks it manual, so a re-run leaves it alone.
     */
    fun saveManual(dropId: Long, photoId: Long, artifactId: Long, box: BoxInput): Boolean {
        check(!isRunning(dropId)) { "artifacts_running" }
        return tx {
            drops.findById(dropId) ?: return@tx false
            val photo = photos.findById(photoId) ?: return@tx false
            require(photo.dropId == dropId) { "photo_not_in_drop" }
            artifacts.findById(artifactId) ?: return@tx false
            require(box.valid) { "box_invalid" }

            val existing = detections.findOne(photoId, artifactId)
            val row = existing ?: ArtifactDetection().apply {
                this.photoId = photoId
                this.artifactId = artifactId
            }
            row.x0 = box.x0
            row.y0 = box.y0
            row.x1 = box.x1
            row.y1 = box.y1
            row.source = ArtifactDetection.SOURCE_MANUAL
            row.createdAt = Instant.now()
            // The row is filled BEFORE insert: with IDENTITY generation persist writes at once,
            // and an unfilled not-null `source` would fail the insert.
            if (existing == null) detections.persist(row)
            true
        }
    }

    /**
     * Takes a box off a frame. The row is marked `rejected` rather than deleted, or the next run
     * would find the pair again and the box would return; a manual box on the same pair rewrites
     * it back to `manual`. `false` when no such detection exists. PRD §5.12
     */
    fun deleteDetection(dropId: Long, photoId: Long, artifactId: Long): Boolean {
        check(!isRunning(dropId)) { "artifacts_running" }
        return tx {
            val row = detections.findOne(photoId, artifactId) ?: return@tx false
            row.source = ArtifactDetection.SOURCE_REJECTED
            true
        }
    }

    // -- Background pass --

    private fun pendingIds(dropId: Long, recheck: Boolean): List<Long> =
        photos.listByDrop(dropId)
            .filter { recheck || it.artifactsCheckedAt == null }
            .mapNotNull { it.id }

    private fun execute(dropId: Long, recheck: Boolean, onlyArtifactId: Long?, job: DetectionJob) {
        val current = archiveRun
        try {
            // Cancellation is checked before the first frame too: the archive queue goes to the
            // executor at once, and the pass may already have been stopped by drop five.
            if (current?.cancelled?.get() == true) {
                job.state = "cancelled"
                return
            }
            job.state = "running"
            val catalogue = tx { catalogue() }
                .filter { onlyArtifactId == null || it.id == onlyArtifactId }
            val pending = tx { pendingIds(dropId, recheck) }
            for ((index, photoId) in pending.withIndex()) {
                if (current?.cancelled?.get() == true) {
                    job.state = "cancelled"
                    return
                }
                if (index > 0 && throttleMs > 0) Thread.sleep(throttleMs)
                processFrame(photoId, catalogue, onlyArtifactId, job)
            }
            job.state = "done"
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            job.state = "failed"
        } catch (e: Exception) {
            log.error("прогон артефактов дропа $dropId упал", e)
            job.state = "failed"
        }
    }

    private fun processFrame(
        photoId: Long,
        catalogue: List<DetectableArtifact>,
        onlyArtifactId: Long?,
        job: DetectionJob,
    ) {
        val key = tx { photos.findById(photoId)?.storageKey } ?: return
        // The web variant is enough for the model; we keep no originals, and thumb loses prints.
        val bytes = storage.get(key, PhotoVariant.WEB)
        if (bytes == null) {
            job.skipped.incrementAndGet()
            return
        }
        when (val outcome = detector.detect(bytes, catalogue)) {
            // The provider stayed silent — the frame stays unchecked until the next pass.
            DetectionOutcome.Unavailable -> job.skipped.incrementAndGet()
            is DetectionOutcome.Found -> {
                tx {
                    // A single-item pass clears only that item's findings: the others may have
                    // been good, and they were asked about last time, not now.
                    if (onlyArtifactId == null) {
                        detections.deleteLlmByPhoto(photoId)
                    } else {
                        detections.deleteLlmByPhotoAndArtifact(photoId, onlyArtifactId)
                    }
                    // Rows decided by a human remain: manual boxes and rejected findings. A
                    // re-run touches neither, or a removed box would come back.
                    val decided = detections.listByPhoto(photoId).map { it.artifactId }.toSet()
                    outcome.boxes
                        .filterNot { it.artifactId in decided }
                        .forEach { box ->
                            detections.persist(
                                ArtifactDetection().apply {
                                    this.photoId = photoId
                                    artifactId = box.artifactId
                                    x0 = box.x0
                                    y0 = box.y0
                                    x1 = box.x1
                                    y1 = box.y1
                                    source = ArtifactDetection.SOURCE_LLM
                                },
                            )
                            job.found.incrementAndGet()
                        }
                    // Only a full pass marks a frame checked. A single-item pass says nothing
                    // about the rest of the catalogue, and the mark exists precisely so the
                    // per-drop button can skip what is already done.
                    if (onlyArtifactId == null) {
                        photos.findById(photoId)?.artifactsCheckedAt = Instant.now()
                    }
                }
                job.checked.incrementAndGet()
            }
        }
    }

    private fun catalogue(): List<DetectableArtifact> =
        artifacts.listAll().map { DetectableArtifact(it.id!!, it.name, it.detectionHint) }

    private fun <T> tx(block: () -> T): T = QuarkusTransaction.requiringNew().call(block)

    /** Counters of a single-drop pass (polled by the admin UI). */
    private class DetectionJob(val dropId: Long, val total: Int) {
        val checked = AtomicInteger()
        val found = AtomicInteger()
        val skipped = AtomicInteger()

        @Volatile
        var state: String = "queued"

        fun view() = ArtifactScanStatusView(
            state = state,
            total = total,
            checked = checked.get(),
            found = found.get(),
            skipped = skipped.get(),
        )
    }

    /**
     * An archive-wide run: the set of drops plus one cancel flag covering all of them. State is
     * derived from those drops rather than stored — the run owns no thread, the same single
     * executor drains the queue, and separately stored state would drift from the real one.
     */
    private class ScanRun(val artifactName: String?) {
        val jobs = java.util.concurrent.CopyOnWriteArrayList<DetectionJob>()
        val cancelled = java.util.concurrent.atomic.AtomicBoolean(false)

        fun view(): ArtifactScanRunView {
            val states = jobs.map { it.state }
            val state = when {
                jobs.isEmpty() -> "idle"
                states.any { it in ACTIVE } -> "running"
                states.any { it == "failed" } -> "failed"
                states.any { it == "cancelled" } -> "cancelled"
                else -> "done"
            }
            return ArtifactScanRunView(
                state = state,
                total = jobs.sumOf { it.total },
                checked = jobs.sumOf { it.checked.get() },
                found = jobs.sumOf { it.found.get() },
                skipped = jobs.sumOf { it.skipped.get() },
                drops = jobs.size,
                dropsDone = states.count { it !in ACTIVE },
                artifactName = artifactName,
            )
        }
    }

    private companion object {
        /** States in which a drop still holds the queue: box edits are refused meanwhile. */
        val ACTIVE = setOf("queued", "running")
    }
}

/** A box from the admin UI: frame fractions, top-left strictly before bottom-right. */
data class BoxInput(
    val x0: Double,
    val y0: Double,
    val x1: Double,
    val y1: Double,
) {
    val valid: Boolean
        get() = listOf(x0, y0, x1, y1).all { it in 0.0..1.0 } && x1 > x0 && y1 > y0
}
