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
     * Сконфигурирован ли слайс целиком. Пока чего-то нет — публичные GET отдают пусто,
     * а OAuth-флоу не запускается (защита от полупустого старта).
     */
    fun isConfigured(): Boolean =
        clientId().orElse("").isNotBlank() &&
            clientSecret().orElse("").isNotBlank() &&
            redirectUri().orElse("").isNotBlank() &&
            tokenEncryptionKey().orElse("").isNotBlank()
}
