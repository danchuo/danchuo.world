package world.danchuo.theme

import com.fasterxml.jackson.annotation.JsonIgnoreProperties

/**
 * A wave's layout block, overriding the frontend's default bento. It is stored in `Theme.layout`
 * and passed through AS IS — the backend does NOT interpret it, since the tile registry and the
 * merge live in `layout.ts`, which knows what components exist. DESIGN §3, §10
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class LayoutSpec(
    val grid: GridSpec? = null,
    val tiles: Map<String, TileSpanSpec>? = null,
    val mobileOrder: List<String>? = null,
    /**
     * The drop GALLERY's edition: `mosaic` (frontend default) or `roll`. It sits at the layout
     * root rather than in a tile's span, because both drop tiles open the gallery and a wave has
     * one edition. Only the contract's shape lives here; the frontend interprets it. DESIGN §7.5
     */
    val gallery: String? = null,
)

/** Size of the wave's bento grid; the default 40x28 lives in `layout.ts`. */
@JsonIgnoreProperties(ignoreUnknown = true)
data class GridSpec(
    val cols: Int? = null,
    val rows: Int? = null,
)

/**
 * One tile's span, visibility and orientation, every field optional. `ignoreUnknown` keeps a wave
 * with newer fields from breaking theme reads — but each NEW contract field must still be added
 * here explicitly, or Jackson silently drops it on the way out and the wave loses its layout.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class TileSpanSpec(
    val col: Int? = null,
    val row: Int? = null,
    val colSpan: Int? = null,
    val rowSpan: Int? = null,
    val hidden: Boolean? = null,
    /** The tile's content flow: `horizontal` or `vertical`, interpreted by the frontend. §10.1 */
    val orientation: String? = null,
    /** The tile's edition — one of its layouts; only the tile itself knows the set. DESIGN §10.1 */
    val edition: String? = null,
    /** How the wave dresses project "planets": `model` means a 3D artifact. DESIGN §12.5 */
    val planet: String? = null,
)
