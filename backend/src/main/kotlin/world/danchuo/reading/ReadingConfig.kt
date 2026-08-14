package world.danchuo.reading

import io.smallrye.config.ConfigMapping
import io.smallrye.config.WithDefault
import java.util.Optional

/**
 * Конфиг слайса чтения (PRD §5.16). Внешний источник — полка Anx Reader, которую телефон
 * синкает на наш WebDAV; ядро о ней не знает, весь разбор живёт здесь.
 *
 * Путь — `Optional`: без настроенной полки слайс обязан подниматься «не сконфигурированным»
 * и молчать, а не падать (как spotify без кред). SmallRye считает пустую строку отсутствием
 * значения, поэтому именно `Optional`, а не `String` с пустым дефолтом.
 */
@ConfigMapping(prefix = "danchuo.reading")
interface ReadingConfig {

    /**
     * Корень полки: каталог, в который WebDAV-сервер кладёт присланное читалкой. Внутри —
     * `anx/database<N>.db` и `anx/data/{file,cover}/…`; мы читаем только базу и обложки.
     */
    fun shelfDir(): Optional<String>

    /** Включён ли фоновый забор статистики (в `%test` выключен — иначе поллер пишет мимо фикстур). */
    @WithDefault("true")
    fun enabled(): Boolean

    /**
     * Интервал опроса полки (формат Quarkus `every`). Читается плейсхолдером в [ReadingPoller];
     * метод объявлен, чтобы валидация `@ConfigMapping` приняла свойство под префиксом.
     */
    @WithDefault("5m")
    fun pollInterval(): String

    /**
     * Пауза, после которой чтение считается новой сессией, а не продолжением прежней.
     * По умолчанию 45 минут: две получасовые сессии за вечер должны остаться двумя строками,
     * а отложенный на пять минут телефон — одной.
     */
    @WithDefault("45")
    fun sessionGapMinutes(): Long

    /**
     * Порог, ниже которого новая сессия не заводится: открыл книгу глянуть — это не чтение.
     * Уже открытую сессию порог не трогает (дочитанные полминуты — часть захода).
     *
     * Секунды при этом не теряются: зачёт считается разницей с записанным, поэтому недобранное
     * просто ждёт, пока наберётся на минуту, и заезжает целиком (см. [ReadingSessionMath]).
     */
    @WithDefault("60")
    fun minSessionSeconds(): Int

    /** Пересказ прочитанного куска (PRD §5.16). */
    fun summary(): Summary

    /** Настроена ли полка. Пустой путь ⇒ слайс молчит: это нормальное состояние, а не поломка. */
    fun isConfigured(): Boolean = shelfDir().isPresent && shelfDir().get().isNotBlank()

    interface Summary {

        /** Включён ли фоновый счёт пересказов (в `%test` выключен — иначе он ходил бы в модель). */
        @WithDefault("true")
        fun enabled(): Boolean

        /**
         * Такт очереди (формат Quarkus `every`). Читается плейсхолдером в [ReadingSummaryPoller];
         * метод объявлен, чтобы валидация `@ConfigMapping` приняла свойство под префиксом.
         */
        @WithDefault("2m")
        fun interval(): String

        /**
         * Потолок выдержки в знаках. Держит один вызов внутри самого скупого free-лимита
         * (12 тыс. токенов в минуту), а заход длиннее берётся окнами по всей длине.
         */
        @WithDefault("12000")
        fun maxChars(): Int

        /** Сколько раз пробовать сессию, прежде чем оставить её без пересказа. */
        @WithDefault("3")
        fun maxAttempts(): Int
    }
}
