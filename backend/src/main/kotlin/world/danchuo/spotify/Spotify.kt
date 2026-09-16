/**
 * The **spotify** slice, and the proof that an external source stays isolated: OAuth, the
 * encrypted refresh token, REST clients and the Caffeine cache all live here, and core knows
 * nothing of it. Public reads are `GET /api/spotify/…`. PRD §3.1, §8
 */
package world.danchuo.spotify
