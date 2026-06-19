package world.danchuo.film

/**
 * Публичные проекции фото-дропов (PRD §5.12; DESIGN §7.5). До B1 (загрузка кадров) списки пусты.
 */

/** Дроп для тизер-тайла: подпись + превью-обложка + число кадров. */
data class FilmDropView(
    val id: Long,
    val title: String,
    val droppedOn: String,
    val monthLabel: String?,
    val photoCount: Int,
    /** URL кадра-обложки (или `null`, если обложка не задана). */
    val coverPhotoUrl: String?,
)

/** Кадр дропа для justified-композиции модалки; [width]/[height] — для раскладки. */
data class FilmPhotoView(
    val imageUrl: String,
    val width: Int?,
    val height: Int?,
) {
    companion object {
        fun from(p: FilmPhoto) = FilmPhotoView(p.imageUrl, p.width, p.height)
    }
}
