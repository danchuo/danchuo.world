package world.danchuo.analytics

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import jakarta.enterprise.context.ApplicationScoped
import java.time.Instant

/** One dimension of the summary, as the SQL expression it groups by. Never user input. */
enum class Dimension(internal val expression: String) {
    SOURCE("referrer_host"),
    DEVICE("device_type"),
    UTM_SOURCE("utm_source"),
    UTM_MEDIUM("utm_medium"),
    UTM_CAMPAIGN("utm_campaign"),
    WAVE("wave_key"),

    /**
     * Viewport as breakpoints rather than pixels: the question is "does the board fit", and the
     * board's answer changes at 1440 (DESIGN §3), not at every distinct width.
     */
    VIEWPORT(
        """CASE
             WHEN viewport_w IS NULL THEN NULL
             WHEN viewport_w < 640 THEN '<640'
             WHEN viewport_w < 1024 THEN '640–1023'
             WHEN viewport_w < 1440 THEN '1024–1439'
             WHEN viewport_w < 1920 THEN '1440–1919'
             ELSE '≥1920'
           END""",
    ),
}

@ApplicationScoped
class AnalyticsRepository : PanacheRepository<AnalyticsEvent> {

    /**
     * Writes a beacon. Postgres owns the conflict: the follow-ups of one visit merge into the
     * row the load ping created instead of racing it into a duplicate. PRD §5.11
     */
    fun upsert(event: AnalyticsEvent) {
        getEntityManager().createNativeQuery(UPSERT)
            .setParameter("occurredAt", event.occurredAt)
            .setParameter("path", event.path)
            .setParameter("hash", event.visitorDayHash)
            .setParameter("device", event.deviceType.name)
            .setParameter("referrer", event.referrer)
            .setParameter("referrerHost", event.referrerHost)
            .setParameter("utmSource", event.utmSource)
            .setParameter("utmMedium", event.utmMedium)
            .setParameter("utmCampaign", event.utmCampaign)
            .setParameter("waveKey", event.waveKey)
            .setParameter("viewportW", event.viewportW)
            .setParameter("viewportH", event.viewportH)
            .setParameter("scrollPct", event.scrollPct)
            .setParameter("dwellMs", event.dwellMs)
            .setParameter("isBot", event.isBot)
            .setParameter("visitId", event.visitId)
            .executeUpdate()
    }

    /** Visits, uniques, average foreground time and engaged visits per MSK day. */
    fun daily(zone: String, from: Instant, to: Instant, engagedMs: Int): List<DailyPoint> =
        getEntityManager().createNativeQuery(DAILY)
            .setParameter("zone", zone)
            .setParameter("from", from)
            .setParameter("to", to)
            .setParameter("engagedMs", engagedMs)
            .resultList
            .map { it as Array<*> }
            .map {
                DailyPoint(
                    date = it[0].toString(),
                    visits = int(it[1]),
                    uniques = int(it[2]),
                    avgDwellMs = (it[3] as Number?)?.toInt(),
                    engagedVisits = int(it[4]),
                )
            }

    /** Period totals. Uniques are distinct over the whole window, so days cannot be summed. */
    fun totals(from: Instant, to: Instant, engagedMs: Int): Totals =
        (getEntityManager().createNativeQuery(TOTALS)
            .setParameter("from", from)
            .setParameter("to", to)
            .setParameter("engagedMs", engagedMs)
            .singleResult as Array<*>)
            .let {
                Totals(
                    visits = int(it[0]),
                    uniques = int(it[1]),
                    avgDwellMs = (it[2] as Number?)?.toInt(),
                    engagedVisits = int(it[3]),
                    avgScrollPct = (it[4] as Number?)?.toInt(),
                )
            }

    fun breakdown(dimension: Dimension, from: Instant, to: Instant, engagedMs: Int, limit: Int): List<BreakdownRow> =
        getEntityManager().createNativeQuery(breakdownSql(dimension))
            .setParameter("from", from)
            .setParameter("to", to)
            .setParameter("engagedMs", engagedMs)
            .setParameter("limit", limit)
            .resultList
            .map { it as Array<*> }
            .map {
                BreakdownRow(
                    key = it[0] as String?,
                    visits = int(it[1]),
                    uniques = int(it[2]),
                    engagedVisits = int(it[3]),
                )
            }

