# NeverBrowser Plugin API

**API version: 1** · NeverBrowser 1.0 · автор: [@frizovdanya](https://github.com/frizovdanya)

Этот документ — полный контракт системы плагинов NeverBrowser. Если ты умеешь писать обычный JavaScript, ты сможешь написать плагин за 10 минут. Если что-то в документе расходится с поведением браузера — побеждает `src/main/plugins.js`, но мы стараемся этого не допускать.

---

## Содержание

1. [Что такое плагин](#1-что-такое-плагин)
2. [Быстрый старт: первый плагин за 5 минут](#2-быстрый-старт-первый-плагин-за-5-минут)
3. [Структура папки и загрузка](#3-структура-папки-и-загрузка)
4. [manifest.json — справочник](#4-manifestjson--справочник)
5. [Разрешения (permissions)](#5-разрешения-permissions)
6. [Жизненный цикл](#6-жизненный-цикл)
7. [API — справочник по каждому методу](#7-api--справочник-по-каждому-методу)
8. [Панели: HTML и мост `nbPanel`](#8-панели-html-и-мост-nbpanel)
9. [Content scripts](#9-content-scripts)
10. [Фильтры навигации](#10-фильтры-навигации)
11. [События](#11-события)
12. [Темы и оформление](#12-темы-и-оформление)
13. [Рецепты](#13-рецепты)
14. [Отладка](#14-отладка)
15. [Ограничения и безопасность](#15-ограничения-и-безопасность)
16. [Чек-лист перед публикацией](#16-чек-лист-перед-публикацией)
17. [FAQ](#17-faq)

---

## 1. Что такое плагин

Плагин NeverBrowser — это **папка** с двумя обязательными файлами:

```
my-plugin/
├── manifest.json   ← паспорт плагина
└── index.js        ← код
```

и любыми дополнительными ресурсами (HTML, CSS, JSON, картинки), которые нужны тебе.

Плагин может:

| Возможность | Через что |
|---|---|
| Добавить панель в правую часть браузера | `api.ui.registerPanel()` |
| Добавить команду в командную палитру (`Ctrl+K`) | `api.ui.registerCommand()` |
| Выполнять JS на страницах по правилам | `api.contentScripts.register()` |
| Блокировать / перенаправлять навигацию | `api.navigation.registerFilter()` |
| Читать и открывать вкладки | `api.tabs` |
| Делать HTTP-запросы к своим серверам | `api.net.fetch()` |
| Сохранять данные между запусками | `api.storage` |
| Менять цвета интерфейса на лету | `api.ui.setTheme()` |
| Реагировать на события браузера | `api.events.on()` |
| Управлять маскотом BoyKisser | `api.mascot` |

Чего плагин **не может** (by design):

- читать файлы за пределами своей папки;
- запускать нативные бинарники;
- получать доступ к Node.js, `require`, `process`, `fs`, сети без разрешения;
- обходить `allowedHosts` в `api.net.fetch`;
- внедряться в другие плагины или в IPC браузера.

---

## 2. Быстрый старт: первый плагин за 5 минут

### Шаг 1. Где лежат плагины

- **Встроенные** (поставляются с браузером): `<repo>/plugins/`
- **Пользовательские**: `<userData>/plugins/`

`<userData>` — это системная папка Electron, например:

| ОС | Путь |
|---|---|
| Linux | `~/.config/NeverBrowser/plugins/` |
| macOS | `~/Library/Application Support/NeverBrowser/plugins/` |
| Windows | `%APPDATA%\NeverBrowser\plugins\` |

Точный путь показан в **Плагины → Открыть папку плагинов** (кнопка в браузере) и в `appInfo().userPluginsDir`.

> Папка пользовательских плагинов создаётся автоматически. Просто положи туда папку `hello-world/` и нажми **«Перезагрузить все»** в панели плагинов.

### Шаг 2. `manifest.json`

```json
{
  "id": "hello-world",
  "name": "Hello World",
  "version": "1.0.0",
  "apiVersion": 1,
  "author": "you",
  "description": "Мой первый плагин для NeverBrowser",
  "main": "index.js",
  "permissions": ["ui", "notifications"]
}
```

### Шаг 3. `index.js`

```js
module.exports = {
  activate(api) {
    api.ui.registerPanel({
      id: 'hello',
      title: 'Hello',
      icon: '👋',
      html: `<h2>Привет из плагина!</h2>
             <p>Это HTML внутри NeverBrowser.</p>
             <button id="ping">Поздороваться</button>
             <script>
               document.getElementById('ping').onclick = () =>
                 window.nbPanel.call('ping');
             <\/script>`
    });

    api.ui.onPanelMessage('hello', (msg) => {
      if (msg.type === 'ping') {
        api.ui.notify('Привет от ' + api.plugin.id + '!', 'success');
        api.mascot.say('Кто-то нажал кнопку. Мне нравится.');
      }
    });
  }
};
```

### Шаг 4. Перезагрузка

Открой **⚙ Плагины → Перезагрузить все**. Плагин появится в списке. Его панель — в сайдбаре слева, в блоке «Панели плагинов». Готово.

---

## 3. Структура папки и загрузка

```
my-plugin/
├── manifest.json      обязательно
├── index.js           обязательно (имя задаётся в manifest.main)
├── assets/
│   └── icon.png
├── panel.html         опционально
└── README.md          опционально
```

Правила загрузки:

1. Браузер сканирует `<userData>/plugins/*` и `<repo>/plugins/*`.
2. Читается `manifest.json`. Ошибки валидации → статус `error`, плагин не запускается.
3. Если `id` уже загружен — второй экземпляр игнорируется (встроенные имеют приоритет).
4. Если `id` в списке отключённых (`plugins-state.json`) — статус `disabled`, код не исполняется.
5. `index.js` исполняется в изолированном `vm`-контексте. Доступны только: `console`, `setTimeout`, `setInterval`, `URL`, `URLSearchParams`, `TextEncoder`, `TextDecoder`, `structuredClone`, `queueMicrotask` и объект `api`.
6. Функция `module.exports.activate(api)` вызывается один раз; если она вернула Promise — браузер его дождётся.

**Статусы плагина**

| Статус | Значение |
|---|---|
| `loaded` | загружен, но ещё не активирован (мгновенное состояние) |
| `active` | работает |
| `disabled` | выключен пользователем, код не исполнялся |
| `error` | ошибка манифеста или исключение в `activate`; текст — в `error` |

---

## 4. manifest.json — справочник

```json
{
  "id": "focus-room",
  "name": "Focus Room",
  "version": "1.0.0",
  "apiVersion": 1,
  "author": "frizovdanya",
  "description": "Блокирует отвлекающие сайты",
  "homepage": "https://github.com/frizovdanya",
  "main": "index.js",
  "permissions": ["navigation", "commands", "ui", "storage", "notifications", "mascot", "tabs"],
  "allowedHosts": ["api.example.com"],
  "contributes": {
    "panels": ["focus-panel"],
    "commands": ["start-25", "stop"]
  }
}
```

| Поле | Тип | Обяз. | Описание |
|---|---|---|---|
| `id` | string | да | kebab-case, `[a-z0-9-]`, 2–49 символов. Уникален. Менять после публикации нельзя. |
| `name` | string | да | Отображаемое имя. |
| `version` | string | да | Semver, например `1.2.0`. |
| `apiVersion` | number | нет | Версия API, которую ожидает плагин. Если больше версии браузера — плагин не загрузится. Текущая: `1`. |
| `description` | string | нет | Показывается в карточке плагина. |
| `author` | string | нет | Автор. |
| `homepage` | string | нет | Ссылка на репозиторий/страницу. |
| `main` | string | да | Путь к JS-файлу относительно папки плагина. Выход за пределы папки запрещён. |
| `permissions` | string[] | нет | См. раздел 5. Незнакомое разрешение = ошибка загрузки. |
| `allowedHosts` | string[] | нет | Хосты, к которым можно ходить через `api.net.fetch`. Поддомены разрешены: `api.example.com` разрешает `v2.api.example.com`. |
| `contributes` | object | нет | Подсказка интерфейсу: какие панели/команды регистрирует плагин. Не является разрешением. |

### Строгие правила

- `main` не может быть абсолютным путём или содержать `..`.
- `id` нельзя менять между версиями.
- Если `permissions` содержит `network`, обязателен `allowedHosts`, иначе запросы всегда будут падать.
- `apiVersion: 2` на браузере с API 1 → плагин не загрузится (с понятной ошибкой).

---

## 5. Разрешения (permissions)

| Разрешение | Что открывает |
|---|---|
| `tabs` | `api.tabs.list/active/create/close/activate/navigate/onNavigate` |
| `tabs.script` | `api.tabs.execute()` — выполнение JS на вкладке |
| `storage` | `api.storage.*` |
| `settings` | `api.settings.*` (пространство `plugins.<id>.*`) |
| `ui` | панели, статус-элементы, `postToPanel`, `onPanelMessage`, `openPanel` |
| `commands` | регистрация команд в палитре |
| `notifications` | `api.ui.notify()` |
| `network` | `api.net.fetch()` (только `allowedHosts`) |
| `content-scripts` | `api.contentScripts.register()` |
| `navigation` | `api.navigation.registerFilter()` |
| `theme` | `api.ui.setTheme()/clearTheme()` |
| `capsules` | `api.capsules.*` — Time Capsule |
| `clipboard` | `api.clipboard.write()` |
| `focus` | `api.focus.*` |
| `mascot` | `api.mascot.*`, `api.ui.setMascotMood()` |

Вызов метода без разрешения выбрасывает исключение:

```
Error: Permission denied: "network" is not declared in manifest.permissions (plugin my-plugin)
```

Лови его в `try/catch` или просто объяви разрешение в манифесте. Разрешения **не запрашиваются у пользователя во время работы** — они видны в карточке плагина до включения.

---

## 6. Жизненный цикл

```
чтение manifest → проверка → (disabled? стоп) → создание sandbox → execute index.js
      → activate(api) → active
      → ... работа ...
      → deactivate()  ← при выключении/перезагрузке
```

`index.js` должен экспортировать объект:

```js
module.exports = {
  activate(api) {
    // здесь регистрируем панели, команды, фильтры, подписки
    return () => {
      // необязательный cleanup
    };
  },
  deactivate() {
    // необязательно: вызывается при выключении плагина
  }
};
```

Особенности:

- `setTimeout`/`setInterval`, созданные через sandbox, автоматически очищаются при выключении плагина — утечек не будет.
- Регистрации (панели, команды, фильтры, подписки) удаляются автоматически.
- Если нужно сохранить состояние — пиши в `api.storage` **до** выключения.
- Если `activate` бросил исключение — плагин получает статус `error`, все его таймеры и регистрации откатываются.

---

## 7. API — справочник по каждому методу

Все методы синхронные, если не указано иное (`async`).

### 7.1 `api` — корень

| Свойство | Тип | Описание |
|---|---|---|
| `api.apiVersion` | number | Версия API (`1`) |
| `api.plugin.id` | string | id из манифеста |
| `api.plugin.version` | string | версия плагина |
| `api.plugin.dir` | string | абсолютный путь к папке плагина |
| `api.plugin.builtin` | boolean | встроенный ли плагин |
| `api.plugin.getDataDir()` | string | то же, что `dir` (для удобства) |

---

### 7.2 `api.storage` — постоянное хранилище

Файл: `<userData>/plugin-storage/<id>.json`. JSON-совместимые значения.

| Метод | Возвращает | Описание |
|---|---|---|
| `get(key, fallback)` | any | значение или `fallback` |
| `set(key, value)` | value | сохранить |
| `delete(key)` | — | удалить ключ |
| `all()` | object | копия всего хранилища |
| `clear()` | — | очистить всё |

```js
const count = api.storage.get('launches', 0);
api.storage.set('launches', count + 1);
```

> Хранилище общее для всех окон браузера и переживает перезапуск. Не храни там секреты в открытом виде.

---

### 7.3 `api.settings` — настройки плагина

Изолированное пространство `plugins.<id>.*` внутри основного `settings.json`.

```js
api.settings.set('mode', 'dark');
const mode = api.settings.get('mode'); // 'dark'
const all = api.settings.getAll();     // { mode: 'dark' }
```

---

### 7.4 `api.tabs` — вкладки

| Метод | Возвращает | Описание |
|---|---|---|
| `list()` | `TabInfo[]` | все вкладки |
| `active()` | `string \| null` | id активной вкладки |
| `create(url?)` | `TabInfo` | новая вкладка |
| `close(tabId)` | — | закрыть |
| `activate(tabId)` | — | сделать активной |
| `navigate(tabId, url)` | — | перейти (поддерживает поисковый запрос) |
| `execute(tabId \| null, code)` | `Promise<any>` | выполнить JS; `null` = активная вкладка. Только с `tabs.script` |
| `onNavigate(fn)` | unsubscribe | подписка на навигацию |

`TabInfo`:

```ts
{
  id: string;
  title: string;
  url: string;
  favicon?: string;
  loading: boolean;
  muted: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  active: boolean;
  split: boolean;
}
```

`navigate()` принимает и полный URL, и запрос («кот в сапогах» → поиск), и «голый» домен.

---

### 7.5 `api.ui` — интерфейс

#### `registerPanel({ id, title, icon, html, width?, height? })`

Создаёт панель в правой части окна и кнопку в сайдбаре.

```js
api.ui.registerPanel({
  id: 'my-panel',        // kebab-case, уникален в рамках плагина
  title: 'My Panel',
  icon: '✨',            // emoji или 1–2 символа
  width: 360,
  height: 480,
  html: '<h2>Привет</h2>'
});
```

Возвращает функцию `unregister()`.

#### `onPanelMessage(panelId, handler)`

Принимает сообщения от HTML панели:

```js
api.ui.onPanelMessage('my-panel', (data, panelId) => {
  // data — то, что панель отправила через nbPanel.call(...)
});
```

#### `postToPanel(panelId, data)`

Отправить данные из плагина в HTML панели. Панель получит событие `nb:data`.

#### `openPanel(panelId)`

Открыть панель (если она зарегистрирована).

#### `registerCommand({ id, title, description?, shortcut?, run })`

Добавляет команду в `Ctrl+K` палитру.

```js
api.ui.registerCommand({
  id: 'greet',
  title: 'Поздороваться с маскотом',
  description: 'BoyKisser скажет что-нибудь милое',
  run: () => api.mascot.say('Мяу!')
});
```

`run` может быть async; его результат возвращается в палитру/кнопку.

> `shortcut` — **декларативная подсказка**. Глобальные горячие клавиши браузера зарезервированы, произвольные сочетания пока не перехватываются.

#### `notify(message, kind?)`

Тост в интерфейсе. `kind`: `'info' | 'success' | 'warn' | 'error'`.

#### `addStatusItem({ id, text, title, onClick })`

Регистрирует статус-элемент (используется интерфейсом плагинов; в API 1 — лёгкий хук для будущих версий).

#### `setMascotMood(mood, text?)`

`mood`: `'idle' | 'happy' | 'shield' | 'error'`. Требует `mascot`.

#### `setTheme(vars)` / `clearTheme()`

См. раздел 12.

---

### 7.6 `api.commands`

```js
const off = api.commands.register({
  id: 'my-command',
  title: 'Сделать что-то',
  run: async () => 'результат'
});

await api.commands.execute('my-command');
off();
```

Команды, зарегистрированные через `api.commands.register`, попадают в палитру точно так же, как через `api.ui.registerCommand`.

---

### 7.7 `api.net` — сеть

```js
const res = await api.net.fetch('https://api.example.com/v1/quote', {
  method: 'GET',
  headers: { 'Accept': 'application/json' },
  timeout: 8000
});
// res: { ok, status, headers, body }
```

Правила:

- только `http(s)`;
- только хосты из `manifest.allowedHosts`;
- таймаут по умолчанию 10 с, максимум 30 с;
- таймаут/отмена → исключение `AbortError`;
- CORS не применяется (запрос идёт из main process), но allowlist обязателен.

---

### 7.8 `api.contentScripts`

См. раздел 9.

### 7.9 `api.navigation`

См. раздел 10.

### 7.10 `api.capsules` — Time Capsule

```js
api.capsules.list('query');   // { items, total, dir }
await api.capsules.capture(); // снять капсулу активной вкладки
api.capsules.open(id);        // открыть капсулу
api.capsules.remove(id);
```

`CapsuleInfo`:

```ts
{ id: string; url: string; title: string; capturedAt: string; screenshot: string | null; size: number; }
```

### 7.11 `api.ghost` — Ghost Guard

```js
api.ghost.status();    // { enabled, verified, trustScore, checks, userAgent, rescues }
await api.ghost.diagnose(); // проверить отпечаток активной вкладки
await api.ghost.repair();   // пересобрать сессию
```

### 7.12 `api.focus` — Focus Room

```js
api.focus.status();       // { until, active }
api.focus.start(25);      // минут
api.focus.stop();
api.focus.onChange(fn);   // подписка на focus:started
```

### 7.13 `api.clipboard`

```js
api.clipboard.write('текст');
```

Только запись. Чтения из буфера в API 1 нет — сознательно.

### 7.14 `api.events`

```js
const off = api.events.on('tab:navigated', (payload) => { /* ... */ });
api.events.emit('my-thing', { hello: true }); // событие внутри плагина
```

### 7.15 `api.mascot`

```js
api.mascot.setMood('happy', 'Текст в облачке');
api.mascot.say('Просто реплика');
```

### 7.16 `api.log`

`api.log.log/info/warn/error` — пишет в консоль main process с префиксом `[<id>]`.

---

## 8. Панели: HTML и мост `nbPanel`

HTML панели рендерится в `<iframe sandbox="allow-scripts allow-forms">` со `srcdoc`. Это значит:

- у панели **нет** доступа к `window.nb` браузера;
- нет `require`, `fs`, `process`;
- стили панели изолированы от интерфейса;
- связь с плагином — только через `nbPanel`.

### Мост

В каждой панели автоматически доступен объект:

```js
nbPanel.call(method, args)   // → api.ui.onPanelMessage
nbPanel.ready()              // сообщить, что панель готова
nbPanel.show(data)           // локальное событие nb:data
```

Плагин отвечает через `api.ui.postToPanel(panelId, data)`.

### Полный пример: счётчик кликов

`index.js`:

```js
api.ui.registerPanel({
  id: 'counter',
  title: 'Счётчик',
  icon: '🔢',
  html: `<h2>Счётчик</h2>
    <p id="value">0</p>
    <button id="plus">+1</button>
    <script>
      const out = document.getElementById('value');
      document.getElementById('plus').onclick = () => nbPanel.call('inc');
      window.addEventListener('nb:data', (e) => {
        if (e.detail.type === 'value') out.textContent = e.detail.value;
      });
      nbPanel.call('get');
    <\/script>`
});

api.ui.onPanelMessage('counter', (msg) => {
  if (msg.type === 'get') {
    api.ui.postToPanel('counter', { type: 'value', value: api.storage.get('n', 0) });
  }
  if (msg.type === 'inc') {
    const next = api.storage.get('n', 0) + 1;
    api.storage.set('n', next);
    api.ui.postToPanel('counter', { type: 'value', value: next });
  }
});
```

### Стилизация панелей

В iframe уже есть базовые стили: `body`, `h1–h3`, `button`, `input`, `select`, `.row`, `.card`, `.muted`, `.pill`.
Акцентный цвет и фон берутся из текущей темы браузера.
Для полного контроля пиши свои `<style>` внутри `html`.

> `html` — обычная строка JS. Экранируй обратные кавычки и `</script>` как `<\/script>`, если собираешь HTML шаблонной строкой.

---

## 9. Content scripts

```js
api.contentScripts.register({
  id: 'hide-banners',
  matches: ['https://example.com/*', 'https://*.example.org/*', '<all_urls>'],
  runAt: 'document-end',      // 'document-start' | 'document-end' | 'document-idle'
  css: '.banner { display: none !important; }',
  js: 'document.body.dataset.nb = "yes";'
});
```

Особенности:

- скрипт выполняется в **изолированном мире** страницы через `executeJavaScript` с `userGesture=false`;
- `js` — строка кода, а не функция; оборачивается в `try/catch`;
- `css` вставляется через `insertCSS`;
- `matches` поддерживает `*` и `?`, а `<all_urls>` = все `http(s)`;
- content scripts не имеют доступа к `api` — это код для страницы;
- регистрация применяется начиная со следующей загрузки страницы (или после перезагрузки вкладки).

Шаблоны:

| Шаблон | Совпадёт с |
|---|---|
| `https://example.com/*` | любой путь example.com |
| `https://*.example.com/*` | все поддомены |
| `*://*/*` | любой http(s) |
| `<all_urls>` | то же, что выше |

---

## 10. Фильтры навигации

```js
api.navigation.registerFilter('no-shorts', (url) => {
  if (url.includes('youtube.com/shorts/')) return 'Shorts отключены';
  return null;
});
```

- `url` — строка адреса, к которому идёт переход;
- вернуть `truthy` → переход блокируется, пользователь получает тост «Blocked by …: <причина>»;
- вернуть `null`/`undefined`/`false` → переход продолжается;
- фильтр вызывается на `will-navigate` в main process;
- исключение в фильтре логируется и не блокирует навигацию;
- используй `api.tabs.navigate()` для программного перехода.

Не злоупотребляй: фильтр выполняется на каждом переходе во всех вкладках. Держи его быстрым (без сети, без тяжёлых вычислений).

---

## 11. События

| Событие | Payload | Когда |
|---|---|---|
| `plugin:ready` | `{ id, name }` | плагин активирован |
| `tab:created` | `{ tabId, url }` | создана вкладка |
| `tab:closed` | `{ tabId }` | вкладка закрыта |
| `tab:activated` | `{ tabId }` | вкладка стала активной |
| `tab:navigated` | `{ url, title, tabId }` | завершена навигация |
| `focus:started` | `{ minutes, until }` | включён Focus Room |
| `focus:stopped` | `{}` | выключен Focus Room |
| `ghost:challenge` | `{ url, rescueUrl }` | обнаружена капча |
| `capsule:captured` | `CapsuleInfo` | снята капсула |
| `settings:changed` | `Settings` | изменены настройки браузера |

```js
api.events.on('tab:navigated', ({ url }) => {
  api.log.info('перешли на', url);
});
```

Неизвестное событие → исключение `unknown event: ...`. Список фиксирован в API 1.

---

## 12. Темы и оформление

Оболочка браузера построена на CSS-переменных. Плагин с разрешением `theme` может переопределить их на лету:

```js
api.ui.setTheme({
  '--accent': '#5fe3b5',
  '--accent-2': '#4cc9f0',
  '--bg': '#0a1512',
  '--panel': '#10201b',
  '--panel-2': '#152a23',
  '--text': '#ecfff2',
  '--muted': '#89a897'
});
```

Сброс:

```js
api.ui.clearTheme();
```

Доступные переменные:

| Переменная | Роль |
|---|---|
| `--bg` | фон окна и страницы старта |
| `--panel` | фон сайдбара и тулбара |
| `--panel-2` | фон полей и карточек |
| `--panel-3` | фон активных элементов |
| `--text` | основной текст |
| `--muted` | вторичный текст |
| `--accent` | акцент: активная вкладка, кнопки |
| `--accent-2` | второй акцент (градиенты) |
| `--border` | цвет границ |
| `--shadow` | тень панелей |

> Тема плагина живёт до перезагрузки интерфейса или до `clearTheme()`. Постоянную тему сохраняй в `api.storage` и применяй в `activate`.

---

## 13. Рецепты

### 13.1 Своя кнопка «сохранить в капсулу»

```json
"permissions": ["ui", "capsules", "notifications", "mascot"]
```

```js
api.ui.registerCommand({
  id: 'snapshot',
  title: 'Сохранить страницу в капсулу',
  run: async () => {
    const item = await api.capsules.capture();
    if (item) {
      api.ui.notify(`Сохранено: ${item.title}`, 'success');
      api.mascot.setMood('happy', 'Капсула запечатана!');
    }
  }
});
```

### 13.2 Блокировщик конкретных сайтов

```js
const BLOCKED = ['vk.com/clips', 'youtube.com/shorts'];
api.navigation.registerFilter('anti-shorts', (url) =>
  BLOCKED.some((b) => url.includes(b)) ? 'Короткие видео выключены' : null
);
```

### 13.3 Плагин-заметка с сетью

```json
"permissions": ["network", "ui", "notifications"],
"allowedHosts": ["api.github.com"]
```

```js
api.ui.registerCommand({
  id: 'stars',
  title: 'Показать звёзды репозитория',
  run: async () => {
    const res = await api.net.fetch('https://api.github.com/repos/frizovdanya/neverbrowser');
    const data = JSON.parse(res.body);
    api.ui.notify(`⭐ ${data.stargazers_count}`, 'success');
    return data.stargazers_count;
  }
});
```

### 13.4 Автозакрытие пустых вкладок

```js
api.tabs.onNavigate(({ tabId, url }) => {
  if (url === 'never://start') {
    // не закрываем сразу — даём пользователю шанс
    setTimeout(() => {
      const tab = api.tabs.list().find((t) => t.id === tabId);
      if (tab && tab.url === 'never://start') api.tabs.close(tabId);
    }, 60_000);
  }
});
```

### 13.5 Плагин-тема

```js
module.exports = {
  activate(api) {
    const preset = api.storage.get('preset');
    if (preset) api.ui.setTheme(preset);

    api.ui.registerCommand({
      id: 'apply',
      title: 'Моя тема',
      run: () => {
        const vars = { '--accent': '#ff9d5c', '--bg': '#170f0b' };
        api.ui.setTheme(vars);
        api.storage.set('preset', vars);
      }
    });
  }
};
```

---

## 14. Отладка

| Инструмент | Где |
|---|---|
| Консоль main process | терминал, из которого запущен `npm start` |
| Ошибки плагина | карточка плагина в панели «Плагины» (поле `error`) |
| Состояние | `<userData>/plugins-state.json` (включён/выключен) |
| Хранилище | `<userData>/plugin-storage/<id>.json` |
| Панель HTML | DevTools: в dev-режиме (`npm run dev`) открой консоль окна оболочки |
| Перезагрузка | кнопка «Перезагрузить все» |

Типичные ошибки:

| Симптом | Причина |
|---|---|
| `unknown permission "network"` | опечатка в `permissions` |
| `Permission denied: "ui"` | метод вызван без разрешения |
| `entry file not found` | неверный `main` |
| `module.exports.activate(api) is required` | `index.js` ничего не экспортирует |
| `host not in manifest.allowedHosts` | нет `allowedHosts` или хост не совпал |
| `unknown command focus-room::xxx` | команда не зарегистрирована или плагин в `error` |
| Панель пустая | `html` не передан или `id` панели не совпадает с `onPanelMessage` |

---

## 15. Ограничения и безопасность

1. **Sandbox.** Код плагина не получает Node.js. Всё, что нужно, — через `api`.
2. **Path safety.** `main` не может выйти за пределы папки плагина.
3. **Network allowlist.** Никаких запросов на произвольные хосты.
4. **No DOM of chrome.** Плагин не может читать интерфейс браузера напрямую.
5. **Panels are sandboxed iframes.** Даже если плагин вредоносный, он не получит `window.nb`. HTML панели исполняется в `srcdoc` с `sandbox="allow-scripts allow-forms"`.
6. **CSP оболочки разрешает inline-скрипты** внутри панелей — это осознанный компромисс ради моста `nbPanel`. Не вставляй в `html` недоверенные данные (экранируй их).
6. **Права видны заранее.** Кнопка включения показывает список разрешений.
7. **Таймауты.** `vm` выполняет `index.js` максимум 5 секунд; бесконечный цикл в `activate` не повесит браузер навсегда.
8. **Честная капча.** Ghost Guard не решает CAPTCHA и не обходит защиту Google. Он убирает признаки автоматизации и предлагает альтернативный маршрут.

Чего в API 1 нет (планируется):

- глобальные горячие клавиши для плагинов;
- загрузка плагинов из маркета одной кнопкой;
- межплагинное API;
- чтение буфера обмена;
- фоновые service worker'ы (используй `activate` + `setInterval` с осторожностью).

---

## 16. Чек-лист перед публикацией

- [ ] `id` уникален и стабилен
- [ ] `name`, `version`, `description`, `author` заполнены
- [ ] `apiVersion: 1`
- [ ] перечислены **только** реально нужные `permissions`
- [ ] для `network` задан `allowedHosts`
- [ ] `index.js` экспортирует `activate`
- [ ] панели имеют уникальные `id` внутри плагина
- [ ] `onPanelMessage` обрабатывает только известные типы сообщений
- [ ] нет `eval`, `new Function`, бесконечных циклов
- [ ] ошибки обёрнуты в `try/catch`, пользователь видит `api.ui.notify`
- [ ] плагин корректно выключается и не оставляет таймеров (или полагается на автоочистку)
- [ ] проверено на трёх версиях NeverBrowser (или хотя бы чистой установке)
- [ ] есть README с описанием и скриншотом

---

## 17. FAQ

**Нужно ли перезапускать браузер после правки плагина?**
Нет. «Перезагрузить все» в панели плагинов перезапускает все плагины. Для правки HTML панели достаточно выключить/включить плагин.

**Где взять `userData`?**
`api` его не отдаёт. В браузере: Плагины → «Открыть папку плагинов». Технически — `app.getPath('userData')` в main process.

**Можно ли писать плагины на TypeScript?**
Да, если скомпилировать в один CommonJS-файл и указать его в `main`. Сборщик не входит в браузер.

**Работает ли `fetch` в панели?**
Панель — sandboxed iframe без allow-same-origin: обычный `fetch` к произвольным сайтам упрётся в CORS. Делай сетевые запросы через `nbPanel.call('fetch', url)`, а сам запрос — в `api.net.fetch()`.

**Как получить доступ к содержимому страницы?**
`api.tabs.execute(tabId, code)` (разрешение `tabs.script`) или `api.contentScripts.register` для автоматического внедрения.

**Почему мой `shortcut` не работает?**
В API 1 поле `shortcut` — только подсказка. Глобальные сочетания принадлежат браузеру.

**Можно ли распространять плагин?**
Да: zip папки, README, версия. Установка — распаковать в `<userData>/plugins/` и перезагрузить. Маркет появится позже.

**Как связаться?**
Автор NeverBrowser — [@frizovdanya](https://github.com/frizovdanya). Присылай плагины и баг-репорты.

---

_Документ написан для NeverBrowser v1.0. Если API изменится, версия в шапке будет увеличена._
