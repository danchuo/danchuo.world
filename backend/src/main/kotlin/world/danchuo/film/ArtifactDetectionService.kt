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
 * Поиск артефактов на кадрах фото-дропа (PRD §5.12): фоновые прогоны по дропу, ручная правка
 * рамок из админки.
 *
 * Устроено как [FilmOrientationService] — один фоновый поток, дропы строго по очереди, статус
 * поллится админкой, — и по той же причине: у внешней модели общий рейт-лимит, а результат нужен
 * не сейчас, а когда-нибудь. Между кадрами выдерживается пауза `throttle-ms`.
 *
 * Ключевой контракт: кадр помечается проверенным **только если модель ответила**. Молчание
 * провайдера оставляет кадр непроверенным, и его подхватит следующий прогон — иначе один сбой
 * Gemini записался бы в данные как «артефактов на кадре нет».
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

    @PreDestroy
    fun shutdown() {
        executor.shutdownNow()
    }

    // ── Публичное API слайса ──

    /**
     * Запустить фоновый поиск по непроверенным кадрам дропа. Идемпотентно: бегущий прогон не
     * дублируется. [recheck] — перепроверить и уже проверенные (после смены описаний артефактов
     * или добавления нового предмета). `null` — дропа нет.
     */
    fun start(dropId: Long, recheck: Boolean = false): ArtifactScanStatusView? {
        drops.findById(dropId) ?: return null
        val job = jobs.compute(dropId) { _, existing ->
            if (existing != null && existing.state == "running") {
                existing
            } else {
                val pending = pendingIds(dropId, recheck).size
                DetectionJob(total = pending).also { fresh ->
                    if (pending == 0) {
                        fresh.state = "done"
                    } else {
                        executor.execute { run(dropId, recheck, fresh) }
                    }
                }
            }
        }!!
        return job.view()
    }

    /**
     * Прогнать **все** дропы — путь «добавили артефакт, ищем его в старых кадрах».
     *
     * Всегда `recheck`: у существующих кадров отметка о проверке уже стоит, и без него новый
     * предмет не искался бы нигде. Дропы уходят в ту же одну очередь и идут друг за другом —
     * прогон по всему архиву долгий и стоит денег, поэтому он только ручной.
     */
    fun startAll(): List<ArtifactScanStatusView> =
        drops.listOrdered().mapNotNull { drop -> drop.id?.let { start(it, recheck = true) } }

    /** Бежит ли прогон — гейт для ручной правки рамок (иначе гонка за одни и те же строки). */
    fun isRunning(dropId: Long): Boolean = jobs[dropId]?.state == "running"

    /** Статус: бегущий/последний прогон, а без него — срез по БД. `null` — дропа нет. */
    fun status(dropId: Long): ArtifactScanStatusView? {
        drops.findById(dropId) ?: return null
        jobs[dropId]?.let { return it.view() }
        val all = photos.listByDrop(dropId)
        return ArtifactScanStatusView(
            state = "idle",
            total = all.size,
            checked = all.count { it.artifactsCheckedAt != null },
            found = detections.listByPhotos(all.mapNotNull { it.id }).size,
            skipped = 0,
        )
    }

    /** Находки по кадрам дропа: `photoId -> рамки`. Пусто, если ничего не найдено. */
    fun byPhoto(photoIds: Collection<Long>): Map<Long, List<ArtifactDetection>> =
        detections.listByPhotos(photoIds).groupBy { it.photoId }

    /**
     * Поставить/подвинуть рамку руками. Перезаписывает находку модели по той же паре
     * кадр-артефакт и помечает её ручной, чтобы перепрогон её не трогал.
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
            // Строка заполняется ДО вставки: при IDENTITY-генерации persist пишет в БД сразу,
            // и незаполненный not-null `source` уронил бы вставку.
            if (existing == null) detections.persist(row)
            true
        }
    }

    /** Убрать рамку (ошибка модели или передумали). `false` — такой находки нет. */
    fun deleteDetection(dropId: Long, photoId: Long, artifactId: Long): Boolean {
        check(!isRunning(dropId)) { "artifacts_running" }
        return tx {
            val row = detections.findOne(photoId, artifactId) ?: return@tx false
            detections.delete(row)
            true
        }
    }

    // ── Фоновый прогон ──

    private fun pendingIds(dropId: Long, recheck: Boolean): List<Long> =
        photos.listByDrop(dropId)
            .filter { recheck || it.artifactsCheckedAt == null }
            .mapNotNull { it.id }

    private fun run(dropId: Long, recheck: Boolean, job: DetectionJob) {
        try {
            val catalogue = tx { catalogue() }
            val pending = tx { pendingIds(dropId, recheck) }
            for ((index, photoId) in pending.withIndex()) {
                if (index > 0 && throttleMs > 0) Thread.sleep(throttleMs)
                processFrame(photoId, catalogue, job)
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

    private fun processFrame(photoId: Long, catalogue: List<DetectableArtifact>, job: DetectionJob) {
        val key = tx { photos.findById(photoId)?.storageKey } ?: return
        // Модели хватает web-варианта; оригиналов мы не храним, а thumb теряет мелкие принты.
        val bytes = storage.get(key, PhotoVariant.WEB)
        if (bytes == null) {
            job.skipped.incrementAndGet()
            return
        }
        when (val outcome = detector.detect(bytes, catalogue)) {
            // Провайдер молчит — кадр остаётся непроверенным до следующего прогона.
            DetectionOutcome.Unavailable -> job.skipped.incrementAndGet()
            is DetectionOutcome.Found -> {
                tx {
                    detections.deleteLlmByPhoto(photoId)
                    val manual = detections.listByPhoto(photoId).map { it.artifactId }.toSet()
                    outcome.boxes
                        // Ручная рамка главнее находки модели — её перепрогон не трогает.
                        .filterNot { it.artifactId in manual }
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
                    photos.findById(photoId)?.artifactsCheckedAt = Instant.now()
                }
                job.checked.incrementAndGet()
            }
        }
    }

    private fun catalogue(): List<DetectableArtifact> =
        artifacts.listAll().map { DetectableArtifact(it.id!!, it.name, it.detectionHint) }

    private fun <T> tx(block: () -> T): T = QuarkusTransaction.requiringNew().call(block)

    /** Счётчики бегущего прогона (поллятся админкой). */
    private class DetectionJob(val total: Int) {
        val checked = AtomicInteger()
        val found = AtomicInteger()
        val skipped = AtomicInteger()

        @Volatile
        var state: String = "running"

        fun view() = ArtifactScanStatusView(
            state = state,
            total = total,
            checked = checked.get(),
            found = found.get(),
            skipped = skipped.get(),
        )
    }
}

/** Рамка, пришедшая из админки: доли кадра, левый-верхний строго раньше правого-нижнего. */
data class BoxInput(
    val x0: Double,
    val y0: Double,
    val x1: Double,
    val y1: Double,
) {
    val valid: Boolean
        get() = listOf(x0, y0, x1, y1).all { it in 0.0..1.0 } && x1 > x0 && y1 > y0
}
