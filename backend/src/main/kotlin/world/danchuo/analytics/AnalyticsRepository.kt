package world.danchuo.analytics

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import jakarta.enterprise.context.ApplicationScoped

@ApplicationScoped
class AnalyticsRepository : PanacheRepository<AnalyticsEvent> {

    fun findByVisitId(visitId: String): AnalyticsEvent? =
        find("visitId", visitId).firstResult()
}
