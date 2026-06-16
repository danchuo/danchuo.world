package world.danchuo.core.security

import jakarta.enterprise.context.ApplicationScoped
import jakarta.ws.rs.container.ContainerRequestContext
import jakarta.ws.rs.container.ContainerRequestFilter
import jakarta.ws.rs.core.HttpHeaders
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import jakarta.ws.rs.ext.Provider
import org.eclipse.microprofile.config.inject.ConfigProperty
import java.security.MessageDigest

/**
 * Сквозной шов «креды записи» (PRD §3, §7; CLAUDE.md).
 *
 * Защищается не контент, а право записи: мутирующие эндпоинты живут под
 * `/api/ingest/…` и требуют статический bearer-токен в `Authorization`.
 * Все `GET` публичны. Фильтр путевой — любой будущий ingest-эндпоинт
 * слайса защищается автоматически, без правок в слайсе.
 */
@Provider
@ApplicationScoped
class IngestAuthFilter(
    @param:ConfigProperty(name = "danchuo.ingest.token") private val expectedToken: String,
) : ContainerRequestFilter {

    override fun filter(ctx: ContainerRequestContext) {
        val path = ctx.uriInfo.path.trim('/')
        if (!path.startsWith(INGEST_PREFIX)) return

        val header = ctx.getHeaderString(HttpHeaders.AUTHORIZATION)
        if (!isValid(header)) {
            ctx.abortWith(
                Response.status(Response.Status.UNAUTHORIZED)
                    .type(MediaType.APPLICATION_JSON)
                    .entity("""{"error":"unauthorized"}""")
                    .build(),
            )
        }
    }

    private fun isValid(header: String?): Boolean {
        if (header == null || !header.startsWith(BEARER)) return false
        val provided = header.substring(BEARER.length).trim()
        // Сравнение за константное время — не утекаем длину/префикс токена по таймингу.
        return MessageDigest.isEqual(
            provided.toByteArray(Charsets.UTF_8),
            expectedToken.toByteArray(Charsets.UTF_8),
        )
    }

    private companion object {
        const val INGEST_PREFIX = "api/ingest"
        const val BEARER = "Bearer "
    }
}
