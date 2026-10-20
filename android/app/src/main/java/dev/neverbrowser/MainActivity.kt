// NeverBrowser for Android: GeckoView tabs, capsule snapshots, Ghost Guard, themes.

package dev.neverbrowser

import android.app.AlertDialog
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import org.mozilla.geckoview.AllowOrDeny
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoRuntimeSettings
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoView
import java.io.File

class MainActivity : AppCompatActivity() {

    private lateinit var root: LinearLayout
    private lateinit var tabScroll: HorizontalScrollView
    private lateinit var tabStrip: LinearLayout
    private lateinit var viewContainer: FrameLayout
    private lateinit var urlBar: EditText
    private lateinit var btnBack: TextView
    private lateinit var btnForward: TextView
    private lateinit var btnReload: TextView
    private lateinit var btnCapsule: TextView
    private lateinit var btnMenu: TextView

    private lateinit var prefs: Prefs
    private lateinit var ghost: GhostGuard
    private lateinit var capsules: CapsuleStore
    private lateinit var runtime: GeckoRuntime

    private val tabs = mutableListOf<Tab>()
    private var active: Tab? = null
    private var seq = 0L

    private inner class Tab(
        val id: Long,
        val session: GeckoSession,
        val view: GeckoView,
        var title: String,
        var url: String
    ) {
        var canBack = false
        var canForward = false
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = Prefs(this)
        ghost = GhostGuard(prefs)
        capsules = CapsuleStore(File(filesDir, "capsules"))

        runtime = GeckoRuntime.create(
            applicationContext,
            GeckoRuntimeSettings.Builder()
                .javaScriptEnabled(true)
                .webManifest(false)
                .remoteDebuggingEnabled(false)
                .build()
        )

        root = findViewById(R.id.root)
        tabScroll = findViewById(R.id.tabScroll)
        tabStrip = findViewById(R.id.tabStrip)
        viewContainer = findViewById(R.id.viewContainer)
        urlBar = findViewById(R.id.urlBar)
        btnBack = findViewById(R.id.btnBack)
        btnForward = findViewById(R.id.btnForward)
        btnReload = findViewById(R.id.btnReload)
        btnCapsule = findViewById(R.id.btnCapsule)
        btnMenu = findViewById(R.id.btnMenu)

        wire()
        applyTheme(Palettes.byId(prefs.theme))
        newTab(START)

        intent?.data?.let { openUri(it.toString()) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.data?.let { openUri(it.toString()) }
    }

    override fun onResume() {
        super.onResume()
        active?.session?.setActive(true)
    }

    override fun onPause() {
        active?.session?.setActive(false)
        super.onPause()
    }

    override fun onBackPressed() {
        val tab = active
        if (tab != null && tab.canBack) tab.session.goBack() else super.onBackPressed()
    }

    private fun wire() {
        btnBack.setOnClickListener { active?.session?.goBack() }
        btnForward.setOnClickListener { active?.session?.goForward() }
        btnReload.setOnClickListener { active?.session?.reload() }
        btnCapsule.setOnClickListener { captureCapsule() }
        btnMenu.setOnClickListener { showMenu(it) }

        urlBar.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_GO || actionId == EditorInfo.IME_ACTION_DONE) {
                navigate(urlBar.text.toString())
                true
            } else {
                false
            }
        }
    }

    private fun newTab(url: String = START): Tab {
        val session = GeckoSession(ghost.sessionSettings())
        val view = GeckoView(this)
        view.layoutParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        viewContainer.addView(view)

        val tab = Tab(++seq, session, view, "Новая вкладка", url)
        tabs.add(tab)

        session.progressDelegate = object : GeckoSession.ProgressDelegate {
            override fun onPageStart(session: GeckoSession, url: String) {
                tab.url = url
                if (isActive(tab)) syncBar()
            }

            override fun onProgressChange(session: GeckoSession, progress: Int) {
                if (isActive(tab)) btnReload.alpha = if (progress in 1..99) 0.45f else 1f
            }

            override fun onPageStop(session: GeckoSession, success: Boolean) {
                if (isActive(tab)) {
                    btnReload.alpha = 1f
                    syncBar()
                }
            }
        }

        session.contentDelegate = object : GeckoSession.ContentDelegate {
            override fun onTitleChange(session: GeckoSession, title: String?) {
                tab.title = title ?: hostOf(tab.url)
                renderTabs()
            }
        }

        session.navigationDelegate = object : GeckoSession.NavigationDelegate {
            override fun onLocationChange(
                session: GeckoSession,
                url: String?,
                perms: MutableList<GeckoSession.PermissionDelegate.ContentPermission>,
                hasUserGesture: Boolean
            ) {
                if (url != null && !url.startsWith("resource://")) {
                    tab.url = url
                    if (isActive(tab)) syncBar()
                }
            }

            override fun onCanGoBack(session: GeckoSession, canGoBack: Boolean) {
                tab.canBack = canGoBack
                if (isActive(tab)) syncBar()
            }

            override fun onCanGoForward(session: GeckoSession, canGoForward: Boolean) {
                tab.canForward = canGoForward
                if (isActive(tab)) syncBar()
            }

            override fun onLoadRequest(
                session: GeckoSession,
                request: GeckoSession.NavigationDelegate.LoadRequest
            ): GeckoResult<AllowOrDeny>? {
                val uri = request.uri
                if (uri.startsWith("never://")) {
                    session.loadUri(homeUrl())
                    return GeckoResult.deny()
                }
                val reason = ghost.blockedReason(uri)
                if (reason != null) {
                    toast(reason)
                    return GeckoResult.deny()
                }
                return GeckoResult.allow()
            }
        }

        session.open(runtime)
        view.setSession(session)
        session.loadUri(if (url == START) homeUrl() else url)

        selectTab(tab)
        return tab
    }

    private fun selectTab(tab: Tab) {
        active = tab
        for (item in tabs) {
            item.view.visibility = if (item === tab) View.VISIBLE else View.GONE
            item.session.setActive(item === tab)
        }
        syncBar()
        renderTabs()
    }

    private fun closeTab(tab: Tab) {
        viewContainer.removeView(tab.view)
        tab.view.releaseSession()
        tab.session.close()
        tabs.remove(tab)
        if (active === tab) {
            active = null
            val next = tabs.lastOrNull()
            if (next != null) selectTab(next) else newTab(START)
        }
        renderTabs()
    }

    private fun isActive(tab: Tab): Boolean = active === tab

    private fun syncBar() {
        val tab = active ?: return
        if (!urlBar.hasFocus()) {
            urlBar.setText(if (tab.url.startsWith("resource://")) "" else tab.url)
        }
        btnBack.alpha = if (tab.canBack) 1f else 0.35f
        btnForward.alpha = if (tab.canForward) 1f else 0.35f
    }

    private fun navigate(input: String) {
        val tab = active ?: return
        val value = input.trim()
        if (value.isEmpty()) return
        val target = when {
            value.startsWith("http://") || value.startsWith("https://") -> value
            value.startsWith("never://") -> HOME
            value.contains(" ") || !value.contains(".") -> engineUrl(value)
            else -> "https://$value"
        }
        tab.session.loadUri(target)
        urlBar.clearFocus()
        hideKeyboard()
    }

    private fun homeUrl(): String = HOME + "#" + Uri.encode(prefs.engine)

    private fun engineUrl(query: String): String {
        val base = ENGINES[prefs.engine] ?: ENGINES.getValue("DuckDuckGo")
        return base + Uri.encode(query)
    }

    private fun captureCapsule() {
        val tab = active ?: return
        if (tab.url.startsWith("resource://")) {
            toast("На странице старта нечего сохранять")
            return
        }
        tab.view.capturePixels().accept(
            { bitmap -> saveCapsule(tab, bitmap) },
            { error -> toast("Капсула не снята: " + (error?.message ?: "unknown")) }
        )
    }

    private fun saveCapsule(tab: Tab, bitmap: Bitmap?) {
        val scaled = bitmap?.let {
            Bitmap.createScaledBitmap(it, it.width / 2, it.height / 2, true)
        }
        capsules.add(tab.title, tab.url, scaled)
        toast("Капсула сохранена: " + tab.title.take(32))
    }

    private fun showCapsules() {
        val items = capsules.all()
        if (items.isEmpty()) {
            AlertDialog.Builder(this)
                .setTitle("Time Capsule")
                .setMessage("Пока пусто. Открой страницу и нажми ◷ в тулбаре.")
                .setPositiveButton("Снять капсулу") { _, _ -> captureCapsule() }
                .setNegativeButton("Закрыть", null)
                .show()
            return
        }
        val labels = items.map { it.title.take(44) + "\n" + capsules.whenLabel(it) }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("Time Capsule · ${items.size}")
            .setItems(labels) { _, which -> showCapsuleActions(items[which]) }
            .setPositiveButton("Снять капсулу") { _, _ -> captureCapsule() }
            .setNegativeButton("Закрыть", null)
            .show()
    }

    private fun showCapsuleActions(capsule: Capsule) {
        val options = arrayOf("Открыть страницу", "Посмотреть снимок", "Удалить капсулу")
        AlertDialog.Builder(this)
            .setTitle(capsule.title)
            .setItems(options) { _, which ->
                when (which) {
                    0 -> newTab(capsule.url)
                    1 -> showShot(capsule)
                    2 -> {
                        capsules.remove(capsule.id)
                        toast("Капсула удалена")
                    }
                }
            }
            .setNegativeButton("Назад", null)
            .show()
    }

    private fun showShot(capsule: Capsule) {
        val file = capsule.shot
        val bitmap = if (file != null && file.exists()) BitmapFactory.decodeFile(file.absolutePath) else null
        if (bitmap == null) {
            toast("У этой капсулы нет снимка")
            return
        }
        val image = ImageView(this)
        image.setImageBitmap(bitmap)
        image.adjustViewBounds = true
        image.setPadding(dp(12), dp(12), dp(12), dp(12))
        AlertDialog.Builder(this)
            .setTitle(capsule.title)
            .setView(image)
            .setPositiveButton("Закрыть", null)
            .show()
    }

    private fun showGhost() {
        val enabled = prefs.ghostGuard
        AlertDialog.Builder(this)
            .setTitle("Ghost Guard")
            .setMessage(ghost.report())
            .setPositiveButton(if (enabled) "Выключить" else "Включить") { _, _ ->
                prefs.ghostGuard = !enabled
                toast(if (enabled) "Ghost Guard выключен" else "Ghost Guard включён")
            }
            .setNeutralButton(if (prefs.uaMode == "desktop") "Mobile UA" else "Desktop UA") { _, _ ->
                prefs.uaMode = if (prefs.uaMode == "desktop") "mobile" else "desktop"
                toast("User-Agent применится к новым вкладкам")
            }
            .setNegativeButton("Закрыть", null)
            .show()
    }

    private fun showThemes() {
        val names = Palettes.all.map { it.name }.toTypedArray()
        val current = Palettes.all.indexOfFirst { it.id == prefs.theme }
        AlertDialog.Builder(this)
            .setTitle("Тема")
            .setSingleChoiceItems(names, current) { dialog, which ->
                prefs.theme = Palettes.all[which].id
                applyTheme(Palettes.all[which])
                dialog.dismiss()
            }
            .setNegativeButton("Закрыть", null)
            .show()
    }

    private fun showEngines() {
        val names = ENGINES.keys.toTypedArray()
        val current = names.indexOf(prefs.engine).coerceAtLeast(0)
        AlertDialog.Builder(this)
            .setTitle("Поисковик")
            .setSingleChoiceItems(names, current) { dialog, which ->
                prefs.engine = names[which]
                dialog.dismiss()
                toast("Поиск: " + names[which])
            }
            .setNegativeButton("Закрыть", null)
            .show()
    }

    private fun showAbout() {
        AlertDialog.Builder(this)
            .setTitle("NeverBrowser")
            .setMessage(
                "Версия 1.0.0\nДвижок: GeckoView\n\n" +
                    "Браузер, который никогда не забывает.\n" +
                    "Автор: @frizovdanya\nМаскот: BoyKisser"
            )
            .setPositiveButton("Закрыть", null)
            .show()
    }

    private fun showTabMenu(tab: Tab) {
        val options = arrayOf("Закрыть вкладку", "Дублировать", "Снять капсулу")
        AlertDialog.Builder(this)
            .setTitle(tab.title.take(40))
            .setItems(options) { _, which ->
                when (which) {
                    0 -> closeTab(tab)
                    1 -> newTab(tab.url)
                    2 -> {
                        selectTab(tab)
                        captureCapsule()
                    }
                }
            }
            .setNegativeButton("Отмена", null)
            .show()
    }

    private fun showMenu(anchor: View) {
        val popup = PopupMenu(this, anchor)
        popup.menu.add(0, 1, 0, "Новая вкладка")
        popup.menu.add(0, 2, 1, "Time Capsule")
        popup.menu.add(0, 3, 2, "Ghost Guard")
        popup.menu.add(0, 4, 3, "Тема")
        popup.menu.add(0, 5, 4, "Поисковик")
        popup.menu.add(0, 6, 5, "О браузере")
        popup.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                1 -> newTab(START)
                2 -> showCapsules()
                3 -> showGhost()
                4 -> showThemes()
                5 -> showEngines()
                6 -> showAbout()
                else -> return@setOnMenuItemClickListener false
            }
            true
        }
        popup.show()
    }

    private fun applyTheme(palette: Palette) {
        root.setBackgroundColor(palette.bg)
        findViewById<View>(R.id.toolbar).setBackgroundColor(palette.panel)
        tabScroll.setBackgroundColor(palette.panel)
        tabStrip.setBackgroundColor(palette.panel)
        urlBar.setTextColor(palette.text)
        urlBar.setHintTextColor(palette.muted)
        urlBar.setBackgroundColor(palette.panel2)
        btnBack.setTextColor(palette.text)
        btnForward.setTextColor(palette.text)
        btnReload.setTextColor(palette.text)
        btnMenu.setTextColor(palette.text)
        btnCapsule.setTextColor(palette.accent)
        renderTabs()
    }

    private fun renderTabs() {
        val palette = Palettes.byId(prefs.theme)
        tabStrip.removeAllViews()
        for (tab in tabs) {
            val chip = TextView(this)
            chip.text = if (tab.title.length > 18) tab.title.take(18) + "…" else tab.title
            chip.textSize = 12f
            chip.setTextColor(if (tab === active) palette.text else palette.muted)
            chip.gravity = Gravity.CENTER_VERTICAL
            chip.maxLines = 1
            chip.setPadding(dp(12), dp(6), dp(12), dp(6))
            val background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setColor(if (tab === active) palette.panel2 else Color.TRANSPARENT)
                if (tab === active) setStroke(dp(1), palette.accent)
            }
            chip.background = background
            chip.setOnClickListener { selectTab(tab) }
            chip.setOnLongClickListener {
                showTabMenu(tab)
                true
            }
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            params.marginEnd = dp(6)
            tabStrip.addView(chip, params)
        }

        val add = TextView(this)
        add.text = "+"
        add.textSize = 20f
        add.setTextColor(palette.accent)
        add.gravity = Gravity.CENTER
        add.setPadding(dp(12), 0, dp(12), 0)
        add.setOnClickListener { newTab(START) }
        tabStrip.addView(add)

        tabScroll.post { tabScroll.fullScroll(View.FOCUS_RIGHT) }
    }

    private fun openUri(uri: String) {
        if (tabs.isEmpty()) newTab(uri) else active?.session?.loadUri(uri)
    }

    private fun hostOf(url: String): String {
        val host = runCatching { Uri.parse(url).host }.getOrNull()
        return if (host.isNullOrEmpty()) url else host
    }

    private fun hideKeyboard() {
        val imm = getSystemService(INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
        imm.hideSoftInputFromWindow(urlBar.windowToken, 0)
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun toast(text: String) {
        Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
    }

    private companion object {
        const val HOME = "resource://android/assets/home.html"
        const val START = "never://start"

        val ENGINES = linkedMapOf(
            "DuckDuckGo" to "https://duckduckgo.com/?q=",
            "Google" to "https://www.google.com/search?q=",
            "Bing" to "https://www.bing.com/search?q=",
            "Startpage" to "https://www.startpage.com/sp/search?query="
        )
    }
}
