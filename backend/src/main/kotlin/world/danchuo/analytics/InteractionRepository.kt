package world.danchuo.analytics

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import jakarta.enterprise.context.ApplicationScoped
import java.time.Instant

/** Доступ к сырым кликам хитмапы (B2). Шов слайса — батч-запись и выборка под агрегат. */
@ApplicationScoped
class InteractionRepository : PanacheRepository<InteractionEvent> {

    /** Клики (не-боты) по странице за полуинтервал [from, to) — сырьё под потайловый агрегат. */
    fun listForHeatmap(path: String, from: Instant, to: Instant): List<InteractionEvent> =
        list(
            "path = ?1 and isBot = false and occurredAt >= ?2 and occurredAt < ?3",
            path,
            from,
            to,
        )
}
