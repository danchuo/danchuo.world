package world.danchuo.social

import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption

/**
 * Байты картинок артефактов, заведённых через `/admin` (PRD §5.8).
 *
 * Живёт в подкаталоге хранилища фото-дропов намеренно: в проде это уже смонтированный том, и
 * заводить ради нескольких картинок второй — лишний шаг в деплое. Слайсы при этом не связаны —
 * общий только путь из конфига.
 *
 * Артефакты, засеянные миграциями, лежат статикой во фронте (каталог `assets/artifacts`) и сюда
 * не переезжают: `Artifact.imageUrl` — это просто URL, оба источника уживаются.
 */
@ApplicationScoped
class ArtifactImageStorage(
    @param:ConfigProperty(name = "danchuo.artifacts.storage-dir") private val dir: String,
) {

    private val root: Path get() = Path.of(dir)

    fun put(artifactId: Long, bytes: ByteArray) {
        Files.createDirectories(root)
        Files.write(fileOf(artifactId), bytes)
    }

    /** Переложить загруженный временный файл (multipart отдаёт путь, а не байты). */
    fun putFile(artifactId: Long, source: Path) {
        Files.createDirectories(root)
        Files.copy(source, fileOf(artifactId), StandardCopyOption.REPLACE_EXISTING)
    }

    fun get(artifactId: Long): ByteArray? =
        fileOf(artifactId).takeIf { Files.isRegularFile(it) }?.let { Files.readAllBytes(it) }

    fun delete(artifactId: Long) {
        Files.deleteIfExists(fileOf(artifactId))
    }

    /** Публичный URL картинки — под ним её раздаёт [ArtifactMediaResource]. */
    fun urlOf(artifactId: Long): String = "/api/artifact-media/$artifactId"

    private fun fileOf(artifactId: Long): Path = root.resolve("$artifactId.png")
}
