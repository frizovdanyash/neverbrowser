// Ghost Guard for GeckoView: user agent, tracking protection, private sessions.

package dev.neverbrowser

import org.mozilla.geckoview.GeckoSessionSettings

class GhostGuard(private val prefs: Prefs) {

    private val mobileUa = "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0"
    private val desktopUa = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0"

    private val trackers = listOf(
        "doubleclick.net", "googlesyndication.com", "google-analytics.com",
        "facebook.net", "scorecardresearch.com", "adnxs.com", "criteo.com"
    )

    fun enabled(): Boolean = prefs.ghostGuard

    fun userAgent(): String = if (prefs.uaMode == "desktop") desktopUa else mobileUa

    fun sessionSettings(): GeckoSessionSettings {
        val builder = GeckoSessionSettings.Builder()
            .userAgentOverride(userAgent())
            .usePrivateMode(prefs.privateMode)
        if (enabled()) builder.useTrackingProtection(true)
        return builder.build()
    }

    fun blockedReason(url: String): String? {
        if (!enabled()) return null
        if (!url.startsWith("http")) return null
        val host = url.substringAfter("://").substringBefore("/").lowercase()
        val hit = trackers.firstOrNull { host == it || host.endsWith(".$it") }
        return if (hit == null) null else "Ghost Guard заблокировал трекер: $hit"
    }

    fun report(): String = buildString {
        append("User-Agent: ")
        append(if (prefs.uaMode == "desktop") "Firefox Desktop" else "Firefox Mobile")
        append("\n")
        append("Маскировка: ${if (enabled()) "включена" else "выключена"}\n")
        append("Защита от трекеров: ${if (enabled()) "включена" else "выключена"}\n")
        append("Приватный режим: ${if (prefs.privateMode) "да" else "нет"}\n")
        append("Подменённых трекеров в списке: ${trackers.size}\n\n")
        append("Ghost Guard не решает CAPTCHA. Он убирает признаки автоматизации и блокирует трекеры — капчу по-прежнему решает человек.")
    }
}
