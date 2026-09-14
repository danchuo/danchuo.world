package world.danchuo.instagram

import jakarta.enterprise.context.ApplicationScoped
import java.nio.file.Files
import java.nio.file.Path

/**
 * Байты картинок Instagram: кадр поста и аватар владельца (PRD §5.17).
 *
 * ⚠️ **Существует ровно потому, что ссылки Instagram живут часами.** `media_url` и
 * `profile_picture_url` — подписанные URL с зашитым сроком: отдай мы их фронту, карточка
 * встала бы на 403 «URL signature expired» в тот же день. Снятые байты — не кэш ради
 * скорости, а единственный способ показать пост дольше нескольких часов.
 *
 * Лежит в подкаталоге хранилища фото-дропов — как картинки артефактов: в проде это уже
 * смонтированный том, и заводить ради двух файлов второй — лишний шаг в деплое.
 */
@ApplicationScoped
class InstagramImageStorage(private val config: InstagramConfig) {

    /** Что за картинка. Файлов ровно два — пост и аватар, оба перезаписываются на месте. */
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
     * Публичный адрес картинки — под ним её раздаёт [InstagramMediaResource].
     *
     * Имя файла от содержимого не зависит, поэтому новый пост оставил бы URL прежним и браузер
     * честно показывал бы кэшированную копию. Отсюда версия `?v=` от времени файла — тот же
     * приём, что у картинок артефактов и перевёрнутых кадров.
     */
    fun urlOf(kind: Kind): String? {
        val file = fileOf(kind).takeIf { Files.isRegularFile(it) } ?: return null
        val base = "/api/instagram-media/${kind.name.lowercase()}"
        val version = runCatching { Files.getLastModifiedTime(file).toMillis() }.getOrNull()
        return if (version == null) base else "$base?v=$version"
    }

    private fun fileOf(kind: Kind): Path = root.resolve("${kind.fileName}.img")
}
