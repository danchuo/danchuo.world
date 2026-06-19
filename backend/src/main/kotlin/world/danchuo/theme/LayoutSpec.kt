package world.danchuo.theme

/**
 * Layout-блок волны (DESIGN §3, §10) — переопределяет дефолтную bento-раскладку фронта.
 * Хранится в `Theme.layout` (JSONB) и отдаётся в [ThemeView] как есть; бэкенд его **не
 * интерпретирует** — реестр тайлов и сам мерж живут во фронте (`layout.ts`), который знает,
 * какие компоненты существуют. Здесь — только форма контракта.
 *
 * Все поля опциональны: волна задаёт лишь дельту к дефолту (незаданное берётся из `layout.ts`).
 * Ключи [tiles] — машинные id тайлов (`today`, `music`, …); неизвестные фронту игнорируются.
 */
data class LayoutSpec(
    val grid: GridSpec? = null,
    val tiles: Map<String, TileSpanSpec>? = null,
    val mobileOrder: List<String>? = null,
)

/** Размер bento-сетки волны (по умолчанию 40×28 — см. `layout.ts`). */
data class GridSpec(
    val cols: Int? = null,
    val rows: Int? = null,
)

/** Спан/видимость одного тайла; любое поле опционально (фолбэк — дефолт фронта). */
data class TileSpanSpec(
    val col: Int? = null,
    val row: Int? = null,
    val colSpan: Int? = null,
    val rowSpan: Int? = null,
    val hidden: Boolean? = null,
)
