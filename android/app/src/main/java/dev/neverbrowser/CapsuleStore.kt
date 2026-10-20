// Time Capsule storage for Android: page screenshots and metadata.

package dev.neverbrowser

import android.graphics.Bitmap
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class Capsule(
    val id: String,
    val title: String,
    val url: String,
    val createdAt: Long,
    val shot: File?
)

class CapsuleStore(private val dir: File) {

    private val indexFile = File(dir, "index.json")
    private val items = mutableListOf<Capsule>()

    init {
        dir.mkdirs()
        runCatching {
            val array = JSONArray(indexFile.readText())
            for (i in 0 until array.length()) {
                val obj = array.getJSONObject(i)
                val shotName = obj.optString("shot", "")
                items.add(
                    Capsule(
                        obj.getString("id"),
                        obj.optString("title", obj.getString("url")),
                        obj.getString("url"),
                        obj.optLong("createdAt", 0L),
                        if (shotName.isEmpty()) null else File(dir, shotName)
                    )
                )
            }
        }
    }

    fun all(): List<Capsule> = items.toList()

    fun add(title: String, url: String, bitmap: Bitmap?): Capsule {
        val id = System.currentTimeMillis().toString()
        var file: File? = null
        if (bitmap != null) {
            file = File(dir, "$id.png")
            runCatching {
                file.outputStream().use { out -> bitmap.compress(Bitmap.CompressFormat.PNG, 90, out) }
            }
        }
        val capsule = Capsule(id, title, url, System.currentTimeMillis(), file)
        items.add(0, capsule)
        save()
        return capsule
    }

    fun remove(id: String) {
        val found = items.firstOrNull { it.id == id } ?: return
        found.shot?.delete()
        items.remove(found)
        save()
    }

    fun whenLabel(capsule: Capsule): String =
        SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault()).format(Date(capsule.createdAt))

    private fun save() {
        val array = JSONArray()
        for (capsule in items) {
            array.put(JSONObject().apply {
                put("id", capsule.id)
                put("title", capsule.title)
                put("url", capsule.url)
                put("createdAt", capsule.createdAt)
                put("shot", capsule.shot?.name ?: "")
            })
        }
        indexFile.writeText(array.toString())
    }
}
