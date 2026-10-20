// Settings and palettes for NeverBrowser Android.

package dev.neverbrowser

import android.content.Context

data class Palette(
    val id: String,
    val name: String,
    val bg: Int,
    val panel: Int,
    val panel2: Int,
    val text: Int,
    val muted: Int,
    val accent: Int
)

object Palettes {
    val all = listOf(
        Palette("midnight", "Midnight", 0xFF101018.toInt(), 0xFF17171F.toInt(), 0xFF1D1D28.toInt(), 0xFFF5F2FF.toInt(), 0xFF9A94B3.toInt(), 0xFFFF7AB8.toInt()),
        Palette("latte", "Latte", 0xFFF6EFE6.toInt(), 0xFFFFFAF4.toInt(), 0xFFF3E9DD.toInt(), 0xFF2C2119.toInt(), 0xFF8A7766.toInt(), 0xFFC96A2B.toInt()),
        Palette("forest", "Forest", 0xFF0C1410.toInt(), 0xFF111D17.toInt(), 0xFF15251D.toInt(), 0xFFECFFF2.toInt(), 0xFF89A897.toInt(), 0xFF5FD68A.toInt()),
        Palette("sunburst", "Sunburst", 0xFF171208.toInt(), 0xFF211A0D.toInt(), 0xFF2A2111.toInt(), 0xFFFFF6E6.toInt(), 0xFFC2A97E.toInt(), 0xFFFFB23E.toInt()),
        Palette("berry", "Berry", 0xFF140F18.toInt(), 0xFF1C1422.toInt(), 0xFF241A2C.toInt(), 0xFFF7EDFF.toInt(), 0xFFA994C2.toInt(), 0xFFC084FC.toInt())
    )

    fun byId(id: String): Palette = all.firstOrNull { it.id == id } ?: all[0]
}

class Prefs(context: Context) {

    private val sp = context.getSharedPreferences("neverbrowser", Context.MODE_PRIVATE)

    var theme: String
        get() = sp.getString("theme", "midnight") ?: "midnight"
        set(value) = sp.edit().putString("theme", value).apply()

    var engine: String
        get() = sp.getString("engine", "DuckDuckGo") ?: "DuckDuckGo"
        set(value) = sp.edit().putString("engine", value).apply()

    var ghostGuard: Boolean
        get() = sp.getBoolean("ghost", true)
        set(value) = sp.edit().putBoolean("ghost", value).apply()

    var privateMode: Boolean
        get() = sp.getBoolean("private", false)
        set(value) = sp.edit().putBoolean("private", value).apply()

    var uaMode: String
        get() = sp.getString("ua", "mobile") ?: "mobile"
        set(value) = sp.edit().putString("ua", value).apply()
}
