package world.danchuo.spotify

import io.smallrye.config.ConfigMapping
import io.smallrye.config.WithDefault
import java.util.Optional

/**
 * Конфиг внешнего источника Spotify (PRD §M3, §8) — весь OAuth/кэш живёт в слайсе,
 * ядро внешних источников не знает. Значения — в `application.properties` под
 * префиксом `danchuo.spotify`; секреты в prod строго из env, в коммит не попадают.
 *
 * Креды — `Optional`: до регистрации Spotify-приложения их нет (env пуст), и слайс
 * обязан подниматься «не сконфигурированным», а не падать ([isConfigured]). Важно:
 * SmallRye трактует пустую строку как отсутствие значения, поэтому именно `Optional`,
 * а не `String` с пустым дефолтом (иначе валидация конфига роняет старт в prod).
 */
@ConfigMapping(prefix = "danchuo.spotify")
interface SpotifyConfig {

    /** Client ID зарегистрированного Spotify-приложения. */
    fun clientId(): Optional<String>

    /** Client Secret приложения (Basic-auth на token-эндпоинте). */
    fun clientSecret(): Optional<String>

    /**
     * Redirect URI, в точности как прописан в дашборде Spotify-приложения. Указывает на
     * [SpotifyAuthResource] callback; в `application.properties` есть loopback-дефолт.
     */
    fun redirectUri(): Optional<String>

    /** OAuth-скоупы read-only слоя: now-playing / recently-played / top. */
    @WithDefault("user-read-currently-playing user-read-recently-played user-top-read")
    fun scopes(): String

    /**
     * Ключ шифрования refresh-токена at-rest (PRD §8): Base64 ровно 32 байта (AES-256).
     * Сгенерировать: `openssl rand -base64 32`. В prod — из env, не в коммите.
     */
    fun tokenEncryptionKey(): Optional<String>

    /**
     * Запись прослушанных подкастов (PRD §5.6). Методы объявлены, чтобы SmallRye-валидация
     * `@ConfigMapping` приняла свойства `danchuo.spotify.podcast.*` под префиксом; интервал
     * читается плейсхолдером `@Scheduled` в [PodcastPoller], остальное — прямо отсюда.
     */
    fun podcast(): Podcast

    interface Podcast {
        /** Включена ли запись прослушивания (в `%test` выключена — иначе тесты полезут наружу). */
        @WithDefault("true")
        fun enabled(): Boolean

        /**
         * Интервал опроса плеера (формат Quarkus `every`). Минута — компромисс: недобор на
         * старте сессии не превышает интервал, а 1440 запросов в сутки для лимитов Spotify
         * незаметны.
         */
        @WithDefault("60s")
        fun pollInterval(): String

        /**
         * Рынок для запроса каталога. Без него (и без страны в токене) Spotify считает контент
         * недоступным и отдаёт пустой ответ.
         */
        @WithDefault("RU")
        fun market(): String

        /**
         * Сколько молчания рвёт сессию. Пауза короче — та же сессия (вышел из метро, доиграл);
         * длиннее — новое прослушивание, даже если эпизод тот же. На сумму минут за день не
         * влияет вовсе, только на то, одной строкой лягут сессии или двумя.
         */
        @WithDefault("15")
        fun sessionGapMinutes(): Long
    }

    /**
     * Сконфигурирован ли слайс целиком. Пока чего-то нет — публичные GET отдают пусто,
     * а OAuth-флоу не запускается (защита от полупустого старта).
     */
    fun isConfigured(): Boolean =
        clientId().orElse("").isNotBlank() &&
            clientSecret().orElse("").isNotBlank() &&
            redirectUri().orElse("").isNotBlank() &&
            tokenEncryptionKey().orElse("").isNotBlank()
}
