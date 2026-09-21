/**
 * The **health** slice: steps, sleep and sleep phases from `POST /api/ingest/health`,
 * written onto `DayRecord` through its owner. The night is assembled HERE, not on the phone —
 * [SleepSessionizer] takes the session that ENDED on the target day (§4). PRD §3.1, §5.4
 */
package world.danchuo.health
