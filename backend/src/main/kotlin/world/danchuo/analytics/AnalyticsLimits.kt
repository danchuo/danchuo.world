package world.danchuo.analytics

/**
 * Ceilings for the two public telemetry endpoints, equal to the column widths in
 * `0090-analytics`: Postgres does not truncate an over-long value, it fails the insert — and
 * these endpoints take their input from anybody. PRD §5.11
 */
internal object AnalyticsLimits {
    const val PATH = 512
    const val VISIT_ID = 64
    const val REFERRER = 512
}
