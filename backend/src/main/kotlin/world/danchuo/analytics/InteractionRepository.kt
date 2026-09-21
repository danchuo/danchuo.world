package world.danchuo.analytics

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import jakarta.enterprise.context.ApplicationScoped
import java.time.Instant

@ApplicationScoped
class InteractionRepository : PanacheRepository<InteractionEvent> {

    fun countInRange(from: Instant, to: Instant): Int =
        count("isBot = false and occurredAt >= ?1 and occurredAt < ?2", from, to).toInt()

    /**
     * Per-tile totals over `[from, to)`. Each visitor's contribution to a tile is capped here,
     * in SQL: one spammed visit must not repaint the map, and the cap belongs beside the count
     * rather than after it. PRD §5.11, §11
     */
    fun tileTotals(path: String, from: Instant, to: Instant, visitorCap: Int): List<TileTotal> =
        getEntityManager().createNativeQuery(TILE_TOTALS)
            .setParameter("path", path)
            .setParameter("from", from)
            .setParameter("to", to)
            .setParameter("cap", visitorCap)
            .resultList
            .map { it as Array<*> }
            .map {
                TileTotal(
                    tileId = it[0] as String?,
                    clicks = (it[1] as Number).toInt(),
                    uniques = (it[2] as Number).toInt(),
                )
            }

    /**
     * The click cloud, binned to a [grid]×[grid] lattice per tile. Raw points would grow with
     * traffic; bins are bounded by the lattice however many clicks land in them.
     */
    fun tileBins(path: String, from: Instant, to: Instant, grid: Int): List<TileBin> =
        getEntityManager().createNativeQuery(TILE_BINS)
            .setParameter("path", path)
            .setParameter("from", from)
            .setParameter("to", to)
            .setParameter("grid", grid)
            .resultList
            .map { it as Array<*> }
            .map {
                TileBin(
                    tileId = it[0] as String?,
                    x = (it[1] as Number).toInt(),
                    y = (it[2] as Number).toInt(),
                    clicks = (it[3] as Number).toInt(),
                )
            }

    fun deleteOlderThan(cutoff: Instant): Long = delete("occurredAt < ?1", cutoff)

    private companion object {
        private const val WINDOW =
            "path = :path AND is_bot = false AND occurred_at >= :from AND occurred_at < :to"

        private const val TILE_TOTALS = """
            SELECT tile_id, SUM(LEAST(per_visitor, CAST(:cap AS int))), COUNT(*)
            FROM (
                SELECT tile_id, visitor_day_hash, COUNT(*) AS per_visitor
                FROM interaction_event
                WHERE $WINDOW
                GROUP BY tile_id, visitor_day_hash
            ) capped
            GROUP BY tile_id
            ORDER BY 2 DESC
        """

        /**
         * `LEAST(grid - 1, ...)` keeps a click at exactly 1.0 inside the last bin instead of
         * letting it open a row of its own past the lattice edge.
         */
        private const val TILE_BINS = """
            SELECT tile_id,
                   LEAST(CAST(:grid AS int) - 1, FLOOR(offset_x_pct * CAST(:grid AS int)))::int AS bin_x,
                   LEAST(CAST(:grid AS int) - 1, FLOOR(offset_y_pct * CAST(:grid AS int)))::int AS bin_y,
                   COUNT(*)
            FROM interaction_event
            WHERE $WINDOW AND offset_x_pct IS NOT NULL AND offset_y_pct IS NOT NULL
            GROUP BY tile_id, bin_x, bin_y
        """
    }
}
