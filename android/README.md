# NeverBrowser for Android

Отдельная кодовая база для APK. Движок — **GeckoView** (тот же, что у Firefox для Android), поэтому это настоящий браузер, а не WebView-обёртка.

```
android/
├── app/src/main/java/dev/neverbrowser/
│   ├── MainActivity.kt     вкладки, омнибокс, меню, капсулы
│   ├── GhostGuard.kt       User-Agent, трекеры, приватные сессии
│   ├── CapsuleStore.kt     снимки страниц и индекс
│   └── Prefs.kt            настройки и палитры
├── app/src/main/assets/
│   ├── home.html           страница старта
│   └── mascot.png          BoyKisser
└── scripts/geckoview-version.sh
```

## Что умеет

- вкладки на `GeckoSession`, переключение и закрытие;
- омнибокс: адрес, домен или поисковый запрос;
- **Time Capsule**: `capturePixels()` сохраняет снимок страницы в `filesDir/capsules`, есть список, просмотр и удаление;
- **Ghost Guard**: подмена User-Agent (mobile/desktop), защита от трекеров GeckoView, блоклист рекламных хостов, приватные сессии;
- **5 тем**: Midnight, Latte, Forest, Sunburst, Berry;
- выбор поисковика: DuckDuckGo, Google, Bing, Startpage;
- открытие ссылок из других приложений (`VIEW` intent).

## Сборка

### Через GitHub Actions (рекомендуется)

Workflow `.github/workflows/android.yml` собирает `assembleDebug` и складывает APK в артефакты запуска. Запуск: **Actions → Android APK → Run workflow**. Версию GeckoView workflow определяет сам по `maven-metadata.xml`.

### Локально

Нужны JDK 17 и Android SDK (compileSdk 34).

```bash
cd android
V=$(bash scripts/geckoview-version.sh)
gradle assembleDebug -PgeckoviewVersion="$V"
```

APK появится в `android/app/build/outputs/apk/debug/app-debug.apk`.

Если `gradle` не установлен, используй Android Studio: открой папку `android/`, дождись синхронизации и нажми **Run**.

### Установка на телефон

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Или перенеси APK на устройство и открой вручную (разреши установку из неизвестных источников).

## Ограничения

- **Плагины Electron-версии не работают на Android.** Это разные процессы и разные API: десктоп использует `vm`-песочницу и `WebContentsView`, Android — GeckoView.
- **Капсулы на Android — снимки экрана**, а не полный DOM: GeckoView не даёт произвольного `evaluateJS` из приложения. Полные HTML-капсулы остаются в десктопной версии.
- **CAPTCHA не обходится.** Ghost Guard убирает технические признаки автоматизации и трекеры.
- Релизный APK по умолчанию не подписан. Для публикации добавь `signingConfigs` и секреты в CI.
- Версия GeckoView указывается флагом `-PgeckoviewVersion`; значение по умолчанию в `gradle.properties` может устареть.
