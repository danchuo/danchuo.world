package world.danchuo.analytics

import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import world.danchuo.core.config.MskTime
import java.security.MessageDigest

/**
 * The daily visitor hash: `sha256(ip + ua + salt + date)`. The raw IP never leaves this class.
 * The date inside the hash rotates it every day, so one visitor is stable within a day and
 * unrecognisable the next. PRD §5.11, §11
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
