package world.danchuo.film

import io.quarkus.narayana.jta.QuarkusTransaction
import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import java.nio.file.Path
import java.time.Instant
import java.time.LocalDate
import java.util.zip.ZipFile

/**
 * Оркестрация фото-дропов (B1, PRD §5.12): загрузка zip (распаковка → ресайз → хранилище → БД),
 * выбор обложки, удаление, сборка проекций. Слайс остаётся вертикальным: ядро не знает ни о
 * хранилище, ни об обработке изображений (всё внутри film). Ключ кадра — `"{dropId}/{sortOrder}"`.
 */
@ApplicationScoped
class FilmService(
    private val drops: FilmDropRepository,
    private val photos: FilmPhotoRepository,
    private val storage: PhotoStorage,
    private val imaging: FilmImaging,
) {

    // ── Загрузка ──

    /**
     * Создать дроп из zip: каждый поддерживаемый кадр ресайзится в web+thumb, кладётся в
     * хранилище, строкой пишется в БД. Непригодные файлы (HEIC/битые/не-картинки) пропускаются.
     * Обложка по умолчанию — первый кадр (потом меняется в админке).
     *
     * **Тяжёлая обработка (~36 кадров) идёт ВНЕ БД-транзакции** — иначе на больших zip (сотни МБ)
     * единая транзакция упирается в дефолтный таймаут менеджера (60с) и откатывается
     * (`RollbackException`). Поэтому короткими транзакциями обёрнуты только быстрые записи в БД:
     * (1) строка дропа ради id, (3) строки кадров + счётчик/обложка. При сбое чистим файлы и строку.
     */
    fun upload(zipPath: Path, title: String, droppedOn: LocalDate): UploadResultView {
        // 1) Короткая транзакция: строка дропа → получаем id (нужен для ключей хранилища).
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
            // 2) Без транзакции: распаковка + ресайз + запись файлов в хранилище (это и есть долго).
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

            // 3) Короткая транзакция: строки кадров + счётчик + обложка по умолчанию.
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
            // Откат: чистим файлы хранилища и строку дропа (каждое — своей короткой транзакцией).
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

    /** Метаданные обработанного кадра, накопленные вне транзакции (записываются в БД блоком). */
    private data class FrameMeta(val seq: Int, val width: Int?, val height: Int?)

    // ── Управление ──

    /**
     * Пометить кадр обложкой. `null` — дроп не найден (404). Бросает [IllegalArgumentException],
     * если кадр не из этого дропа (400).
     */
    @Transactional
    fun setCover(dropId: Long, photoId: Long): AdminDropView? {
        val drop = drops.findById(dropId) ?: return null
        val photo = photos.findById(photoId)
        require(photo != null && photo.dropId == dropId) { "photo_not_in_drop" }
        drop.coverPhotoId = photoId
        return adminDropView(drop)
    }

    /** Удалить дроп: кадры из БД, строку дропа, файлы из хранилища. `false` — дропа нет. */
    @Transactional
    fun delete(dropId: Long): Boolean {
        val drop = drops.findById(dropId) ?: return false
        photos.deleteByDrop(dropId)
        drops.delete(drop)
        storage.deleteDrop(dropId)
        return true
    }

    // ── Проекции (публичные) ──

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

    /** Кадры дропа для модалки; `null` — дроп не найден (404). */
    fun publicPhotos(dropId: Long): List<FilmPhotoView>? {
        drops.findById(dropId) ?: return null
        return photos.listByDrop(dropId).map { p ->
            FilmPhotoView(
                imageUrl = storage.url(p.storageKey, PhotoVariant.WEB),
                thumbUrl = storage.url(p.storageKey, PhotoVariant.THUMB),
                width = p.width,
                height = p.height,
            )
        }
    }

    // ── Проекции (админские) ──

    fun listAdmin(): List<AdminDropView> = drops.listOrdered().map(::adminDropView)

    /** Кадры дропа для админ-сетки выбора обложки; `null` — дроп не найден. */
    fun adminPhotos(dropId: Long): List<AdminPhotoView>? {
        val drop = drops.findById(dropId) ?: return null
        return photos.listByDrop(dropId).map { p ->
            AdminPhotoView(
                id = p.id!!,
                thumbUrl = storage.url(p.storageKey, PhotoVariant.THUMB),
                isCover = p.id == drop.coverPhotoId,
            )
        }
    }

    // ── Внутреннее ──

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
        return storage.url(cover.storageKey, PhotoVariant.THUMB)
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
