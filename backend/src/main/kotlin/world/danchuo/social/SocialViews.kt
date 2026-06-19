package world.danchuo.social

/**
 * Публичные read-проекции слайса social (PRD §5.8). `GET /api/social-links` и
 * `GET /api/artifacts` отдают эти DTO; фронт рисует блок ссылок и marquee артефактов.
 */

/** Соцссылка: иконка + подпись + гиперссылка. */
data class SocialLinkView(
    val platform: String,
    val name: String,
    val url: String,
    val icon: String?,
) {
    companion object {
        fun from(s: SocialLink) = SocialLinkView(s.platform, s.name, s.url, s.icon)
    }
}

/**
 * Артефакт marquee. [firstMentionedOn] — ISO-строка (`YYYY-MM-DD`); в UI показывается
 * только в ховер-поповере (§5.8, DESIGN §7.2), не в самой строке.
 */
data class ArtifactView(
    val name: String,
    val imageUrl: String?,
    val firstMentionedOn: String,
) {
    companion object {
        fun from(a: Artifact) = ArtifactView(a.name, a.imageUrl, a.firstMentionedOn.toString())
    }
}
