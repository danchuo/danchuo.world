package world.danchuo.core.security

import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import world.danchuo.core.config.MskTime
import java.security.MessageDigest

/**
 * The daily visitor hash: `sha256(ip + ua + salt + date)`. The raw IP never leaves this class —
 * that invariant is the whole reason the class exists, and it holds for every caller. The date
 * inside rotates it daily: stable within a day, unrecognisable the next. PRD §5.11, §5.19, §11
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
