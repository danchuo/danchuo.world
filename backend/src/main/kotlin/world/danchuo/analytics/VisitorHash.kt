package world.danchuo.analytics

import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import world.danchuo.core.config.MskTime
import java.security.MessageDigest

/**
 * Суточный хэш посетителя (PRD §5.11, §11): `sha256(ip + ua + соль + дата)`.
 *
 * **Сырой IP никогда не хранится** — наружу идёт только хэш. Соль ротируется ежедневно:
 * статический серверный секрет (`danchuo.analytics.salt`) комбинируется с датой MSK, так что
 * один и тот же посетитель за день даёт стабильный хэш (уник), а назавтра — другой
 * (нельзя связать посещения через сутки → как правило, cookie-баннер не нужен).
 */
@ApplicationScoped
class VisitorHash(
    @param:ConfigProperty(name = "danchuo.analytics.salt") private val salt: String,
    private val mskTime: MskTime,
) {

    fun of(ip: String, userAgent: String): String {
        val day = mskTime.today().toString()
        val material = "$ip|$userAgent|$salt|$day"
        val digest = MessageDigest.getInstance("SHA-256").digest(material.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }
}
