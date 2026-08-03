package world.danchuo.social

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import io.quarkus.panache.common.Sort
import jakarta.enterprise.context.ApplicationScoped

/** Доступ к соцссылкам — в порядке [SocialLink.sortOrder]. */
@ApplicationScoped
class SocialLinkRepository : PanacheRepository<SocialLink> {
    fun listOrdered(): List<SocialLink> = listAll(Sort.by("sortOrder"))
}

/**
 * Доступ к артефактам marquee — хроникой: старое первым, по [Artifact.firstMentionedOn].
 * Одна дата у двух предметов — разводит `id`, иначе порядок ленты гулял бы между запросами.
 */
@ApplicationScoped
class ArtifactRepository : PanacheRepository<Artifact> {
    fun listOrdered(): List<Artifact> = listAll(Sort.by("firstMentionedOn").and("id"))
}
