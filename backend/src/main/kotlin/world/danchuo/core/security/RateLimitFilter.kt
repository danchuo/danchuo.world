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
 * Soft in-memory token bucket over public GETs and the analytics telemetry POSTs, sized to stop a
 * noisy client rather than a real DDoS (edge limits live in `Caddyfile`). Two buckets per client,
 * SSR exempt via [INTERNAL_HEADER], `requests=0` disables it — the numbers and why: PRD §8.
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
        if (maxRequests <= 0) return // disabled (tests and dev)
        // Internal SSR traffic is trusted: the header can only originate inside the compose
        // network, because the edge strips it from everything arriving from outside.
        if (!ctx.getHeaderString(INTERNAL_HEADER).isNullOrBlank()) return

        val path = ctx.uriInfo.path.trim('/')
        // Limit public reads (GET) and public analytics telemetry (beacon/click POSTs). Other
        // methods are owner mutations under /api/ingest and out of this contour.
        val isPublicGet = ctx.method == "GET"
        val isAnalyticsPost = ctx.method == "POST" && path.startsWith("api/analytics")
        if (!isPublicGet && !isAnalyticsPost) return
        if (!path.startsWith("api/") || path.startsWith("api/ingest")) return

        // Frames get their own scope and their own (much larger) allowance — see the class doc.
        val isMedia = path.startsWith("api/film-media")
        val capacity = if (isMedia) maxMediaRequests else maxRequests
        val scope = if (isMedia) "media" else "public"

        val client = ClientIp.fromForwardedFor(ctx.getHeaderString("X-Forwarded-For")) ?: "direct"
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

    /** Token bucket with continuous refill: [capacity] tokens per [windowSeconds] window. */
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
         * Marks a request as coming from inside the compose network (the frontend's SSR). The
         * trust rests on one invariant: the edge MUST strip this header from incoming traffic
         * (`header_up -X-Danchuo-Internal` in `Caddyfile`). Rename it here, rename it there.
         */
        const val INTERNAL_HEADER = "X-Danchuo-Internal"

        private const val TOO_MANY_REQUESTS = 429
    }
}
