package world.danchuo.core.security

import jakarta.annotation.Priority
import jakarta.enterprise.context.ApplicationScoped
import jakarta.ws.rs.Priorities
import jakarta.ws.rs.container.ContainerRequestContext
import jakarta.ws.rs.container.ContainerRequestFilter
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import jakarta.ws.rs.ext.Provider
import org.eclipse.microprofile.config.inject.ConfigProperty
import java.util.concurrent.ConcurrentHashMap

/**
 * Мягкий рейтлимит публичных GET (PRD §3, §8, M4): in-memory токен-бакет на клиента.
 *
 * Останавливает одного шумного клиента, **не** настоящий DDoS (для последнего — Cloudflare в
 * бэклоге). Лимитируем публичное чтение `GET /api/…` и публичную телеметрию `POST /api/analytics/…`
 * (бикон + клики хитмапы, B2 — анти-абуз накрутки); `/api/ingest/…` пропускаем (там свой шов
 * «креды записи» — это трафик владельца/шортката, не публичный абуз).
 *
 * Это лёгкий самописный токен-бакет (PRD называет Bucket4j — он in-memory ровно так же; при
 * нужде заменяется без правок вызовов). Ключ клиента — `X-Forwarded-For` (за прокси Caddy);
 * без него (прямое подключение в деве) все идут в общий бакет. `danchuo.ratelimit.requests=0`
 * выключает фильтр (тесты/дев). Приоритет ниже аутентификации — лимитер не трогает 401-логику.
 */
@Provider
@Priority(Priorities.AUTHENTICATION + 100)
@ApplicationScoped
class RateLimitFilter(
    @param:ConfigProperty(name = "danchuo.ratelimit.requests") private val maxRequests: Int,
    @param:ConfigProperty(name = "danchuo.ratelimit.window-seconds") private val windowSeconds: Long,
) : ContainerRequestFilter {

    private val buckets = ConcurrentHashMap<String, Bucket>()

    override fun filter(ctx: ContainerRequestContext) {
        if (maxRequests <= 0) return // выключен (тесты/дев)
        val path = ctx.uriInfo.path.trim('/')
        // Лимитируем публичное чтение (GET) и публичную телеметрию аналитики (POST бикон/клики).
        // Прочие методы (мутации владельца под /api/ingest) — не наш контур.
        val isPublicGet = ctx.method == "GET"
        val isAnalyticsPost = ctx.method == "POST" && path.startsWith("api/analytics")
        if (!isPublicGet && !isAnalyticsPost) return
        if (!path.startsWith("api/") || path.startsWith("api/ingest")) return
        // Раздача кадров фото-дропа (B1): одна модалка-галерея = ~36 GET картинок — это не абуз,
        // а штатная загрузка статики (в проде её кэширует/отдаёт Caddy/CDN). Не лимитируем.
        if (path.startsWith("api/film-media")) return

        val key = ctx.getHeaderString("X-Forwarded-For")
            ?.split(",")?.firstOrNull()?.trim()?.takeIf { it.isNotBlank() }
            ?: "direct"
        val bucket = buckets.computeIfAbsent(key) { Bucket(maxRequests, windowSeconds) }
        if (!bucket.tryConsume()) {
            ctx.abortWith(
                Response.status(TOO_MANY_REQUESTS)
                    .type(MediaType.APPLICATION_JSON)
                    .entity("""{"error":"rate_limited"}""")
                    .build(),
            )
        }
    }

    /** Токен-бакет с непрерывным дозаливом: [capacity] токенов за окно [windowSeconds]. */
    private class Bucket(private val capacity: Int, windowSeconds: Long) {
        private val refillPerMs = capacity.toDouble() / (windowSeconds * 1000.0)
        private var tokens = capacity.toDouble()
        private var lastNanos = System.nanoTime()

        @Synchronized
        fun tryConsume(): Boolean {
            val now = System.nanoTime()
            val elapsedMs = (now - lastNanos) / 1_000_000.0
            lastNanos = now
            tokens = minOf(capacity.toDouble(), tokens + elapsedMs * refillPerMs)
            if (tokens >= 1.0) {
                tokens -= 1.0
                return true
            }
            return false
        }
    }

    private companion object {
        const val TOO_MANY_REQUESTS = 429
    }
}
