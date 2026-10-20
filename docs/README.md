# NeverBrowser — документация

| Документ | О чём |
|---|---|
| [PLUGIN-API.md](PLUGIN-API.md) | **Главный гайд.** 17 разделов: манифест, права, API, панели, content scripts, рецепты, отладка. |
| [examples/hello-plugin](examples/hello-plugin) | Рабочий плагин-заготовка: скопируй в `<userData>/plugins/`. |
| [../README.md](../README.md) | Обзор браузера, установка, возможности, горячие клавиши. |

## Быстрые ссылки

- Хочу панель → [api.ui.registerPanel](PLUGIN-API.md#75-apiui--интерфейс)
- Хочу команду в `Ctrl+K` → [api.ui.registerCommand](PLUGIN-API.md#registercommand-id-title-description-shortcut-run)
- Хочу менять страницы → [Content scripts](PLUGIN-API.md#9-content-scripts)
- Хочу блокировать сайты → [Фильтры навигации](PLUGIN-API.md#10-фильтры-навигации)
- Хочу свою тему → [Темы](PLUGIN-API.md#12-темы-и-оформление)
- Хочу ходить в сеть → [api.net.fetch](PLUGIN-API.md#77-apinet--сеть)
- Хочу сохранять данные → [api.storage](PLUGIN-API.md#72-apistorage--постоянное-хранилище)

## Термины

- **Оболочка** — интерфейс браузера: вкладки, сайдбар, тулбар (`src/renderer`).
- **Вкладка** — отдельный `WebContentsView` с сайтом.
- **Панель** — iframe с HTML плагина внутри оболочки.
- **Капсула** — локальный снимок страницы из Time Capsule.
- **Ghost Guard** — слой защиты отпечатка, не «обход капчи».
- **BoyKisser** — маскот. Он всё видит. 👀
