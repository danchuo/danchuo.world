package world.danchuo.social

import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import java.nio.file.Files
import java.nio.file.Path

/**
 * Bytes of artifact 3D models uploaded through `/admin`. Beside the pictures, in the same mounted
 * volume, so a model costs no new deploy step. PRD §5.8, DESIGN §12.5
 */
@ApplicationScoped
class ArtifactModelStorage(
    @param:ConfigProperty(name = "danchuo.artifacts.storage-dir") private val dir: String,
) {

    private val root: Path get() = Path.of(dir, "models")

    /**
     * ⚠️ **`.glb` only, and it is checked by the file's own header.** A `.gltf` is JSON plus
     * neighbouring files, and a single upload cannot carry them — half a model would arrive.
     */
    fun put(artifactId: Long, bytes: ByteArray) {
        require(isGlb(bytes)) { "glb_required" }
        Files.createDirectories(root)
        Files.write(fileOf(artifactId), bytes)
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

    /** The name never depends on content, so a replacement keeps the URL — hence `?v=`, as for pictures. */
    fun urlOf(artifactId: Long): String {
        val base = "/api/artifact-media/$artifactId/model"
        val version = runCatching { Files.getLastModifiedTime(fileOf(artifactId)).toMillis() }
            .getOrNull() ?: return base
        return "$base?v=$version"
    }

    private fun fileOf(artifactId: Long): Path = root.resolve("$artifactId.glb")

    private companion object {
        /** glTF-binary starts with the ASCII magic `glTF`; a JSON `.gltf` or a picture does not. */
        val MAGIC = "glTF".toByteArray()

        fun isGlb(bytes: ByteArray) =
            bytes.size > MAGIC.size && MAGIC.indices.all { bytes[it] == MAGIC[it] }
    }
}
