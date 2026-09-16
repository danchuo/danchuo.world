package world.danchuo.film

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.junit.jupiter.api.AfterEach
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasKey
import org.hamcrest.Matchers.hasSize
import org.junit.jupiter.api.Test
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import javax.imageio.ImageIO

/**
 * Artifact highlighting on frames (PRD §5.12): a scan, manual boxes, public output. Tests have no
 * LLM key, which is the valuable case: frames must stay UNCHECKED rather than "checked, nothing
 * found" — otherwise one provider failure would be recorded as the absence of artifacts.
 */
@QuarkusTest
class ArtifactScanResourceTest {

    private val token = "dev-ingest-token-change-me"

    /**
     * The DB is shared and a neighbouring test asserts the drop list is empty, so drops seeded
     * here must disappear even if this test dies halfway.
     */
    private val created = mutableListOf<Long>()

    @AfterEach
    fun cleanUp() {
        created.forEach { id ->
            given().header("Authorization", "Bearer $token").delete("/api/ingest/drops/$id")
        }
        created.clear()
    }

    @Test
    fun `scan requires bearer`() {
        given().post("/api/ingest/drops/1/artifacts").then().statusCode(401)
        given().post("/api/ingest/artifact-scan").then().statusCode(401)
    }

    @Test
    fun `silent model leaves frames unchecked instead of marking them empty`() {
        val dropId = upload()

        given().header("Authorization", "Bearer $token")
            .post("/api/ingest/drops/$dropId/artifacts")
            .then().statusCode(202)

        // The scan does not finish synchronously, but by the end nothing may be marked checked.
        awaitScanFinished(dropId)
        given().header("Authorization", "Bearer $token")
            .get("/api/ingest/drops/$dropId/artifacts")
            .then().statusCode(200)
            .body("checked", equalTo(0))

        // And there are no findings either — the public frame output is clean.
        given().get("/api/drops/$dropId")
            .then().statusCode(200)
            .body("[0].artifacts", hasSize<Any>(0))
    }

    @Test
    fun `manual box shows up publicly and can be removed`() {
        val dropId = upload()
        val photoId = firstPhotoId(dropId)
        val artifactId = anyArtifactId()

        given().header("Authorization", "Bearer $token")
            .contentType("application/json")
            .body("""{"x0":0.1,"y0":0.2,"x1":0.6,"y1":0.8}""")
            .put("/api/ingest/drops/$dropId/photos/$photoId/artifacts/$artifactId")
            .then().statusCode(200)

        given().get("/api/drops/$dropId")
            .then().statusCode(200)
            .body("[0].artifacts", hasSize<Any>(1))
            .body("[0].artifacts[0].artifactId", equalTo(artifactId.toInt()))
            .body("[0].artifacts[0].x0", equalTo(0.1f))
            .body("[0].artifacts[0].y1", equalTo(0.8f))
            // The item's picture travels with the box: the hint shows the thing itself,
            // and does not make a second request to the catalogue to do it.
            .body("[0].artifacts[0]", hasKey("imageUrl"))
            // The "may lie flat" flag: the hint card holds a landscape slot, and without the flag
            // an elongated item (a racket) degenerates into a thread.
            .body("[0].artifacts[0]", hasKey("rotatable"))

        given().header("Authorization", "Bearer $token")
            .delete("/api/ingest/drops/$dropId/photos/$photoId/artifacts/$artifactId")
            .then().statusCode(200)

        given().get("/api/drops/$dropId")
            .then().body("[0].artifacts", hasSize<Any>(0))
    }

    @Test
    fun `admin frame carries the web variant — thumb is too coarse to mark on`() {
        val dropId = upload()

        given().header("Authorization", "Bearer $token")
            .get("/api/ingest/drops/$dropId/photos")
            .then().statusCode(200)
            // Box fractions are taken from the drawn size, so on a 96px preview a one-pixel miss
            // is a percent of the frame. Marking up needs web.
            .body("[0].imageUrl", org.hamcrest.Matchers.containsString("/web"))
            .body("[0].thumbUrl", org.hamcrest.Matchers.containsString("/thumb"))
    }

    @Test
    fun `snatched box stays gone after a rerun`() {
        // Deleting marks the finding rejected instead of erasing the row: otherwise the next scan
        // would find the item again and the box would come back.
        val dropId = upload()
        val photoId = firstPhotoId(dropId)
        val artifactId = anyArtifactId()

        given().header("Authorization", "Bearer $token")
            .contentType("application/json")
            .body("""{"x0":0.1,"y0":0.2,"x1":0.6,"y1":0.8}""")
            .put("/api/ingest/drops/$dropId/photos/$photoId/artifacts/$artifactId")
            .then().statusCode(200)

        given().header("Authorization", "Bearer $token")
            .delete("/api/ingest/drops/$dropId/photos/$photoId/artifacts/$artifactId")
            .then().statusCode(200)

        // A rescan over already-checked frames must not touch the rejected pair.
        given().header("Authorization", "Bearer $token")
            .post("/api/ingest/drops/$dropId/artifacts?recheck=true")
            .then().statusCode(202)
        awaitScanFinished(dropId)

        given().get("/api/drops/$dropId")
            .then().statusCode(200)
            .body("[0].artifacts", hasSize<Any>(0))
    }

