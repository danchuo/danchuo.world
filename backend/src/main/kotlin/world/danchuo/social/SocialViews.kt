package world.danchuo.social

import io.quarkus.runtime.annotations.RegisterForReflection

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
/** Артефакт в админке: все поля формы, включая описание для поиска на кадрах (§5.12). */
@RegisterForReflection
data class AdminArtifactView(
    val id: Long,
    val name: String,
    val imageUrl: String?,
    val firstMentionedOn: String,
    val rotatable: Boolean,
    val detectionHint: String?,
)

data class ArtifactView(
    /** Нужен, чтобы соотнести предмет с рамкой его подсветки на кадре дропа (PRD §5.12). */
    val id: Long,
    val name: String,
    val imageUrl: String?,
    val firstMentionedOn: String,
    /** Можно ли класть предмет набок в ленте, идущей поперёк него (DESIGN §7.2). */
    val rotatable: Boolean,
) {
    companion object {
        fun from(a: Artifact) =
            ArtifactView(a.id!!, a.name, a.imageUrl, a.firstMentionedOn.toString(), a.rotatable)
    }
}
