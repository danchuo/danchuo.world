/**
 * The **days** slice: [DayRecord] on the MSK date axis, [DayRecordService] as the single write
 * point, and [DayAggregator] behind `GET /api/days/{date}` and `GET /api/days?from=&to=`.
 * Neighbouring slices are read through their public repositories, never their tables. PRD §3.1
 */
package world.danchuo.days
