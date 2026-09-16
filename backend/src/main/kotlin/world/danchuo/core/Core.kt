/**
 * The **core** package: only what every slice shares and none of them owns — the bearer filter on
 * `/api/ingest`, the MSK/genesis canon, the cache wiring. Closed for change, open for use: a new
 * feature is a new slice beside [world.danchuo.days], never an edit here. PRD §3.1, §4
 */
package world.danchuo.core
