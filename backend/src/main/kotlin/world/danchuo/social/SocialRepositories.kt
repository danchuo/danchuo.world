package world.danchuo.social

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import io.quarkus.panache.common.Sort
import jakarta.enterprise.context.ApplicationScoped

/** Access to social links, in [SocialLink.sortOrder]. */
@ApplicationScoped
class SocialLinkRepository : PanacheRepository<SocialLink> {
    fun listOrdered(): List<SocialLink> = listAll(Sort.by("sortOrder"))
}

/**
 * Access to marquee artifacts, as a chronicle: oldest first by [Artifact.firstMentionedOn]. Two
 * items sharing a date are separated by `id`, or the marquee order would drift between requests.
 */
@ApplicationScoped
class ArtifactRepository : PanacheRepository<Artifact> {
    fun listOrdered(): List<Artifact> = listAll(Sort.by("firstMentionedOn").and("id"))
}
