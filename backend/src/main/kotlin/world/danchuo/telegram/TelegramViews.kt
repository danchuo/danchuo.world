package world.danchuo.telegram

import io.quarkus.runtime.annotations.RegisterForReflection

/**
 * The Telegram card for the board, nothing beyond it. [avatarUrl] is OUR address, never Telegram's
 * CDN. There is deliberately no profile link: it already lives in the social link the card pops up
 * from. [RegisterForReflection] is mandatory — see docs/pitfalls.md. PRD §5.18
 */
@RegisterForReflection
data class TelegramProfileView(
    val name: String,
    val username: String,
    val bio: String?,
    val avatarUrl: String?,
)
