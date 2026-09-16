package world.danchuo.analytics

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import jakarta.enterprise.context.ApplicationScoped
import java.time.Instant

@ApplicationScoped
class InteractionRepository : PanacheRepository<InteractionEvent> {

    /** Non-bot clicks on a page over the half-open `[from, to)` — raw material for the aggregate. */
    fun listForHeatmap(path: String, from: Instant, to: Instant): List<InteractionEvent> =
        list(
            "path = ?1 and isBot = false and occurredAt >= ?2 and occurredAt < ?3",
            path,
            from,
            to,
        )
}
