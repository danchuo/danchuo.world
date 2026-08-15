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
 * Останавливает одного шумного клиента, **не** настоящий DDoS (для последнего — рейтлимит и кэш
 * на edge, см. `Caddyfile`; Cloudflare остаётся в бэклоге). Лимитируем публичное чтение
 * `GET /api/…` и публичную телеметрию `POST /api/analytics/…` (бикон + клики хитмапы, B2 —
 * анти-абуз накрутки); `/api/ingest/…` пропускаем (там свой шов «креды записи» — это трафик
 * владельца/шортката, не публичный абуз).
 *
 * **Два независимых бакета на клиента.** Обычное чтение и раздача кадров фото-дропа считаются
 * порознь: одна модалка-галерея — это ~36 GET картинок, и в общем бакете она съедала лимит
 * целиком (борд + три открытых дропа = 130 запросов при лимите 120 ⇒ живой посетитель ловил
 * 429). Раньше `api/film-media` был исключён из лимитера совсем — то есть оставался публичной
 * ручкой без потолка, читающей файлы с диска. Теперь у него свой, кратно более щедрый бакет.
 *
 * **Запросы SSR не лимитируются вовсе.** Фронт-сервер ходит к бэку по compose-сети и метит свои
 * вызовы заголовком [INTERNAL_HEADER]; Caddy срезает этот заголовок с публичного трафика
 * (см. `Caddyfile`), поэтому подделать его снаружи нельзя. Без этой пометки весь SSR приходит
 * без `X-Forwarded-For`, попадает в общий бакет `direct` — и один шумный посетитель роняет
 * серверный рендер сразу всем.
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
    @param:ConfigProperty(name = "danchuo.ratelimit.media-requests") private val maxMediaRequests: Int,
    @param:ConfigProperty(name = "danchuo.ratelimit.window-seconds") private val windowSeconds: Long,
) : ContainerRequestFilter {

    private val buckets = ConcurrentHashMap<String, Bucket>()

    override fun filter(ctx: ContainerRequestContext) {
        if (maxRequests <= 0) return // выключен (тесты/дев)
        // Internal SSR traffic is trusted: the header can only originate inside the compose
        // network, because the edge strips it from everything arriving from outside.
        if (!ctx.getHeaderString(INTERNAL_HEADER).isNullOrBlank()) return

        val path = ctx.uriInfo.path.trim('/')
        // Лимитируем публичное чтение (GET) и публичную телеметрию аналитики (POST бикон/клики).
        // Прочие методы (мутации владельца под /api/ingest) — не наш контур.
        val isPublicGet = ctx.method == "GET"
        val isAnalyticsPost = ctx.method == "POST" && path.startsWith("api/analytics")
        if (!isPublicGet && !isAnalyticsPost) return
        if (!path.startsWith("api/") || path.startsWith("api/ingest")) return

        // Frames get their own scope and their own (much larger) allowance — see the class doc.
        val isMedia = path.startsWith("api/film-media")
        val capacity = if (isMedia) maxMediaRequests else maxRequests
        val scope = if (isMedia) "media" else "public"

        val client = ctx.getHeaderString("X-Forwarded-For")
            ?.split(",")?.firstOrNull()?.trim()?.takeIf { it.isNotBlank() }
            ?: "direct"
        // Scope is part of the key: draining one bucket must never touch the other.
        val bucket = buckets.computeIfAbsent("$scope:$client") { Bucket(capacity, windowSeconds) }
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

    companion object {
        /**
         * Метка «этот запрос пришёл изнутри compose-сети» (SSR фронта). Доверие держится на
         * одном инварианте: **edge обязан срезать этот заголовок с входящего трафика**
         * (`header_up -X-Danchuo-Internal` в `Caddyfile`). Меняешь имя здесь — меняй и там.
         */
        const val INTERNAL_HEADER = "X-Danchuo-Internal"

        private const val TOO_MANY_REQUESTS = 429
    }
}
