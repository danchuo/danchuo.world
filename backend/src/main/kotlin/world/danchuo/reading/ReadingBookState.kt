package world.danchuo.reading

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepositoryBase
import jakarta.enterprise.context.ApplicationScoped
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * The last percentage of a book we SAW on the shelf, before any reading session existed. It is a
 * separate row because a session only appears once the counter grew, while the poller watches the
 * book long before that — without it, a first sitting had no start. PRD §5.16
 */
@Entity
@Table(name = "reading_book_state")
class ReadingBookState {
    /** The book's id inside the reader DB, which is also the key: one row per book. */
    @Id
    @Column(name = "book_id")
    var bookId: Long = 0

    /** A 0..1 fraction, as the reader stores it. */
    @Column(name = "last_percent")
    var lastPercent: Double? = null

    @Column(name = "observed_at", nullable = false)
    lateinit var observedAt: Instant
}

/** Shelf observations: only [ReadingService] reads and writes them. */
@ApplicationScoped
class ReadingBookStateRepository : PanacheRepositoryBase<ReadingBookState, Long> {

    /** Every known book's percentage at once — the snapshot is read whole, never book by book. */
    fun percentsByBook(): Map<Long, Double> =
        listAll().mapNotNull { state -> state.lastPercent?.let { state.bookId to it } }.toMap()

    /** Remembers what was seen; one row per book, so this upserts by the key. */
    fun observe(bookId: Long, percent: Double?, at: Instant) {
        val existing = findById(bookId)
        if (existing != null) {
            existing.lastPercent = percent
            existing.observedAt = at
            return
        }
        // The insert writes the row immediately, so every not-null field is filled BEFORE persist.
        persist(
            ReadingBookState().apply {
                this.bookId = bookId
                lastPercent = percent
                observedAt = at
            },
        )
    }
}
