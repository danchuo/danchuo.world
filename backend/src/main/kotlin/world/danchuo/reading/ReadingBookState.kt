package world.danchuo.reading

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepositoryBase
import jakarta.enterprise.context.ApplicationScoped
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * Последний **увиденный** процент книги (PRD §5.16) — то, что мы наблюдали на полке до того, как
 * пошло чтение.
 *
 * Зачем отдельная строка, когда проценты уже лежат в сессиях. Сессия появляется, только когда
 * счётчик вырос; а поллер видит книгу на полке ЗАДОЛГО до этого — она лежит на 35% всё утро, и
 * каждый такт мы это наблюдаем и выбрасываем. Из-за этого первый заход по книге, доставшейся нам
 * с чужой историей, оставался без начала: «42%» вместо «35% → 42%», хотя ответ проходил у нас
 * перед носом.
 *
 * Обновляется **после** разбора снимка, а не до: начало захода — это процент, увиденный на
 * ПРЕДЫДУЩЕМ такте. Обнови раньше — и старт совпал бы с финишем, дав пустую стрелку «42% → 42%».
 */
@Entity
@Table(name = "reading_book_state")
class ReadingBookState {
    /** Идентификатор книги внутри базы читалки — он же ключ: строка на книгу одна. */
    @Id
    @Column(name = "book_id")
    var bookId: Long = 0

    /** Доля 0..1, как хранит читалка. */
    @Column(name = "last_percent")
    var lastPercent: Double? = null

    @Column(name = "observed_at", nullable = false)
    lateinit var observedAt: Instant
}

/** Наблюдения за полкой: читает и пишет только [ReadingService]. */
@ApplicationScoped
class ReadingBookStateRepository : PanacheRepositoryBase<ReadingBookState, Long> {

    /** Проценты всех известных книг разом — снимок читается целиком, по одной книге ходить незачем. */
    fun percentsByBook(): Map<Long, Double> =
        listAll().mapNotNull { state -> state.lastPercent?.let { state.bookId to it } }.toMap()

    /** Запомнить увиденное; строка на книгу одна, поэтому upsert по ключу. */
    fun observe(bookId: Long, percent: Double?, at: Instant) {
        val existing = findById(bookId)
        if (existing != null) {
            existing.lastPercent = percent
            existing.observedAt = at
            return
        }
        // Вставка вставляет строку немедленно ⇒ все not-null поля заполняем ДО persist.
        persist(
            ReadingBookState().apply {
                this.bookId = bookId
                lastPercent = percent
                observedAt = at
            },
        )
    }
}
