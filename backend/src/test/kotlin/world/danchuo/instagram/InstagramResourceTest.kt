package world.danchuo.instagram

import io.quarkus.test.junit.QuarkusTest
import io.quarkus.test.junit.QuarkusTestProfile
import io.quarkus.test.junit.TestProfile
import io.restassured.RestAssured.given
import org.junit.jupiter.api.Test

/**
 * Публичный контракт слайса Instagram (PRD §5.17). (Требует Docker — Dev Services Postgres.)
 *
 * Аккаунт в тестах не подключён, и это ГЛАВНЫЙ проверяемый случай: неподключённый источник
 * обязан вести себя как «показывать нечего», а не как поломка.
 *
 * - `latest` отдаёт **204**, а не 404 и не пустой объект: плитка отличает пустоту от ошибки
 *   и в первом случае молча не рисует карточку (DESIGN §7);
 * - картинки, которых нет, — 404, а неизвестный вид картинки не роняет раздачу;
 * - `authorize` живёт за bearer записи (без токена 401) и при пустых кредах отвечает 503,
 *   а не ведёт владельца на заведомо битую страницу согласия.
 *
 * ⚠️ **Креды гасятся профилем, а не надеждой на пустое окружение.** Quarkus читает `.env` из
 * корня модуля и в тестовом прогоне тоже (ordinal у него выше, чем у `application.properties`,
 * так что `%test.`-override его не перебьёт). Пока источник не был настроен, «не сконфигурирован»
 * получалось само собой — и тест разваливался у первого же разработчика, который прописал
 * настоящие ключи себе в `backend/.env`. Профиль делает условие теста его собственным.
 */
@QuarkusTest
@TestProfile(InstagramResourceTest.Unconfigured::class)
class InstagramResourceTest {

    /** Слайс без кред: ровно то состояние, которое здесь и проверяется. */
    class Unconfigured : QuarkusTestProfile {
        override fun getConfigOverrides(): Map<String, String> = mapOf(
            "danchuo.instagram.client-id" to "",
            "danchuo.instagram.client-secret" to "",
            "danchuo.instagram.redirect-uri" to "",
            "danchuo.instagram.token-encryption-key" to "",
        )
    }

    private val token = "dev-ingest-token-change-me"

    @Test
    fun `latest answers no content while the account is not connected`() {
        given().get("/api/instagram/latest").then().statusCode(204)
    }

    @Test
    fun `missing media is a plain not found`() {
        given().get("/api/instagram-media/post").then().statusCode(404)
    }

    @Test
    fun `an unknown media kind does not blow up the endpoint`() {
        given().get("/api/instagram-media/whatever").then().statusCode(404)
    }

    @Test
    fun `authorize is guarded by the ingest token`() {
        given().get("/api/ingest/instagram/authorize").then().statusCode(401)
    }

    @Test
    fun `authorize refuses to build a link without credentials`() {
        given().auth().oauth2(token)
            .get("/api/ingest/instagram/authorize")
            .then().statusCode(503)
    }
}
