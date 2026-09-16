/**
 * The **checklist** slice: discipline items as data (a new one is a DB row, not a release),
 * progress `0..target` per date and item, all written by `POST /api/ingest/daily`. Monster rides
 * its own ingest field rather than a counter in `items`. PRD §3.1, §5.6
 */
package world.danchuo.checklist
