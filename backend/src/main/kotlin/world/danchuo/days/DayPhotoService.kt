package world.danchuo.days

import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import world.danchuo.film.FilmImaging
import world.danchuo.film.PhotoStorage
import world.danchuo.film.PhotoVariant
import world.danchuo.film.ProcessedImage
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * The day's photo (PRD §5.6): cut into web and thumb as a drop frame is, but larger and finer,
 * and kept in the same storage under `days/{yyyyMMdd}`. One photo per day; a new one replaces it.
 */
@ApplicationScoped
class DayPhotoService(
    private val imaging: FilmImaging,
    private val storage: PhotoStorage,
    private val dayRecordService: DayRecordService,
    @param:ConfigProperty(name = "danchuo.days.photo-max-px") private val maxPx: Int,
    @param:ConfigProperty(name = "danchuo.days.photo-jpeg-quality") private val quality: Float,
) {

    /** `null` when the bytes are not an image ImageIO reads (HEIC included). */
    fun process(bytes: ByteArray): ProcessedImage? = imaging.process(bytes, maxPx, quality)

    fun store(date: LocalDate, photo: ProcessedImage) {
        storage.put(keyOf(date), PhotoVariant.WEB, photo.webBytes)
        storage.put(keyOf(date), PhotoVariant.THUMB, photo.thumbBytes)
        dayRecordService.applyPhoto(date, photo.width, photo.height)
    }

    fun read(date: LocalDate, variant: PhotoVariant): ByteArray? = storage.get(keyOf(date), variant)

    private fun keyOf(date: LocalDate) = "days/${date.format(DateTimeFormatter.BASIC_ISO_DATE)}"
}
