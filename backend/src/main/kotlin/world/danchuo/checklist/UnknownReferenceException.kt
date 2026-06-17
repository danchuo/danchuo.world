package world.danchuo.checklist

import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import jakarta.ws.rs.ext.ExceptionMapper
import jakarta.ws.rs.ext.Provider

/**
 * Неизвестный ключ в `ingest/daily` (пункт дисциплины или вкус монстра) — ловит
 * опечатку в шортке, иначе данные молча терялись бы. [kind] = `checklist_item` | `monster_flavor`.
 */
class UnknownReferenceException(val kind: String, val key: String) :
    RuntimeException("unknown $kind key: $key")

/** 422 на неизвестный ключ — внятная ошибка клиенту, не молчаливая потеря данных. */
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
