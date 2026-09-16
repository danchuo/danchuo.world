package world.danchuo.instagram

import jakarta.enterprise.context.ApplicationScoped
import java.nio.file.Files
import java.nio.file.Path

/**
 * Bytes of the Instagram images — the post frame and the owner's avatar. It exists because the
 * source's signed URLs expire within hours, so these bytes are not a cache for speed but the only
 * way to show a post for longer than that. They sit beside the drop images. PRD §5.17
 */
@ApplicationScoped
class InstagramImageStorage(private val config: InstagramConfig) {

    /** Which image. There are exactly two files, post and avatar, both overwritten in place. */
    enum class Kind(val fileName: String) {
        POST("post"),
        AVATAR("avatar"),
    }

    private val root: Path get() = Path.of(config.storageDir())

    fun put(kind: Kind, bytes: ByteArray) {
        Files.createDirectories(root)
        Files.write(fileOf(kind), bytes)
    }

    fun get(kind: Kind): ByteArray? =
        fileOf(kind).takeIf { Files.isRegularFile(it) }?.let { Files.readAllBytes(it) }

    /**
     * Public address of an image, which [InstagramMediaResource] serves it under. The file name
     * does not depend on content, so a new post would keep the old URL and a browser would
     * honestly show the cached copy — hence the `?v=` version taken from the file's timestamp.
     */
    fun urlOf(kind: Kind): String? {
        val file = fileOf(kind).takeIf { Files.isRegularFile(it) } ?: return null
        val base = "/api/instagram-media/${kind.name.lowercase()}"
        val version = runCatching { Files.getLastModifiedTime(file).toMillis() }.getOrNull()
        return if (version == null) base else "$base?v=$version"
    }

    private fun fileOf(kind: Kind): Path = root.resolve("${kind.fileName}.img")
}
