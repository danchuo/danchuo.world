package world.danchuo.checklist

/**
 * What the day had, as picked in the shortcut's one list (PRD §5.6). The shortcut shows the
 * [label]s, so either the key or the label is accepted, in any case. The order is the board's.
 */
enum class Activity(val key: String, val label: String) {
    BOULDERING("bouldering", "болдеринг"),
    SQUASH("squash", "сквош"),
    BADMINTON("badminton", "бадминтон"),
    GYM("gym", "зал"),
    PULLUPS("pullups", "турники"),
    DIPS("dips", "брусья"),
    PUSHUPS("pushups", "отжимания"),
    ;

    companion object {
        fun parse(value: String): Activity? =
            entries.firstOrNull { it.key.equals(value, true) || it.label.equals(value, true) }
    }
}
