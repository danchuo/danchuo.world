package world.danchuo.core.security

import io.quarkus.test.junit.QuarkusTest
import io.quarkus.test.junit.QuarkusTestProfile
import io.quarkus.test.junit.TestProfile
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test

/**
 * Soft per-IP token bucket over public GETs (PRD §8). The `%test` profile disables the limiter,
 * so [SmallLimit] raises it with a tiny limit and a long window; each test uses its own
 * `X-Forwarded-For` ⇒ its own bucket. Needs Docker — Dev Services Postgres.
 */
@QuarkusTest
@TestProfile(RateLimitFilterTest.SmallLimit::class)
class RateLimitFilterTest {

    class SmallLimit : QuarkusTestProfile {
        override fun getConfigOverrides() = mapOf(
            "danchuo.ratelimit.requests" to "3",
            "danchuo.ratelimit.media-requests" to "5",
            "danchuo.ratelimit.window-seconds" to "3600",
            "danchuo.ratelimit.feedback-requests" to "4",
            "danchuo.ratelimit.tierlist-requests" to "2",
        )
    }

    private val token = "dev-ingest-token-change-me"

    @Test
    fun `public GET is throttled with 429 once the bucket is empty`() {
        val ip = "203.0.113.10"
        // A bucket of 3 tokens: the first three pass…
        repeat(3) {
            given().header("X-Forwarded-For", ip).get("/api/artifacts")
                .then().statusCode(200)
        }
        // …the fourth is rejected (a refill over milliseconds is nothing against a 3600s window).
        given().header("X-Forwarded-For", ip).get("/api/artifacts")
            .then().statusCode(429)
            .body("error", equalTo("rate_limited"))
    }

    @Test
    fun `limit is per-client - a fresh IP keeps its own full bucket`() {
        val noisy = "203.0.113.20"
        // The noisy client drains its own bucket down to 429…
        repeat(4) { given().header("X-Forwarded-For", noisy).get("/api/artifacts") }
        given().header("X-Forwarded-For", noisy).get("/api/artifacts")
            .then().statusCode(429)
        // …and another IP is untouched: the bucket key is X-Forwarded-For.
        given().header("X-Forwarded-For", "203.0.113.99").get("/api/artifacts")
            .then().statusCode(200)
    }

    @Test
    fun `X-Forwarded-For chain is keyed by the last hop, so a forged head cannot buy a new bucket`() {
        // The real client is the entry CADDY appended, i.e. the last one. Everything before it
        // arrived from outside and is worth nothing. PRD §8
        val real = "198.51.100.7"
        repeat(3) {
            given().header("X-Forwarded-For", "10.0.0.1, $real").get("/api/artifacts")
                .then().statusCode(200)
        }
        // Rotating the forged head lands in the SAME (already empty) bucket ⇒ still 429.
        given().header("X-Forwarded-For", "10.9.9.9, $real").get("/api/artifacts")
            .then().statusCode(429)
            .body("error", equalTo("rate_limited"))
    }

    @Test
    fun `film frames spend their own bucket, not the public one`() {
        val ip = "203.0.113.40"
        // The public bucket is drained dry…
        repeat(4) { given().header("X-Forwarded-For", ip).get("/api/artifacts") }
        given().header("X-Forwarded-For", ip).get("/api/artifacts")
            .then().statusCode(429)
        // …while drop frames keep flowing: they have their own, more generous bucket. The 404
        // (storage is empty in tests) is the point — NOT 429, so the limiter let the request through.
        given().header("X-Forwarded-For", ip).get("/api/film-media/1/1/thumb")
            .then().statusCode(404)
    }

    @Test
    fun `film bucket still stops a flood of frames`() {
        val ip = "203.0.113.50"
        // Generous is not infinite: five frames pass…
        repeat(5) {
            given().header("X-Forwarded-For", ip).get("/api/film-media/1/1/thumb")
                .then().statusCode(404)
        }
        // …and the sixth is rejected.
        given().header("X-Forwarded-For", ip).get("/api/film-media/1/1/thumb")
            .then().statusCode(429)
            .body("error", equalTo("rate_limited"))
    }

    @Test
    fun `draining the film bucket leaves the public one untouched`() {
        val ip = "203.0.113.60"
        // Frames drained to refusal…
        repeat(6) { given().header("X-Forwarded-For", ip).get("/api/film-media/1/1/thumb") }
        given().header("X-Forwarded-For", ip).get("/api/film-media/1/1/thumb")
            .then().statusCode(429)
        // …and ordinary reads by the same client are untouched: the buckets are independent both ways.
        given().header("X-Forwarded-For", ip).get("/api/artifacts")
            .then().statusCode(200)
    }

    @Test
    fun `tier lists spend their own tighter bucket, and draining it leaves notes free`() {
        val ip = "203.0.113.80"
        // The body is invalid on purpose: a 400 is the point — the limiter let it through, not 429.
        repeat(2) {
            given().header("X-Forwarded-For", ip).contentType("application/json").body("{}")
                .post("/api/tierlists").then().statusCode(400)
        }
        given().header("X-Forwarded-For", ip).contentType("application/json").body("{}")
            .post("/api/tierlists").then().statusCode(429)
        given().header("X-Forwarded-For", ip).contentType("application/json").body("{}")
            .post("/api/feedback").then().statusCode(400)
    }

    @Test
    fun `addresses of one IPv6 64 share a bucket`() {
        repeat(3) { i ->
            given().header("X-Forwarded-For", "2001:db8:5:6::${i + 1}").get("/api/artifacts")
                .then().statusCode(200)
        }
        given().header("X-Forwarded-For", "2001:db8:5:6:abcd::1").get("/api/artifacts")
            .then().statusCode(429)
    }

    @Test
    fun `SSR calls marked as internal are never rate-limited`() {
        val ip = "203.0.113.70"
        // The frontend server reaches the backend over the compose network and marks its requests
        // with a trusted header (Caddy strips it from public traffic). Those spend no bucket —
        // otherwise every visitor's SSR would fight over one shared limit.
        repeat(6) {
            given().header(RateLimitFilter.INTERNAL_HEADER, "1").header("X-Forwarded-For", ip)
                .get("/api/artifacts")
                .then().statusCode(200)
        }
        // The client's bucket is intact: internal requests did not spend it.
        repeat(3) {
            given().header("X-Forwarded-For", ip).get("/api/artifacts")
                .then().statusCode(200)
        }
    }

    @Test
    fun `authenticated ingest reads are never rate-limited`() {
        val ip = "203.0.113.30"
        // With a valid token ingest passes: the limiter skips api/ingest entirely, so even
        // past the bucket limit (6 > 3) there is not a single 429 — write creds are their own seam.
        repeat(6) {
            given().auth().oauth2(token).header("X-Forwarded-For", ip)
                .get("/api/ingest/analytics/summary")
                .then().statusCode(200)
        }
    }
}
