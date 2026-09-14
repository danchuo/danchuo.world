package world.danchuo.spotify

import jakarta.enterprise.context.ApplicationScoped
import world.danchuo.core.oauth.OneTimeOAuthState

/**
 * CSRF-`state` one-time OAuth Spotify (PRD §M3) — свой на слайс: общий бин на два источника
 * затирал бы чужую начатую авторизацию ([OneTimeOAuthState]).
 */
@ApplicationScoped
class SpotifyOAuthState : OneTimeOAuthState()
