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
    fun `wave02 is the obscura restyle - cloud-paper palette and pixel display font`() {
        // Волна 02 «Obscura» (миграция 0200): 8-бит аркада на «облачной бумаге». Полный токен-набор
        // перекрывает :root целиком; сердце стиля — пиксельный дисплей-шрифт на бренд-блоке.
        given().get("/api/themes")
            .then().statusCode(200)
            .body("key", hasItem("wave-02"))
            // небесно-голубой холст вместо персика волны 01
            .body("find { it.key == 'wave-02' }.tokens.'bg-page'", equalTo("#e3f1fe"))
            // единственный Signal Orange
            .body("find { it.key == 'wave-02' }.tokens.accent", equalTo("#ff5e24"))
            // токен дисплей-шрифта присутствует (Jersey 10 через --font-jersey)
            .body("find { it.key == 'wave-02' }.tokens.'font-display'", notNullValue())
    }

    @Test
    fun `wave02 carries its own arcade-cabinet layout, distinct from wave01`() {
        // Волна 02 несёт уникальную раскладку «аркадный автомат» (миграция 0200): «Сегодня» —
        // доминанта по центру (col 14), marquee — баннер на всю ширину сверху (row 1), календарь
        // в левой колонке (col 1). Фронт мержит спаны поверх дефолта layout.ts.
        given().get("/api/themes")
            .then().statusCode(200)
            .body("key", hasItem("wave-02"))
            // «Сегодня» центрирована (col 14), доминанта сцены
            .body("find { it.key == 'wave-02' }.layout.tiles.today.col", equalTo(14))
            // marquee — верхний баннер на всю ширину (row 1)
            .body("find { it.key == 'wave-02' }.layout.tiles.marquee.row", equalTo(1))
            // календарь — левая колонка
            .body("find { it.key == 'wave-02' }.layout.tiles.calendar.col", equalTo(1))
    }
}
