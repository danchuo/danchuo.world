package world.danchuo.film

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * Найденный на кадре артефакт: ссылка на предмет + рамка, которой он подсвечивается (PRD §5.12).
 *
 * **Координаты — доли кадра (0..1), а не пиксели**: мозаика последнего дропа масштабирует кадры
 * произвольно, thumb и web разного размера, а `aspect-ratio` держит место до загрузки — доли
 * переживают всё это без пересчёта, пиксели не переживают ничего.
 *
 * [source] отделяет находку модели от поставленной рукой: ручную правку повторный прогон не
 * трогает. Рамка — **прямоугольник по осям кадра**: одна фигура и от модели,
 * и от руки ⇒ один рендер, одно поле, один пересчёт при повороте кадра.
 *
 * [artifactId] — плоский FK на `artifact` из слайса `social` (как [FilmPhoto.dropId] на дроп).
 */
@Entity
@Table(name = "artifact_detection")
class ArtifactDetection {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    @Column(name = "photo_id", nullable = false)
    var photoId: Long = 0

    @Column(name = "artifact_id", nullable = false)
    var artifactId: Long = 0

    @Column(name = "x0", nullable = false)
    var x0: Double = 0.0

    @Column(name = "y0", nullable = false)
    var y0: Double = 0.0

    @Column(name = "x1", nullable = false)
    var x1: Double = 0.0

    @Column(name = "y1", nullable = false)
    var y1: Double = 0.0

    /**
     * `llm` — нашла модель, `manual` — поставлено руками, `rejected` — владелец снял находку.
     *
     * Отклонение **хранится**, а не удаляется: иначе следующий прогон нашёл бы предмет заново
     * и рамка вернулась бы — снятие руками должно быть решением, а не косметикой. Координаты у
     * отклонённой строки сохраняются: по ним видно, что именно модель принимала за предмет.
     * Обратный ход есть — ручная рамка на ту же пару перезаписывает строку в `manual`.
     */
    @Column(name = "source", nullable = false)
    lateinit var source: String

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now()

    companion object {
        const val SOURCE_LLM = "llm"
        const val SOURCE_MANUAL = "manual"
        const val SOURCE_REJECTED = "rejected"
    }
}
