package world.danchuo.theme

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.notNullValue
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.Test

/**
 * `GET /api/theme/active` и `/api/themes` (PRD §5.9, §12 M4; DESIGN §10, §10.1): публичное
 * чтение, активная волна 01 отдаёт токены (JSONB); список выпущенных содержит её и демо-волну 02
 * с layout-дельтой (layout-per-wave).
 */
@QuarkusTest
class ThemeResourceTest {

    @Test
    fun `active theme is public and returns wave01 tokens`() {
        given().get("/api/theme/active")
            .then().statusCode(200)
            .body("key", equalTo("wave-01"))
            .body("active", equalTo(true))
            // токены инжектятся в :root — ключевые роли волны 01 на месте
            .body("tokens.'bg-page'", equalTo("#faf1eb"))
            .body("tokens.accent", notNullValue())
    }

    @Test
    fun `active wave01 has no layout - frontend falls back to default`() {
        // Волна 01 не несёт layout (null) ⇒ фронт берёт дефолтную bento-раскладку (layout.ts).
        given().get("/api/theme/active")
            .then().statusCode(200)
            .body("layout", nullValue())
    }

    @Test
    fun `themes list includes the released wave`() {
        given().get("/api/themes")
            .then().statusCode(200)
            .body("key", hasItem("wave-01"))
    }

    @Test
    fun `wave02 carries a layout delta - mirrored board, distinct from wave01`() {
        // Демо-волна 02 несёт переработанную раскладку (зеркальная перекомпоновка, миграция 0180):
        // доминанта «Сегодня» и периферия меняют сторону относительно дефолта волны 01, и в layout
        // учтён тайл поездки (ride). Фронт мержит дельту поверх дефолта layout.ts.
        given().get("/api/themes")
            .then().statusCode(200)
            .body("key", hasItem("wave-02"))
            // «Сегодня» сдвинута влево (дефолт col 14 → 12), календарь уехал в левую колонку (31 → 2).
            .body("find { it.key == 'wave-02' }.layout.tiles.today.col", equalTo(12))
            .body("find { it.key == 'wave-02' }.layout.tiles.calendar.col", equalTo(2))
            // новый тайл поездки разложен волной (правая колонка).
            .body("find { it.key == 'wave-02' }.layout.tiles.ride.col", equalTo(33))
    }
}
