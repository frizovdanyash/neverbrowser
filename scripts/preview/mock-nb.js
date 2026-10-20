// Preview-only stand-in for window.nb.

(() => {
  const listeners = new Map();
  const emit = (channel, payload) => (listeners.get(channel) || []).forEach((fn) => fn(payload));

  const settings = {
    theme: 'midnight',
    accent: '#ff7ab8',
    custom: { bg: '#101018', panel: '#17171f', text: '#f5f2ff', accent: '#ff7ab8' },
    searchEngine: 'duckduckgo',
    ghostGuard: { enabled: true, humanizeTyping: true, stripWebdriver: true, realisticUserAgent: true, blockWebRTC: true, googleRescue: true },
    capsule: { autoCapture: true, captureScreenshots: false, maxItems: 300 },
    focus: { duration: 25, blockedHosts: ['youtube.com', 'x.com', 'twitter.com', 'tiktok.com', 'reddit.com'] },
    sidebar: { width: 264, collapsed: false },
    mascot: { enabled: true, reactions: true, name: 'BoyKisser' },
    userAgentPreset: 'auto'
  };

  let tabs = [
    { id: 'tab-1', title: 'NeverBrowser — новая вкладка', url: 'never://start', loading: false, active: true, split: false, canGoBack: false, canGoForward: false, favicon: null },
    { id: 'tab-2', title: 'frizovdanya (frizovdanya)', url: 'https://github.com/frizovdanya', loading: false, active: false, split: false, canGoBack: true, canGoForward: false, favicon: null },
    { id: 'tab-3', title: 'NeverBrowser Plugin API', url: 'https://github.com/frizovdanya/neverbrowser/blob/main/docs/PLUGIN-API.md', loading: false, active: false, split: false, canGoBack: true, canGoForward: false, favicon: null }
  ];
  let activeId = 'tab-1';

  const plugins = [
    { id: 'focus-room', name: 'Focus Room', version: '1.0.0', description: 'Режим глубокой работы: блокирует отвлекающие сайты и показывает таймер.', author: 'frizovdanya', builtin: true, status: 'active', permissions: ['navigation', 'commands', 'ui', 'storage', 'notifications'], error: null,
      panels: [{ id: 'focus-panel', title: 'Focus Room', icon: '⌛' }],
      commands: [
        { id: 'start-25', title: 'Focus Room: 25 минут', description: 'Классический помидор' },
        { id: 'start-15', title: 'Focus Room: 15 минут' },
        { id: 'stop', title: 'Focus Room: остановить' }
      ] },
    { id: 'scratchpad', name: 'Scratchpad', version: '1.0.0', description: 'Быстрые заметки с автосохранением.', author: 'frizovdanya', builtin: true, status: 'active', permissions: ['ui', 'storage', 'commands', 'clipboard'], error: null,
      panels: [{ id: 'notes', title: 'Scratchpad', icon: '📝' }],
      commands: [{ id: 'clear', title: 'Scratchpad: очистить' }] },
    { id: 'theme-studio', name: 'Theme Studio', version: '1.0.0', description: 'Живые пресеты оформления: применяются мгновенно.', author: 'frizovdanya', builtin: true, status: 'active', permissions: ['theme', 'ui', 'storage'], error: null,
      panels: [{ id: 'studio', title: 'Theme Studio', icon: '🎨' }], commands: [] },
    { id: 'reading-mode', name: 'Reading Mode', version: '1.0.0', description: 'Убирает всё лишнее и оставляет чистый текст.', author: 'frizovdanya', builtin: true, status: 'active', permissions: ['tabs.script', 'commands'], error: null, panels: [], commands: [{ id: 'toggle', title: 'Reading Mode: вкл/выкл' }] },
    { id: 'cookie-cleaner', name: 'Cookie Cleaner', version: '1.0.0', description: 'Прячет cookie-баннеры на всех сайтах.', author: 'frizovdanya', builtin: true, status: 'active', permissions: ['content-scripts'], error: null, panels: [], commands: [{ id: 'explain', title: 'Cookie Cleaner: как это работает' }] },
    { id: 'mascot-mood', name: 'BoyKisser Moods', version: '1.0.0', description: 'Маскот комментирует вкладки и радуется капсулам.', author: 'frizovdanya', builtin: true, status: 'active', permissions: ['mascot', 'ui'], error: null, panels: [], commands: [{ id: 'say', title: 'BoyKisser: скажи что-нибудь' }] }
  ];

  let capsules = [
    { id: 'cap-1', title: 'NeverBrowser: браузер, который никогда не забывает', url: 'https://github.com/frizovdanya/neverbrowser', capturedAt: new Date(Date.now() - 36e5).toISOString(), size: 48213, screenshot: null },
    { id: 'cap-2', title: 'Electron: WebContentsView документация', url: 'https://www.electronjs.org/docs/latest/api/web-contents-view', capturedAt: new Date(Date.now() - 864e5 * 2).toISOString(), size: 91240, screenshot: '1' },
    { id: 'cap-3', title: 'Почему капча ненавидит автоматизацию', url: 'https://duckduckgo.com/?q=bot+detection', capturedAt: new Date(Date.now() - 864e5 * 6).toISOString(), size: 15502, screenshot: null }
  ];

  const ghost = {
    enabled: true, verified: true, trustScore: 94, challenges: 2,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    checks: [
      { id: 'webdriver', label: 'navigator.webdriver скрыт', pass: true, weight: 26 },
      { id: 'ua', label: 'User-Agent без Electron', pass: true, weight: 22 },
      { id: 'langs', label: 'Языки браузера заданы', pass: true, weight: 12 },
      { id: 'plugins', label: 'Плагины браузера видны', pass: true, weight: 10 },
      { id: 'cores', label: 'Реалистичное железо', pass: true, weight: 8 },
      { id: 'chrome', label: 'Объект window.chrome', pass: true, weight: 8 },
      { id: 'cookies', label: 'Постоянные cookies', pass: true, weight: 8 }
    ],
    rescues: [
      { url: 'https://www.google.com/sorry/index?continue=https://www.google.com/search?q=neverbrowser', rescueUrl: 'https://duckduckgo.com/?q=neverbrowser', query: 'neverbrowser', at: Date.now() - 6e5 }
    ]
  };

  let focusUntil = 0;

  const PANEL_HTML = {
    'focus-room::focus-panel': `<h2>Focus Room</h2><p class="muted">Блокирует отвлекающие сайты, пока идёт сессия.</p>
      <div class="row" style="flex-wrap:wrap"><button data-min="15">15 мин</button><button data-min="25">25 мин</button><button data-min="45">45 мин</button></div>
      <div class="card"><b id="st">не активно</b><br><span class="muted">заблокировано: <span id="bl">2</span></span></div>
      <div class="row"><button id="stop">Остановить</button></div>
      <div class="row" style="flex-wrap:wrap"><span class="pill">youtube.com</span><span class="pill">tiktok.com</span><span class="pill">x.com</span><span class="pill">reddit.com</span></div>
      <script>const s=window.nbPanel;document.querySelectorAll('[data-min]').forEach(b=>b.onclick=()=>s.call('start',Number(b.dataset.min)));document.getElementById('stop').onclick=()=>s.call('stop');window.addEventListener('nb:data',e=>{const d=e.detail||{};if(d.type==='state'){document.getElementById('st').textContent=d.label;}});s.call('status');<\/script>`,
    'scratchpad::notes': `<h2>Scratchpad</h2><p class="muted">Заметки сохраняются и переживают перезапуск.</p>
      <textarea id="pad" style="width:100%;height:230px;background:#1d1d28;color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px;font:13px ui-monospace,monospace">купить корм для BoyKisser
проверить Time Capsule
написать плагин-тему</textarea>
      <div class="row" style="justify-content:space-between;margin:8px 0"><span class="muted" id="c">12 слов</span><span class="muted">сохранено</span></div>
      <div class="row"><button id="copy">Копировать</button><button id="clear">Очистить</button></div>
      <script>const a=window.nbPanel;document.getElementById('copy').onclick=()=>a.call('copy',document.getElementById('pad').value);<\/script>`,
    'theme-studio::studio': `<h2>Theme Studio</h2><p class="muted">Пресеты меняют CSS-переменные оболочки.</p>
      <div class="row" style="flex-wrap:wrap"><button data-p="Bubblegum">Bubblegum</button><button data-p="Mint">Mint</button><button data-p="Sunset">Sunset</button><button data-p="Cyber">Cyber</button></div>
      <div class="row"><button id="reset">Сбросить</button></div>
      <script>const a=window.nbPanel;document.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>a.call('preset',b.dataset.p));document.getElementById('reset').onclick=()=>a.call('reset');<\/script>`
  };

  const later = (fn) => setTimeout(fn, 30);
  const snapshotTabs = () => ({ tabs: tabs.map((t) => ({ ...t })), activeId, split: false });

  window.nb = {
    isElectron: false,
    platform: 'linux',
    on(channel, fn) {
      if (!listeners.has(channel)) listeners.set(channel, []);
      listeners.get(channel).push(fn);
      return () => listeners.set(channel, (listeners.get(channel) || []).filter((f) => f !== fn));
    },
    appInfo: async () => ({ version: '1.0.0', electron: '32', chromium: '128', node: '20', platform: 'linux', author: 'frizovdanya', userPluginsDir: '~/.config/NeverBrowser/plugins' }),
    settings: {
      get: async () => JSON.parse(JSON.stringify(settings)),
      patch: async (patch) => {
        const merge = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k] || {}, v) : v; return a; };
        merge(settings, patch);
        later(() => emit('settings:changed', JSON.parse(JSON.stringify(settings))));
        return JSON.parse(JSON.stringify(settings));
      },
      reset: async () => { location.reload(); return settings; }
    },
    tabs: {
      list: async () => snapshotTabs(),
      create: async () => { const n = tabs.length + 1; tabs.push({ id: `tab-${n}`, title: 'Новая вкладка', url: 'never://start', loading: false, active: false, split: false, canGoBack: false, canGoForward: false }); later(() => emit('tabs:changed', snapshotTabs())); },
      close: async (id) => { tabs = tabs.filter((t) => t.id !== id); if (activeId === id) activeId = tabs[0]?.id; later(() => emit('tabs:changed', snapshotTabs())); },
      activate: async (id) => { activeId = id; tabs = tabs.map((t) => ({ ...t, active: t.id === id })); later(() => emit('tabs:changed', snapshotTabs())); },
      navigate: async (id, url) => { tabs = tabs.map((t) => t.id === id ? { ...t, url: url.startsWith('http') ? url : 'https://duckduckgo.com/?q=' + encodeURIComponent(url), title: url.slice(0, 40) } : t); later(() => emit('tabs:changed', snapshotTabs())); },
      back: async () => {}, forward: async () => {}, reload: async () => {}, stop: async () => {}, mute: async () => {}, split: async () => { emit('toast', { kind: 'warn', text: 'Split view доступен в приложении Electron.' }); }, reorder: async () => {}, zoom: async () => {}
    },
    layout: async () => {},
    window: { minimize: async () => {}, toggleMaximize: async () => {}, close: async () => {}, isMaximized: async () => false },
    shell: { openExternal: async (u) => window.open(u, '_blank'), openPluginsDir: async () => {}, openDocs: async () => window.open('https://github.com/frizovdanya/neverbrowser/blob/main/docs/PLUGIN-API.md', '_blank') },
    plugins: {
      list: async () => plugins.map((p) => ({ ...p })),
      setEnabled: async (id, on) => { const p = plugins.find((x) => x.id === id); if (p) p.status = on ? 'active' : 'disabled'; later(() => emit('plugins:changed', plugins)); },
      command: async (id, cmd) => {
        emit('toast', { kind: 'success', text: `Команда ${id}::${cmd} выполнена` });
        if (id === 'focus-room' && cmd.startsWith('start')) { focusUntil = Date.now() + 25 * 60000; }
        if (id === 'mascot-mood') emit('mascot:mood', { mood: 'happy', text: 'Мяу! Ты нажал кнопку — я рад.' });
        return { ok: true };
      },
      panel: async (pid, panelId) => {
        const plugin = plugins.find((p) => p.id === pid);
        const meta = plugin?.panels.find((p) => p.id === panelId);
        return meta ? { pluginId: pid, panelId, pluginName: plugin.name, title: meta.title, icon: meta.icon, html: PANEL_HTML[`${pid}::${panelId}`] || '<h2>Panel</h2>', height: 520 } : null;
      },
      panelMessage: async (pid, payload) => {
        const d = payload.data || {};
        if (pid === 'focus-room' && d.type === 'start') { focusUntil = Date.now() + Number(d.args) * 60000; emit('focus:tick', {}); }
        if (pid === 'focus-room' && d.type === 'status') emit('plugin:panel:event', { pluginId: pid, panelId: payload.panelId, data: { type: 'state', label: focusUntil > Date.now() ? 'осталось 25:00' : 'не активно' } });
        if (pid === 'theme-studio' && d.type === 'preset') { const map = { Bubblegum: { '--accent': '#ff7ab8', '--accent-2': '#c084fc' }, Mint: { '--accent': '#5fe3b5', '--accent-2': '#4cc9f0' }, Sunset: { '--accent': '#ff9d5c', '--accent-2': '#ff5c8a' }, Cyber: { '--accent': '#00ffc8', '--accent-2': '#ff00e5' } }; emit('plugin:theme', { pluginId: pid, vars: map[d.args] }); emit('toast', { kind: 'success', text: `Тема «${d.args}» применена` }); }
        if (pid === 'theme-studio' && d.type === 'reset') emit('plugin:theme', { pluginId: pid, vars: null });
      },
      reload: async () => { emit('toast', { kind: 'success', text: 'Плагины перезагружены.' }); return plugins; }
    },
    capsules: {
      list: async (q) => ({ items: q ? capsules.filter((c) => (c.title + c.url).toLowerCase().includes(q.toLowerCase())) : capsules, total: capsules.length, dir: '~/.config/NeverBrowser/capsules' }),
      capture: async () => { const item = { id: 'cap-' + Date.now(), title: (tabs.find((t) => t.id === activeId) || {}).title || 'Страница', url: (tabs.find((t) => t.id === activeId) || {}).url || 'never://start', capturedAt: new Date().toISOString(), size: 32000, screenshot: null }; capsules.unshift(item); emit('capsule:changed', { item }); emit('toast', { kind: 'success', text: 'Капсула сохранена (preview).' }); emit('mascot:mood', { mood: 'happy', text: 'Снимок в кармане!' }); return item; },
      open: async () => emit('toast', { kind: 'info', text: 'Открытие капсул работает в приложении.' }),
      remove: async (id) => { capsules = capsules.filter((c) => c.id !== id); return true; }
    },
    ghost: {
      status: async () => ghost,
      diagnose: async () => ghost,
      repair: async () => { emit('toast', { kind: 'success', text: 'Ghost Guard: сессия пересобрана.' }); return ghost; }
    },
    focus: {
      start: async (m) => { focusUntil = Date.now() + m * 60000; emit('focus:tick', { until: focusUntil }); emit('toast', { kind: 'success', text: `Focus Room на ${m} минут` }); return { until: focusUntil }; },
      stop: async () => { focusUntil = 0; return { until: 0 }; },
      status: async () => ({ until: focusUntil, now: Date.now() })
    },
    page: { execute: async () => null }
  };

  setInterval(() => emit('focus:tick', { until: focusUntil }), 1000);
})();
