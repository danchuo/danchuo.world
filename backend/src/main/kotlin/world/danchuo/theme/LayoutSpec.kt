package world.danchuo.theme

import com.fasterxml.jackson.annotation.JsonIgnoreProperties

/**
 * Layout-блок волны (DESIGN §3, §10) — переопределяет дефолтную bento-раскладку фронта.
 * Хранится в `Theme.layout` (JSONB) и отдаётся в [ThemeView] как есть; бэкенд его **не
 * интерпретирует** — реестр тайлов и сам мерж живут во фронте (`layout.ts`), который знает,
 * какие компоненты существуют. Здесь — только форма контракта.
 *
 * Все поля опциональны: волна задаёт лишь дельту к дефолту (незаданное берётся из `layout.ts`).
 * Ключи [tiles] — машинные id тайлов (`today`, `music`, …); неизвестные фронту игнорируются.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class LayoutSpec(
    val grid: GridSpec? = null,
    val tiles: Map<String, TileSpanSpec>? = null,
    val mobileOrder: List<String>? = null,
)

/** Размер bento-сетки волны (по умолчанию 40×28 — см. `layout.ts`). */
@JsonIgnoreProperties(ignoreUnknown = true)
data class GridSpec(
    val cols: Int? = null,
    val rows: Int? = null,
)

/**
 * Спан/видимость/ориентация одного тайла; любое поле опционально (фолбэк — дефолт фронта).
 *
 * `ignoreUnknown`: контракт layout развивается на фронте (`layout.ts`) — новые поля волны,
 * которых эта версия бэкенда ещё не знает, не должны ронять чтение темы из JSONB (иначе
 * миграция с новым полем кладёт `/api/theme*` до пересборки бэка). Неизвестное молча
 * пропускается; но каждое НОВОЕ поле контракта всё же добавляется сюда явно — иначе Jackson
 * молча выбросит его при отдаче в [ThemeView] и волна недополучит раскладку.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class TileSpanSpec(
    val col: Int? = null,
    val row: Int? = null,
    val colSpan: Int? = null,
    val rowSpan: Int? = null,
    val hidden: Boolean? = null,
    /** Поток контента тайла: `horizontal` | `vertical` (DESIGN §10.1); интерпретирует фронт. */
    val orientation: String? = null,
)
