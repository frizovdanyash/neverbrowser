<div align="center">

<img src="assets/mascot.png" alt="BoyKisser — маскот NeverBrowser" width="170">

# NeverBrowser

**Браузер, который никогда не забывает, никогда не выглядит ботом и никогда не скучает.**

[![made with electron](https://img.shields.io/badge/Electron-32-9d7bff?style=flat-square)](https://www.electronjs.org/)
[![api v1](https://img.shields.io/badge/Plugin%20API-v1-ff7ab8?style=flat-square)](docs/PLUGIN-API.md)
[![author](https://img.shields.io/badge/author-%40frizovdanya-ff7ab8?style=flat-square)](https://github.com/frizovdanya)

</div>

---

## Почему «Never»?

| | Обычный браузер | **NeverBrowser** |
|---|---|---|
| Страница удалена сайтом | статья исчезла | **Time Capsule** — снимок DOM остался навсегда |
| Google проверяет на робота | капча на каждый запрос | **Ghost Guard** убирает следы Electron и предлагает маршрут без капчи |
| «Принять cookies» на пол-экрана | каждый сайт | **Cookie Cleaner** из коробки |
| Одна страница за раз | нужны окна | **Split view** двух вкладок в одном окне |
| Сайты отвлекают | сила воли | **Focus Room** с таймером и блокировкой |
| Браузер = чёрный прямоугольник | | **5 тем + Custom**, маскот **BoyKisser** и живой сайдбар |
| Плагины = WebExtensions | стандартно и скучно | **NeverBrowser Plugin API**: панели, команды, content-scripts, фильтры навигации, темы |

---

## Возможности

- **Time Capsule** — локальный архив страниц: HTML, заголовок, дата, опциональный скриншот. Поиск по архиву, повторное открытие, удаление. Капсулы можно открывать даже когда сайт умер.
- **Ghost Guard** — анти-бот гигиена: реалистичный User-Agent (без `Electron`), скрытие `navigator.webdriver`, языки, плагины, `window.chrome`, `DNT`, очистка challenge-cookie, пересборка сессии. Плюс **Google Rescue**: заметил `/sorry/` — предложил тот же запрос без капчи. Это не «обход капчи», а устранение причин её появления.
- **Split view** — две вкладки рядом, перетаскиваемые пропорции.
- **Focus Room** — сессии 15/25/45/60 минут, таймер в тулбаре, блокировка отвлекающих хостов через плагин.
- **Command palette** — `Ctrl+K`: команды, плагины, капсулы, вкладки.
- **Кастомизация** — Midnight / Latte / Forest / Sunburst / Custom (4 цвета), компактный сайдбар, имя маскота.
- **Плагины** — 6 встроенных: Focus Room, Scratchpad, Reading Mode, Cookie Cleaner, Theme Studio, BoyKisser Moods, Quick Search… и полный [Plugin API](docs/PLUGIN-API.md).
- **Маскот BoyKisser** — реагирует на навигацию, капсулы, капчу и плагины; живёт в сайдбаре.

---

## Установка

```bash
git clone https://github.com/frizovdanya/neverbrowser
cd neverbrowser
npm install
npm start        # обычный запуск
npm run dev      # с DevTools
```

Требования: Node.js 18+, Linux/macOS/Windows с графической сессией.

### Посмотреть интерфейс без Electron

```bash
npm run web     # http://localhost:4173
```

Поднимается статичный предпросмотр оболочки с фейковым `window.nb` (`scripts/preview/mock-nb.js`): вкладки, панели, плагины, палитра. Это витрина UI, а не работающий браузер — настоящие страницы открываются в Electron-приложении.

### Сборка иконок из маскота

```bash
npm run icons   # python3 + pillow: assets/mascot.png, assets/icon.png
```

---

## Скриншот

> Оболочка: сайдбар с панелями плагинов, маскот-док, омнибокс с Ghost Guard, темы.

```
┌──────────────────────────────────────────────────────────────┐
│ 🐾 NeverBrowser   [вкладки…]                          – ▢ × │
├────────────────────────┬─────────────────────────────────────┤
│ ‹ › ⟳  [▲ поиск…    ]  │                                     │
│ ⌛ 25:00            ▥ ⌘ ▤│        страница (WebContentsView)  │
├────────────────────────┤                                     │
│ 🏠 Старт        Ctrl+1 │                                     │
│ ◷ Time Capsule  Ctrl+2 │                                     │
│ ◉ Ghost Guard   Ctrl+3 │                                     │
│ ⚙ Плагины       Ctrl+4 │                                     │
│ ⌛ Focus Room   Ctrl+5 │                                     │
│ 🎨 Настройки    Ctrl+, │                                     │
│ ── Панели плагинов ─── │                                     │
│  ⌛ Focus Room          │                                     │
│  📝 Scratchpad          │                                     │
│  🎨 Theme Studio        │                                     │
│                        │                                     │
│  [🐾] «Никогда не      │                                     │
│       забывай!»        │                                     │
└────────────────────────┴─────────────────────────────────────┘
```

---

## Плагины

Подробный гайд: **[docs/PLUGIN-API.md](docs/PLUGIN-API.md)** (17 разделов, рецепты, чек-лист).

Минимальный плагин:

```json
{
  "id": "hello-world",
  "name": "Hello World",
  "version": "1.0.0",
  "apiVersion": 1,
  "main": "index.js",
  "permissions": ["ui", "notifications"]
}
```

```js
module.exports = {
  activate(api) {
    api.ui.registerCommand({
      id: 'hello',
      title: 'Поздороваться',
      run: () => api.ui.notify('Привет из плагина!', 'success')
    });
  }
};
```

Положить папку в `<userData>/plugins/` → **Плагины → Перезагрузить все**.

Встроенные плагины: `plugins/focus-room`, `plugins/scratchpad`, `plugins/reading-mode`, `plugins/cookie-cleaner`, `plugins/theme-studio`, `plugins/mascot-mood`, `plugins/quick-search`.

---

## Горячие клавиши

| Сочетание | Действие |
|---|---|
| `Ctrl+T` / `Ctrl+W` | новая / закрыть вкладку |
| `Ctrl+L` | омнибокс |
| `Ctrl+R` | обновить |
| `Ctrl+K` | командная палитра |
| `Ctrl+Shift+P` | плагины |
| `Ctrl+Shift+C` | снять Time Capsule |
| `Ctrl+Shift+F` | Focus Room |
| `Ctrl+Shift+S` | split view |
| `Ctrl+1…5` | разделы сайдбара |
| `Ctrl+,` | настройки |
| `Alt+←/→` | назад / вперёд |
| `Ctrl+ +/-/0` | масштаб страницы |

---

## Структура

```
src/
├── main/
│   ├── index.js      окно, вкладки (WebContentsView), IPC, layout
│   ├── plugins.js    Plugin Host: манифесты, sandbox, API, панели, команды
│   ├── capsule.js    Time Capsule: снимки DOM, индекс, отдача
│   ├── ghost.js      Ghost Guard: UA, отпечаток, rescue, repair
│   └── store.js      settings.json с дефолтами и подписками
├── preload/index.js  whitelisted IPC → window.nb
└── renderer/
    ├── index.html    оболочка браузера
    ├── styles.css    темы, сайдбар, панели
    ├── app.js        вкладки, палитра, панели, мост плагинов
    └── newtab.html   страница старта never://start
plugins/              встроенные плагины
docs/PLUGIN-API.md    большой гайд по плагинам
assets/               маскот и иконка
scripts/              подготовка маскота, preview-сервер
```

### Архитектура в двух словах

- **Оболочка** (`renderer`) — это обычная страница Electron: вкладки сверху, сайдбар, тулбар.
- **Страницы** — отдельные `WebContentsView`, которые main process позиционирует под оболочкой (учитывая сайдбар, split и открытую панель). Поэтому сайты не могут дотянуться до интерфейса.
- **Плагины** живут в main process в `vm`-песочнице и общаются с оболочкой и панелями через IPC.

---

## Ghost Guard: честно о капче

Ghost Guard **не решает CAPTCHA** и не пытается обмануть Google. Он делает три вещи:

1. убирает технические признаки Electron/автоматизации из отпечатка;
2. чистит cookies, которые Google ставит при подозрении;
3. если проверка всё равно появилась — предлагает открыть тот же запрос в DuckDuckGo (или повторить после «Пересобрать сессию»).

Если сайт требует решить капчу — её решает человек. Так и задумано.

---

## Автор

**@frizovdanya** — идея, дизайн, маскот BoyKisser, код.
Сделано на Electron. Лицензия MIT.
