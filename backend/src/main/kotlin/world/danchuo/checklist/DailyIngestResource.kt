package world.danchuo.checklist

import com.fasterxml.jackson.annotation.JsonFormat
import jakarta.transaction.Transactional
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import org.eclipse.microprofile.config.inject.ConfigProperty
import world.danchuo.core.config.MskTime
import world.danchuo.days.DayPhotoService
import java.time.LocalDate
import java.util.Base64

/**
 * `POST /api/ingest/daily` — the iOS shortcut: day name, progress, activities, photo. Idempotent
 * by date, and the date is clamped to the manual-entry window
 * (`danchuo.checklist.ingest-window-days`), so a typo on the phone is a 400. PRD §5.6, §12
 */
@Path("/api/ingest/daily")
class DailyIngestResource(
    private val dailyIngestService: DailyIngestService,
    private val dayPhotos: DayPhotoService,
    private val mskTime: MskTime,
    @param:ConfigProperty(name = "danchuo.checklist.ingest-window-days") private val windowDays: Long,
) {

    data class DailyIngestRequest(
        val date: LocalDate? = null,
        val title: String? = null,
        /** Item progress as `{itemKey: count}`. The `monster` item has its own field. */
        val items: Map<String, Int> = emptyMap(),
        /**
         * Monster: any non-empty value means "drank", null or empty means "did not".
         * The name is WIRE, not semantic — the phone shortcut posts a flavour name here, and
         * renaming the field would break it for nothing. Flavours themselves are gone (§5.6).
         */
        val monsterFlavorKey: String? = null,
        /** [Activity] keys or labels, the monster among them; one newline-joined string is a list too. */
        @field:JsonFormat(with = [JsonFormat.Feature.ACCEPT_SINGLE_VALUE_AS_ARRAY])
        val activities: List<String>? = null,
        /** The day's photo, base64 JPEG or PNG (line breaks allowed); absent keeps the stored one. */
        val photo: String? = null,
    )

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Transactional
    fun ingest(req: DailyIngestRequest): Response {
        val date = req.date
            ?: return Response.status(Response.Status.BAD_REQUEST)
                .type(MediaType.APPLICATION_JSON)
                .entity(mapOf("error" to "missing_field", "field" to "date"))
                .build()

        val today = mskTime.today()
        if (date.isAfter(today) || date.isBefore(today.minusDays(windowDays))) {
            return Response.status(Response.Status.BAD_REQUEST)
                .type(MediaType.APPLICATION_JSON)
                .entity(mapOf("error" to "date_out_of_window", "windowDays" to windowDays))
                .build()
        }

        val photo = req.photo?.let { raw ->
            runCatching { Base64.getMimeDecoder().decode(raw) }.getOrNull()?.let(dayPhotos::process)
                ?: return Response.status(Response.Status.BAD_REQUEST)
                    .type(MediaType.APPLICATION_JSON)
                    .entity(mapOf("error" to "bad_photo"))
                    .build()
        }

        dailyIngestService.ingest(
            date = date,
            title = req.title,
            items = req.items,
            monster = req.monsterFlavorKey,
            activities = req.activities.orEmpty(),
            photo = photo,
        )

        return Response.ok(mapOf("date" to date.toString())).build()
    }
}
