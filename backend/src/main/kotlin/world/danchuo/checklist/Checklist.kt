/**
 * The **checklist** slice: discipline items as data (a new one is a DB row, not a release),
 * progress `0..target` per date and item, all written by `POST /api/ingest/daily`. The same request
 * carries the day's [Activity] list, the monster among them, and its photo. PRD §3.1, §5.6
 */
package world.danchuo.checklist
