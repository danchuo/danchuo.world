package world.danchuo.film

import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.exists

/**
 * A photo-drop frame variant (B1, PRD §5.12). On upload the original is downscaled to two sizes:
 * [WEB] for the gallery modal and the tile, [THUMB] for the archive grid and the cover preview.
 * The original is not kept — it lives on the owner's phone, and this saves space.
 */
enum class PhotoVariant(val filename: String) {
    WEB("web.jpg"),
    THUMB("thumb.jpg"),
}

/**
 * The frame-storage seam: the `film` slice does not know where the bytes live. Today it is local
 * disk, later an object store swaps in as another bean with no change to services or resources.
 * `key` is the stable `"{dropId}/{seq}"`, where `seq` is `FilmPhoto.sortOrder`. PRD §5.12, §8
 */
interface PhotoStorage {
    fun put(key: String, variant: PhotoVariant, bytes: ByteArray)

    fun get(key: String, variant: PhotoVariant): ByteArray?

    /** Public URL of a variant: our `/api/film-media/...` route locally, a CDN URL on S3. */
    fun url(key: String, variant: PhotoVariant): String

    /** Deletes all of a drop's frames (recursively by the `{dropId}/` prefix). */
    fun deleteDrop(dropId: Long)

    /** Deletes one frame (both variants) by its `"{dropId}/{seq}"` key. */
    fun delete(key: String)
}

/**
 * Local [PhotoStorage]: files under `danchuo.film.storage-dir`, laid out as
 * `{root}/{dropId}/{seq}/{variant}.jpg` and a mounted volume in prod. Served by
 * [FilmMediaResource]. The key is digits and slashes only, so there is no path traversal.
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
        deleteTree(resolve(dropId.toString()))
    }

    override fun delete(key: String) {
        deleteTree(resolve(key))
    }

    /** Recursive bottom-up directory removal (files, then directories); a no-op when absent. */
    private fun deleteTree(dir: Path) {
        if (!dir.exists()) return
        Files.walk(dir).use { stream ->
            stream.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists)
        }
    }

    /** Resolves a key inside [root], guarded against escaping the directory (path traversal). */
    private fun resolve(key: String): Path {
        val target = root.resolve(key).normalize()
        require(target.startsWith(root)) { "ключ хранилища вне каталога: $key" }
        return target
    }
}
