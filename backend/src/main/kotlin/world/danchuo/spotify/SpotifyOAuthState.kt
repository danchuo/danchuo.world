package world.danchuo.spotify

import jakarta.enterprise.context.ApplicationScoped
import world.danchuo.core.oauth.OneTimeOAuthState

/**
 * One-time OAuth CSRF `state` for Spotify — one per slice: a bean shared between two sources
 * would wipe the other's authorization in progress ([OneTimeOAuthState]).
 */
@ApplicationScoped
class SpotifyOAuthState : OneTimeOAuthState()
