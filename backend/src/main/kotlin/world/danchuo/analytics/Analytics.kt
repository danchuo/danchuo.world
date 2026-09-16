/**
 * The **analytics** slice: our own cookieless counter in Postgres, no third parties, plus the
 * per-tile click heatmap (B2). Raw IPs are never stored — only a daily visitor hash.
 * PRD §3.1, §5.11
 */
package world.danchuo.analytics
