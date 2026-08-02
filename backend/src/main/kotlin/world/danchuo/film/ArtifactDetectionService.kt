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

    /**
     * Текущий прогон «по всему архиву»: очередь дропов уходит в исполнитель разом, поэтому
     * сводку и отмену надо держать поверх отдельных дропов, а не внутри них.
     */
    @Volatile
    private var archiveRun: ScanRun? = null

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
     * Прогнать **все** дропы — путь «добавили артефакт, ищем его в старых кадрах».
     *
     * Всегда `recheck`: у существующих кадров отметка о проверке уже стоит, и без него новый
     * предмет не искался бы нигде. Дропы уходят в ту же одну очередь и идут друг за другом —
     * прогон по всему архиву долгий и стоит денег, поэтому он только ручной.
     *
     * [onlyArtifactId] сужает прогон до одного предмета. **Дешевле от этого не становится** —
     * вызов всё равно один на кадр, а цена зависит от числа кадров, — но такой прогон не трогает
     * находки остальных предметов и задаёт модели один вопрос вместо списка.
     */
    fun startAll(onlyArtifactId: Long? = null): ArtifactScanRunView {
        val name = onlyArtifactId?.let { id -> tx { artifacts.findById(id)?.name } }
        require(onlyArtifactId == null || name != null) { "artifact_not_found" }
        val ids = drops.listOrdered().mapNotNull { it.id }
        // Новый прогон снимает отмену предыдущего — иначе он умер бы, не начавшись.
        val fresh = ScanRun(artifactName = name)
        archiveRun = fresh
        ids.forEach { start(it, recheck = true, onlyArtifactId = onlyArtifactId) }
        fresh.jobs.addAll(ids.mapNotNull { jobs[it] })
        return fresh.view()
    }

    /**
     * Остановить прогон по архиву. Кадр, начатый до отмены, дописывается — рвать его посреди
     * записи незачем, — а очередь дальше не разбирается. Возвращает `false`, если останавливать
     * нечего. Данные остаются согласованными: непроверенные кадры так и остаются непроверенными.
     */
    fun cancel(): Boolean {
        val current = archiveRun ?: return false
        if (current.view().state != "running") return false
        current.cancelled.set(true)
        return true
    }

    /** Сводка по последнему прогону архива; `idle`, если их ещё не было. */
    fun runStatus(): ArtifactScanRunView = archiveRun?.view() ?: ScanRun(artifactName = null).view()

    /** Бежит ли прогон — гейт для ручной правки рамок (иначе гонка за одни и те же строки). */
    fun isRunning(dropId: Long): Boolean = jobs[dropId]?.state in ACTIVE

    /** Статус: бегущий/последний прогон, а без него — срез по БД. `null` — дропа нет. */
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

    /** Находки по кадрам дропа: `photoId -> рамки`. Пусто, если ничего не найдено. */
    fun byPhoto(photoIds: Collection<Long>): Map<Long, List<ArtifactDetection>> =
        detections.listVisibleByPhotos(photoIds).groupBy { it.photoId }

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

    /**
     * Снять рамку с кадра (модель ошиблась или передумали).
     *
     * Строка не удаляется, а помечается `rejected`: удалённую находку следующий прогон нашёл бы
     * заново, и рамка вернулась бы — снятие руками должно быть решением, а не косметикой.
     * Вернуть предмет на кадр можно, поставив рамку руками: она перезапишет строку в `manual`.
     * `false` — такой находки нет.
     */
    fun deleteDetection(dropId: Long, photoId: Long, artifactId: Long): Boolean {
        check(!isRunning(dropId)) { "artifacts_running" }
        return tx {
            val row = detections.findOne(photoId, artifactId) ?: return@tx false
            row.source = ArtifactDetection.SOURCE_REJECTED
            true
        }
    }

    // ── Фоновый прогон ──

    private fun pendingIds(dropId: Long, recheck: Boolean): List<Long> =
        photos.listByDrop(dropId)
            .filter { recheck || it.artifactsCheckedAt == null }
            .mapNotNull { it.id }

    private fun execute(dropId: Long, recheck: Boolean, onlyArtifactId: Long?, job: DetectionJob) {
        val current = archiveRun
        try {
            // Отмену проверяем и до первого кадра: очередь архива уходит в исполнитель разом,
            // и на момент старта дропа №5 прогон могли уже остановить.
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
                    // Прогон ради одного предмета сносит только его находки: у остальных они
                    // могли быть удачными, а спрашивали про них в прошлый раз, не сейчас.
                    if (onlyArtifactId == null) {
                        detections.deleteLlmByPhoto(photoId)
                    } else {
                        detections.deleteLlmByPhotoAndArtifact(photoId, onlyArtifactId)
                    }
                    // Остались строки, решённые человеком: ручные рамки и отклонённые находки.
                    // И те и другие перепрогон не трогает — иначе снятая рамка вернулась бы.
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
                    // Отметку «кадр проверен» ставит только полный прогон. Прогон по одному
                    // предмету ничего не говорит про остальной каталог, а отметка нужна ровно
                    // затем, чтобы кнопка по дропу пропускала уже проверенное.
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

    /** Счётчики прогона по одному дропу (поллятся админкой). */
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
     * Прогон по всему архиву: набор дропов + флаг отмены на всех сразу.
     *
     * Состояние выводится из дропов, а не хранится: у прогона нет собственного потока — очередь
     * разбирает тот же единственный исполнитель, — и любое отдельно хранимое состояние
     * разъезжалось бы с настоящим.
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
        /** Состояния, в которых дроп ещё занимает очередь: правку рамок в это время не пускаем. */
        val ACTIVE = setOf("queued", "running")
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
