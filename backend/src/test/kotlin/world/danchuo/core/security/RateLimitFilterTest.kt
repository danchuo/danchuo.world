package world.danchuo.core.security

import io.quarkus.test.junit.QuarkusTest
import io.quarkus.test.junit.QuarkusTestProfile
import io.quarkus.test.junit.TestProfile
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test

/**
 * Рейтлимит публичных GET (PRD §3, §8; `RateLimitFilter`): мягкий токен-бакет по IP. В обычном
 * `%test` профиле лимитер выключен (`requests=0`), поэтому здесь поднимаем его через [SmallLimit]
 * с маленьким лимитом и длинным окном (дозалив за время теста пренебрежимо мал) и проверяем
 * 429, изоляцию по клиенту и то, что эндпоинты `/api/ingest/…` лимитер не трогает.
 *
 * Каждый тест использует свой `X-Forwarded-For` ⇒ свой бакет ⇒ методы не мешают друг другу
 * (инстанс приложения один на профиль). Требует Docker — Dev Services Postgres.
 */
@QuarkusTest
@TestProfile(RateLimitFilterTest.SmallLimit::class)
class RateLimitFilterTest {

    class SmallLimit : QuarkusTestProfile {
        override fun getConfigOverrides() = mapOf(
            "danchuo.ratelimit.requests" to "3",
            "danchuo.ratelimit.media-requests" to "5",
            "danchuo.ratelimit.window-seconds" to "3600",
        )
    }

    private val token = "dev-ingest-token-change-me"

    @Test
    fun `public GET is throttled with 429 once the bucket is empty`() {
        val ip = "203.0.113.10"
        // Бакет на 3 токена: первые три проходят…
        repeat(3) {
            given().header("X-Forwarded-For", ip).get("/api/theme/active")
                .then().statusCode(200)
        }
        // …четвёртый отбивается (дозалив за миллисекунды ничтожен при окне 3600с).
        given().header("X-Forwarded-For", ip).get("/api/theme/active")
            .then().statusCode(429)
            .body("error", equalTo("rate_limited"))
    }

    @Test
    fun `limit is per-client - a fresh IP keeps its own full bucket`() {
        val noisy = "203.0.113.20"
        // Шумный клиент исчерпывает свой бакет до 429…
        repeat(4) { given().header("X-Forwarded-For", noisy).get("/api/theme/active") }
        given().header("X-Forwarded-For", noisy).get("/api/theme/active")
            .then().statusCode(429)
        // …а другой IP не задет — ключ бакета это X-Forwarded-For.
        given().header("X-Forwarded-For", "203.0.113.99").get("/api/theme/active")
            .then().statusCode(200)
    }

    @Test
    fun `X-Forwarded-For chain is keyed by the first hop`() {
        // За цепочкой прокси клиент — первый IP; хвост (Caddy и т.п.) игнорируется.
        val first = "198.51.100.7"
        val chain = "$first, 10.0.0.1, 172.16.0.1"
        repeat(3) {
            given().header("X-Forwarded-For", chain).get("/api/theme/active")
                .then().statusCode(200)
        }
        given().header("X-Forwarded-For", chain).get("/api/theme/active")
            .then().statusCode(429)
        // Тот же первый хоп с другим хвостом попадает в ТОТ ЖЕ бакет (уже пустой) ⇒ 429.
        given().header("X-Forwarded-For", "$first, 10.9.9.9").get("/api/theme/active")
            .then().statusCode(429)
    }

    @Test
    fun `film frames spend their own bucket, not the public one`() {
        val ip = "203.0.113.40"
        // Публичный бакет вычерпан досуха…
        repeat(4) { given().header("X-Forwarded-For", ip).get("/api/theme/active") }
        given().header("X-Forwarded-For", ip).get("/api/theme/active")
            .then().statusCode(429)
        // …а кадры дропа продолжают ходить: у них отдельный, более щедрый бакет.
        // 404 (в тестах хранилище пустое) — важно, что НЕ 429: лимитер пропустил запрос.
        given().header("X-Forwarded-For", ip).get("/api/film-media/1/1/thumb")
            .then().statusCode(404)
    }

    @Test
    fun `film bucket still stops a flood of frames`() {
        val ip = "203.0.113.50"
        // Щедрый — не значит бесконечный: 5 кадров проходят…
        repeat(5) {
            given().header("X-Forwarded-For", ip).get("/api/film-media/1/1/thumb")
                .then().statusCode(404)
        }
        // …шестой отбивается. Раньше ручка была исключена из лимитера совсем.
        given().header("X-Forwarded-For", ip).get("/api/film-media/1/1/thumb")
            .then().statusCode(429)
            .body("error", equalTo("rate_limited"))
    }

    @Test
    fun `draining the film bucket leaves the public one untouched`() {
        val ip = "203.0.113.60"
        // Кадры выбраны до отказа…
        repeat(6) { given().header("X-Forwarded-For", ip).get("/api/film-media/1/1/thumb") }
        given().header("X-Forwarded-For", ip).get("/api/film-media/1/1/thumb")
            .then().statusCode(429)
        // …а обычное чтение того же клиента не задето: бакеты независимы в обе стороны.
        given().header("X-Forwarded-For", ip).get("/api/theme/active")
            .then().statusCode(200)
    }

    @Test
    fun `SSR calls marked as internal are never rate-limited`() {
        val ip = "203.0.113.70"
        // Фронт-сервер ходит к бэку по compose-сети и метит свои запросы доверенным
        // заголовком (Caddy срезает его с публичного трафика). Такие запросы не тратят
        // бакет — иначе SSR всех посетителей мира дерётся за один общий лимит.
        repeat(6) {
            given().header(RateLimitFilter.INTERNAL_HEADER, "1").header("X-Forwarded-For", ip)
                .get("/api/theme/active")
                .then().statusCode(200)
        }
        // Бакет клиента при этом нетронут — внутренние запросы его не расходовали.
        repeat(3) {
            given().header("X-Forwarded-For", ip).get("/api/theme/active")
                .then().statusCode(200)
        }
    }

    @Test
    fun `authenticated ingest reads are never rate-limited`() {
        val ip = "203.0.113.30"
        // С валидным токеном ingest проходит; лимитер целиком пропускает api/ingest —
        // даже сверх лимита бакета (6 > 3) нет ни одного 429 (свой шов «креды записи»).
        repeat(6) {
            given().auth().oauth2(token).header("X-Forwarded-For", ip)
                .get("/api/ingest/analytics/summary")
                .then().statusCode(200)
        }
    }
}
