package world.danchuo.checklist

import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import jakarta.ws.rs.ext.ExceptionMapper
import jakarta.ws.rs.ext.Provider

/**
 * An unknown discipline item key in `ingest/daily` — catches a typo in the shortcut that would
 * otherwise lose data silently. [kind] is `checklist_item`.
 */
class UnknownReferenceException(val kind: String, val key: String) :
    RuntimeException("unknown $kind key: $key")

/** 422 on an unknown key: a clear error to the client rather than silent data loss. */
@Provider
class UnknownReferenceMapper : ExceptionMapper<UnknownReferenceException> {
    override fun toResponse(ex: UnknownReferenceException): Response =
        Response.status(422)
            .type(MediaType.APPLICATION_JSON)
            .entity(
                mapOf(
                    "error" to "unknown_reference",
                    "kind" to ex.kind,
                    "key" to ex.key,
                ),
            )
            .build()
}