    fun deleteOlderThan(cutoff: Instant): Long = delete("occurredAt < ?1", cutoff)

    private fun int(value: Any?): Int = (value as Number?)?.toInt() ?: 0

    private fun breakdownSql(dimension: Dimension) =
        BREAKDOWN.replace(DIMENSION_SLOT, dimension.expression)

    internal companion object {
        /**
         * A visit counts as engaged on foreground time OR on any click of its own — GA4's rule,
         * minus the second pageview a one-page board cannot have. PRD §5.11
         */
        private const val ENGAGED =
            """(a.dwell_ms >= :engagedMs
                OR EXISTS (SELECT 1 FROM interaction_event i WHERE i.visit_id = a.visit_id))"""

        private const val WINDOW = "a.is_bot = false AND a.occurred_at >= :from AND a.occurred_at < :to"

        private const val DIMENSION_SLOT = "{dimension}"

        private const val UPSERT = """
            INSERT INTO analytics_event
                (occurred_at, path, visitor_day_hash, device_type, referrer, referrer_host,
                 utm_source, utm_medium, utm_campaign, wave_key, viewport_w, viewport_h,
                 scroll_pct, dwell_ms, is_bot, visit_id)
            VALUES
                (:occurredAt, :path, :hash, :device,
                 CAST(:referrer AS varchar), CAST(:referrerHost AS varchar),
                 CAST(:utmSource AS varchar), CAST(:utmMedium AS varchar),
                 CAST(:utmCampaign AS varchar), CAST(:waveKey AS varchar),
                 CAST(:viewportW AS integer), CAST(:viewportH AS integer),
                 CAST(:scrollPct AS integer), CAST(:dwellMs AS integer),
                 :isBot, CAST(:visitId AS varchar))
            ON CONFLICT (visit_id) WHERE visit_id IS NOT NULL DO UPDATE SET
                dwell_ms = CASE
                    WHEN EXCLUDED.dwell_ms IS NULL THEN analytics_event.dwell_ms
                    ELSE GREATEST(COALESCE(analytics_event.dwell_ms, 0), EXCLUDED.dwell_ms) END,
                scroll_pct = CASE
                    WHEN EXCLUDED.scroll_pct IS NULL THEN analytics_event.scroll_pct
                    ELSE GREATEST(COALESCE(analytics_event.scroll_pct, 0), EXCLUDED.scroll_pct) END,
                referrer = COALESCE(analytics_event.referrer, EXCLUDED.referrer),
                referrer_host = COALESCE(analytics_event.referrer_host, EXCLUDED.referrer_host),
                utm_source = COALESCE(analytics_event.utm_source, EXCLUDED.utm_source),
                utm_medium = COALESCE(analytics_event.utm_medium, EXCLUDED.utm_medium),
                utm_campaign = COALESCE(analytics_event.utm_campaign, EXCLUDED.utm_campaign),
                wave_key = COALESCE(analytics_event.wave_key, EXCLUDED.wave_key),
                viewport_w = COALESCE(analytics_event.viewport_w, EXCLUDED.viewport_w),
                viewport_h = COALESCE(analytics_event.viewport_h, EXCLUDED.viewport_h)
        """

        private const val DAILY = """
            SELECT (a.occurred_at AT TIME ZONE CAST(:zone AS text))::date AS day,
                   COUNT(*),
                   COUNT(DISTINCT a.visitor_day_hash),
                   AVG(a.dwell_ms),
                   COUNT(*) FILTER (WHERE $ENGAGED)
            FROM analytics_event a
            WHERE $WINDOW
            GROUP BY day
            ORDER BY day
        """

        private const val TOTALS = """
            SELECT COUNT(*),
                   COUNT(DISTINCT a.visitor_day_hash),
                   AVG(a.dwell_ms),
                   COUNT(*) FILTER (WHERE $ENGAGED),
                   AVG(a.scroll_pct)
            FROM analytics_event a
            WHERE $WINDOW
        """

        private const val BREAKDOWN = """
            SELECT $DIMENSION_SLOT AS bucket,
                   COUNT(*),
                   COUNT(DISTINCT a.visitor_day_hash),
                   COUNT(*) FILTER (WHERE $ENGAGED)
            FROM analytics_event a
            WHERE $WINDOW
            GROUP BY bucket
            ORDER BY 2 DESC
            LIMIT :limit
        """
    }
}
