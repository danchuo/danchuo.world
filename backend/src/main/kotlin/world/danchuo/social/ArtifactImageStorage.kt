package world.danchuo.social

import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import java.nio.file.Files
import java.nio.file.Path

/**
 * Bytes of artifact images created through `/admin`. They sit in a subdirectory of the photo-drop
 * storage on purpose: in prod that is already a mounted volume, and a second one would be an
 * extra deploy step. Seeded artifacts stay as frontend statics — `imageUrl` is just a URL. §5.8
 */
@ApplicationScoped
class ArtifactImageStorage(
    @param:ConfigProperty(name = "danchuo.artifacts.storage-dir") private val dir: String,
) {

    private val root: Path get() = Path.of(dir)

    /**
     * Stores an item's picture. Transparent margins are trimmed on the way in
     * ([ArtifactImageTrim]): the marquee derives optical weight from the picture's ratio, so wide
     * margins would both shrink the item and lie about its proportions.
     */
    fun put(artifactId: Long, bytes: ByteArray) {
        Files.createDirectories(root)
        Files.write(fileOf(artifactId), ArtifactImageTrim.trim(bytes))
    }

    /** Moves the uploaded temp file into place (multipart hands over a path, not bytes). */
    fun putFile(artifactId: Long, source: Path) {
        put(artifactId, Files.readAllBytes(source))
    }

    fun get(artifactId: Long): ByteArray? =
        fileOf(artifactId).takeIf { Files.isRegularFile(it) }?.let { Files.readAllBytes(it) }

    fun delete(artifactId: Long) {
        Files.deleteIfExists(fileOf(artifactId))
    }

    /**
     * Public URL of the image, served by [ArtifactMediaResource]. The file name never depends on
     * content (always `{id}.png`), so a replacement would keep the URL and the browser would
     * honestly show its cached copy — hence the `?v=` version taken from the file's timestamp.
     */
    fun urlOf(artifactId: Long): String {
        val base = "/api/artifact-media/$artifactId"
        val version = runCatching { Files.getLastModifiedTime(fileOf(artifactId)).toMillis() }
            .getOrNull() ?: return base
        return "$base?v=$version"
    }

    private fun fileOf(artifactId: Long): Path = root.resolve("$artifactId.png")
}
