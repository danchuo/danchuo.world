package world.danchuo.analytics

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import jakarta.enterprise.context.ApplicationScoped

/** Доступ к сырым событиям посещений. Шов слайса — запись бикона и агрегаты сводки. */
@ApplicationScoped
class AnalyticsRepository : PanacheRepository<AnalyticsEvent> {

    /** Строка визита по служебному [AnalyticsEvent.visitId] — для добивки `dwellMs`. */
    fun findByVisitId(visitId: String): AnalyticsEvent? =
        find("visitId", visitId).firstResult()
}