    @Test
    fun `rejected box can be brought back by drawing it again`() {
        val dropId = upload()
        val photoId = firstPhotoId(dropId)
        val artifactId = anyArtifactId()
        val box = """{"x0":0.1,"y0":0.2,"x1":0.6,"y1":0.8}"""

        given().header("Authorization", "Bearer $token").contentType("application/json").body(box)
            .put("/api/ingest/drops/$dropId/photos/$photoId/artifacts/$artifactId")
            .then().statusCode(200)
        given().header("Authorization", "Bearer $token")
            .delete("/api/ingest/drops/$dropId/photos/$photoId/artifacts/$artifactId")
            .then().statusCode(200)
        given().get("/api/drops/$dropId").then().body("[0].artifacts", hasSize<Any>(0))

        // A manual box on the same pair overrides the rejection — there is a way back.
        given().header("Authorization", "Bearer $token").contentType("application/json").body(box)
            .put("/api/ingest/drops/$dropId/photos/$photoId/artifacts/$artifactId")
            .then().statusCode(200)
        given().get("/api/drops/$dropId").then().body("[0].artifacts", hasSize<Any>(1))
    }

    @Test
    fun `inverted or out-of-frame box is rejected`() {
        val dropId = upload()
        val photoId = firstPhotoId(dropId)
        val artifactId = anyArtifactId()

        given().header("Authorization", "Bearer $token")
            .contentType("application/json")
            .body("""{"x0":0.8,"y0":0.2,"x1":0.3,"y1":0.9}""")
            .put("/api/ingest/drops/$dropId/photos/$photoId/artifacts/$artifactId")
            .then().statusCode(400)

        given().header("Authorization", "Bearer $token")
            .contentType("application/json")
            .body("""{"x0":0.1,"y0":0.2,"x1":1.4,"y1":0.9}""")
            .put("/api/ingest/drops/$dropId/photos/$photoId/artifacts/$artifactId")
            .then().statusCode(400)
    }

    @Test
    fun `archive scan reports a summary and can be scoped to one artifact`() {
        val dropId = upload()
        val artifactId = anyArtifactId()

        // On a long scan the named item in the summary is the only sign of what is being looked for.
        given().header("Authorization", "Bearer $token")
            .post("/api/ingest/artifact-scan?artifactId=$artifactId")
            .then().statusCode(202)
            .body("artifactName", org.hamcrest.Matchers.notNullValue())

        awaitScanFinished(dropId)

        given().header("Authorization", "Bearer $token")
            .get("/api/ingest/artifact-scan")
            .then().statusCode(200)
            .body("drops", org.hamcrest.Matchers.greaterThan(0))
            // The model is silent ⇒ not one checked frame, all of them skipped.
            .body("checked", equalTo(0))
    }

    @Test
    fun `scan scoped to a missing artifact is a 404, not a silent full scan`() {
        given().header("Authorization", "Bearer $token")
            .post("/api/ingest/artifact-scan?artifactId=99999")
            .then().statusCode(404)
    }

    @Test
    fun `cancelling with nothing running is a conflict, not a false success`() {
        // Nothing to cancel, and the reply must say so: otherwise the stop button would claim to
        // have halted a scan that had already ended.
        given().header("Authorization", "Bearer $token")
            .delete("/api/ingest/artifact-scan")
            .then().statusCode(409)
    }

    // ── Helpers ──

    private fun awaitScanFinished(dropId: Long) {
        repeat(50) {
            val state = given().header("Authorization", "Bearer $token")
                .get("/api/ingest/drops/$dropId/artifacts")
                .then().extract().jsonPath().getString("state")
            // `queued` — the drop is still waiting: the single worker may be busy with a neighbour.
            if (state != "running" && state != "queued") return
            Thread.sleep(100)
        }
    }

    private fun anyArtifactId(): Long = given().get("/api/artifacts")
        .then().statusCode(200)
        .extract().jsonPath().getLong("[0].id")

    private fun firstPhotoId(dropId: Long): Long = given().header("Authorization", "Bearer $token")
        .get("/api/ingest/drops/$dropId/photos")
        .then().statusCode(200)
        .extract().jsonPath().getLong("[0].id")

    private fun upload(): Long = given()
        .header("Authorization", "Bearer $token")
        .multiPart("zip", zipOfImages(1))
        .multiPart("title", "Artifacts scan test")
        .multiPart("date", "2026-06-11")
        .post("/api/ingest/drops")
        .then().statusCode(201)
        .extract().jsonPath().getLong("drop.id")
        .also { created += it }

    private fun zipOfImages(count: Int): File {
        val file = File.createTempFile("drop-artifacts", ".zip")
        ZipOutputStream(file.outputStream()).use { zip ->
            repeat(count) { i ->
                val img = BufferedImage(120, 80, BufferedImage.TYPE_INT_RGB)
                img.createGraphics().apply {
                    color = Color(30 + i * 20, 120, 150)
                    fillRect(0, 0, 120, 80)
                    dispose()
                }
                val bytes = ByteArrayOutputStream().also { ImageIO.write(img, "png", it) }.toByteArray()
                zip.putNextEntry(ZipEntry("IMG_%04d.png".format(i)))
                zip.write(bytes)
                zip.closeEntry()
            }
        }
        file.deleteOnExit()
        return file
    }
}
