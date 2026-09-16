package world.danchuo.instagram

import io.quarkus.test.junit.QuarkusTest
import io.quarkus.test.junit.QuarkusTestProfile
import io.quarkus.test.junit.TestProfile
import io.restassured.RestAssured.given
import org.junit.jupiter.api.Test

/**
 * The Instagram slice's public contract (PRD §5.17), with no account connected — the main case:
 * an unconnected source must behave as "nothing to show", not as breakage. `latest` gives 204 so
 * the tile can tell empty from error, missing pictures are 404, `authorize` is 401 then 503.
 */

/**
 * ⚠️ Credentials are silenced by a PROFILE, not by hoping the environment is empty. Quarkus reads
 * `.env` from the module root in tests too, at a higher ordinal than `%test.` overrides, so this
 * broke for the first developer who put real keys in `backend/.env`.
 */
@QuarkusTest
@TestProfile(InstagramResourceTest.Unconfigured::class)
class InstagramResourceTest {

    /** The slice with no credentials: exactly the state under test. */
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
