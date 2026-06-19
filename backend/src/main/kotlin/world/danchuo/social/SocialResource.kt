package world.danchuo.social

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType

/**
 * Публичное чтение соцссылок и артефактов (PRD §5.8, §12 M4). Всё на чтение, без токена (§3).
 *
 * - `GET /api/social-links` — ссылки (иконка/название/url) в порядке владельца.
 * - `GET /api/artifacts` — артефакты marquee (картинка/название/дата первого упоминания).
 *
 * Пусто (нет записей) ⇒ пустой массив, не ошибка — фронт рисует тихое пустое состояние.
 */
@Path("/api")
@Produces(MediaType.APPLICATION_JSON)
class SocialResource(
    private val links: SocialLinkRepository,
    private val artifacts: ArtifactRepository,
) {

    @GET
    @Path("/social-links")
    fun socialLinks(): List<SocialLinkView> = links.listOrdered().map(SocialLinkView::from)

    @GET
    @Path("/artifacts")
    fun artifacts(): List<ArtifactView> = artifacts.listOrdered().map(ArtifactView::from)
}
