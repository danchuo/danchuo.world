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
 * Оркестрация проверки поворота кадров фото-дропа (B9, PRD §9 п.13): фоновые прогоны по дропу,
 * применение вердикта [OrientationDecider] к хранилищу и БД, ручной поворот из админки.
 *
 * Прогоны идут в один фоновый поток (executor на один воркер) — дропы строго по очереди,
 * общий рейт-лимит провайдера; статус прогона админка поллит по [status]. Кадр с недоступной
 * LLM остаётся непроверенным (`skipped`) и подхватится следующим прогоном.
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

    /** Последний прогон по дропу (running/done/failed); история не нужна — только текущий статус. */
    private val jobs = ConcurrentHashMap<Long, OrientationJob>()

    @PreDestroy
    fun shutdown() {
        executor.shutdownNow()
    }

    // ── Публичное API слайса ──

    /**
     * Запустить фоновую проверку всех непроверенных кадров дропа. Идемпотентно: уже бегущий
     * прогон не дублируется (возвращается его статус). `null` — дроп не найден.
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

    /** Статус проверки дропа: бегущий/последний прогон, а без него — срез по БД. `null` — нет дропа. */
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
     * Ручной поворот кадра из админки (override ошибки LLM). Бросает [IllegalStateException],
     * если по дропу бежит прогон (иначе гонка за одни байты), [IllegalArgumentException] —
     * кадр не из этого дропа. `false` — дроп/кадр не найден.
     */
    fun rotateManually(dropId: Long, photoId: Long, rotation: FrameRotation): Boolean {
        check(jobs[dropId]?.state != "running") { "orientation_running" }
        // Валидация — в короткой транзакции, чтобы сущность кадра не осела в сессии запроса:
        // запись идёт отдельной транзакцией, и ответ ресурса (свежий список кадров) иначе
        // прочитал бы дообротный снимок из L1-кэша сессии.
        val key = tx {
            if (drops.findById(dropId) == null) return@tx null
            val photo = photos.findById(photoId) ?: return@tx null
            require(photo.dropId == dropId) { "photo_not_in_drop" }
            photo.storageKey
        } ?: return false
        return rotateStored(photoId, key, rotation, applied = "manual")
    }

    // ── Фоновый прогон ──

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
        // Свежий срез: кадр могли удалить/повернуть вручную, пока прогон стоял в очереди.
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

    // ── Применение ──

    /**
     * Повернуть сохранённые web+thumb и зафиксировать итог в БД. Байты пишутся до отметки:
     * упади процесс между ними — следующий прогон увидит уже прямой кадр и просто пометит его.
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

    /** Счётчики бегущего прогона (читаются поллингом статуса из админки). */
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
