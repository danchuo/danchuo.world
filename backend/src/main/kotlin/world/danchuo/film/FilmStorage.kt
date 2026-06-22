package world.danchuo.film

import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.exists

/**
 * Вариант кадра фото-дропа (B1, PRD §5.12). На загрузке оригинал даунскейлится в два размера:
 * [WEB] — для модалки-галереи и тайла, [THUMB] — для сетки-архива и превью-обложки. Оригинал
 * не храним (он у владельца на телефоне) — экономим место.
 */
enum class PhotoVariant(val filename: String) {
    WEB("web.jpg"),
    THUMB("thumb.jpg"),
}

/**
 * Шов хранилища кадров (PRD §5.12, §8). Слайс film не знает, где лежат байты: сейчас —
 * локальный диск ([LocalDiskPhotoStorage]), позже подменяется на объектный сторадж (S3/R2)
 * новой реализацией бина — без правок сервиса/ресурсов. `key` — стабильный ключ кадра
 * `"{dropId}/{seq}"`; `seq` = `FilmPhoto.sortOrder`.
 */
interface PhotoStorage {
    /** Положить вариант кадра. */
    fun put(key: String, variant: PhotoVariant, bytes: ByteArray)

    /** Прочитать вариант (для локальной раздачи через media-роут); `null` — нет файла. */
    fun get(key: String, variant: PhotoVariant): ByteArray?

    /** Публичный URL варианта: локально — наш media-роут `/api/film-media/...`, в S3 — CDN-URL. */
    fun url(key: String, variant: PhotoVariant): String

    /** Удалить все кадры дропа целиком (рекурсивно по префиксу `{dropId}/`). */
    fun deleteDrop(dropId: Long)
}

/**
 * Локальная реализация [PhotoStorage] (B1): файлы в каталоге `danchuo.film.storage-dir`,
 * раскладка `{root}/{dropId}/{seq}/{variant}.jpg`. Раздаются бэкендом через
 * [FilmMediaResource] (`/api/film-media/{dropId}/{seq}/{variant}`). В проде каталог —
 * смонтированный том. Ключ имеет вид `"{dropId}/{seq}"` (только цифры и `/`) — обхода путей нет.
 */
@ApplicationScoped
class LocalDiskPhotoStorage(
    @param:ConfigProperty(name = "danchuo.film.storage-dir") private val storageDir: String,
) : PhotoStorage {

    private val root: Path by lazy { Path.of(storageDir).toAbsolutePath().normalize() }

    override fun put(key: String, variant: PhotoVariant, bytes: ByteArray) {
        val file = resolve(key).resolve(variant.filename)
        Files.createDirectories(file.parent)
        Files.write(file, bytes)
    }

    override fun get(key: String, variant: PhotoVariant): ByteArray? {
        val file = resolve(key).resolve(variant.filename)
        return if (file.exists()) Files.readAllBytes(file) else null
    }

    override fun url(key: String, variant: PhotoVariant): String =
        "/api/film-media/$key/${variant.name.lowercase()}"

    override fun deleteDrop(dropId: Long) {
        val dir = resolve(dropId.toString())
        if (!dir.exists()) return
        // Рекурсивное удаление снизу вверх (файлы → каталоги).
        Files.walk(dir).use { stream ->
            stream.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists)
        }
    }

    /** Резолв ключа внутрь [root] с защитой от выхода за каталог (path traversal). */
    private fun resolve(key: String): Path {
        val target = root.resolve(key).normalize()
        require(target.startsWith(root)) { "ключ хранилища вне каталога: $key" }
        return target
    }
}
