package world.danchuo.social

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import io.quarkus.panache.common.Sort
import jakarta.enterprise.context.ApplicationScoped

/** Доступ к соцссылкам — в порядке [SocialLink.sortOrder]. */
@ApplicationScoped
class SocialLinkRepository : PanacheRepository<SocialLink> {
    fun listOrdered(): List<SocialLink> = listAll(Sort.by("sortOrder"))
}

/** Доступ к артефактам marquee — в порядке [Artifact.sortOrder]. */
@ApplicationScoped
class ArtifactRepository : PanacheRepository<Artifact> {
    fun listOrdered(): List<Artifact> = listAll(Sort.by("sortOrder"))
}
