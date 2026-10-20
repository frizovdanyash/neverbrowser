'use strict';
/* NeverBrowser — browser chrome renderer. Talks to the main process through window.nb. */

const nb = window.nb;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = {
  settings: null,
  tabs: [],
  activeId: null,
  split: false,
  plugins: [],
  panel: null,
  paletteIndex: 0,
  paletteItems: [],
  focusUntil: 0,
  caps: { items: [], total: 0 }
};

const THEMES = {
  midnight: { label: 'Midnight', accent: '#ff7ab8', vars: { '--bg': '#101018', '--panel': '#17171f', '--panel-2': '#1d1d28', '--panel-3': '#242433', '--text': '#f5f2ff', '--muted': '#9a94b3', '--accent': '#ff7ab8', '--accent-2': '#9d7bff' } },
  latte: { label: 'Latte', accent: '#c96a2b', vars: { '--bg': '#f6efe6', '--panel': '#fffaf4', '--panel-2': '#f3e9dd', '--panel-3': '#e9dccb', '--text': '#2c2119', '--muted': '#8a7766', '--accent': '#c96a2b', '--accent-2': '#7b5cff', '--border': 'rgba(60,40,20,.12)', '--shadow': '0 16px 40px rgba(90,70,40,.18)' } },
  forest: { label: 'Forest', accent: '#5fd68a', vars: { '--bg': '#0c1410', '--panel': '#111d17', '--panel-2': '#15251d', '--panel-3': '#1d3228', '--text': '#ecfff2', '--muted': '#89a897', '--accent': '#5fd68a', '--accent-2': '#4fd0c8' } },
  sunburst: { label: 'Sunburst', accent: '#ffb23e', vars: { '--bg': '#171208', '--panel': '#211a0d', '--panel-2': '#2a2111', '--panel-3': '#3a2d16', '--text': '#fff6e6', '--muted': '#c2a97e', '--accent': '#ffb23e', '--accent-2': '#ff6f91' } }
};

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

function applyTheme() {
  const s = state.settings;
  if (!s) return;
  const root = document.documentElement.style;
  const theme = THEMES[s.theme];
  const vars = theme ? theme.vars : {
    '--bg': s.custom.bg, '--panel': s.custom.panel, '--panel-2': s.custom.panel,
    '--panel-3': s.custom.accent, '--text': s.custom.text, '--muted': '#9a94b3',
    '--accent': s.custom.accent, '--accent-2': s.custom.accent
  };
  for (const [key, value] of Object.entries(vars)) root.setProperty(key, value);
  document.body.className = `theme-${s.theme}`;
}

/* ------------------------------------------------------------------ */
/* Tabs                                                               */
/* ------------------------------------------------------------------ */

function renderTabs() {
  const strip = $('#tabstrip');
  strip.innerHTML = '';
  for (const tab of state.tabs) {
    const el = document.createElement('div');
    el.className = `tab${tab.active ? ' active' : ''}${tab.split ? ' split-active' : ''}`;
    el.dataset.id = tab.id;
    el.draggable = true;
    const icon = tab.loading
      ? '<span class="spinner"></span>'
      : tab.favicon
        ? `<img class="favicon" src="${esc(tab.favicon)}" alt="">`
        : '<span class="favicon">🌐</span>';
    el.innerHTML = `${icon}<span class="label">${esc(tab.title || tab.url || 'New tab')}</span>
      <button class="close" title="Закрыть вкладку">×</button>`;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.close')) { nb.tabs.close(tab.id); return; }
      if (e.ctrlKey || e.metaKey) { nb.tabs.split(tab.id); return; }
      nb.tabs.activate(tab.id);
    });
    el.addEventListener('auxclick', (e) => { if (e.button === 1) nb.tabs.close(tab.id); });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (tab.id !== state.activeId) nb.tabs.split(tab.id);
    });
    el.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/tab', tab.id));
    el.addEventListener('dragover', (e) => e.preventDefault());
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = e.dataTransfer.getData('text/tab');
      if (!from || from === tab.id) return;
      const order = state.tabs.map((t) => t.id).filter((id) => id !== from);
      order.splice(order.indexOf(tab.id), 0, from);
      nb.tabs.reorder(order);
    });
    strip.appendChild(el);
  }
  const active = state.tabs.find((t) => t.active);
  if (active) {
    if (document.activeElement !== $('#omnibox')) {
      $('#omnibox').value = active.url === 'never://start' ? '' : active.url;
    }
    $('#back').disabled = !active.canGoBack;
    $('#forward').disabled = !active.canGoForward;
    $('#reload').textContent = active.loading ? '×' : '⟳';
    $('#split-btn').classList.toggle('active', state.split);
  }
  $('#split-btn').classList.toggle('active', state.split);
  const idx = state.tabs.findIndex((t) => t.active);
  if (idx >= 0 && state.tabs.length > 1) {
    const activeEl = strip.children[idx];
    activeEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

/* ------------------------------------------------------------------ */
/* Side panels                                                        */
/* ------------------------------------------------------------------ */

function setPanel(view, extra) {
  const body = $('#panel-body');
  const panelEl = $('#panel');
  state.panel = view;

  if (!view) {
    panelEl.classList.add('hidden');
    nb.layout({ rightInset: 0 });
    $$('.side-item').forEach((b) => b.classList.remove('active'));
    return;
  }
  panelEl.classList.remove('hidden');
  body.onclick = null;
  body.innerHTML = '';
  nb.layout({ rightInset: 392 });
  $$('.side-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));

  const views = {
    home: renderHome,
    capsules: renderCapsules,
    ghost: renderGhost,
    plugins: renderPlugins,
    focus: renderFocus,
    settings: renderSettings
  };
  views[view] ? views[view](body, extra) : renderHome(body);
}

function renderHome(body) {
  $('#panel-title').textContent = 'NeverBrowser';
  const total = state.caps.total || 0;
  const ghost = state.ghostStatus;
  body.innerHTML = `
    <div class="empty" style="padding-top:8px">
      <img src="../../assets/mascot.png" alt="BoyKisser">
      <div style="font-weight:600;color:var(--text);font-size:14px">NeverBrowser</div>
      <div class="muted" style="margin-top:4px">Браузер, который никогда не забывает.</div>
    </div>
    <h3>Быстрый старт</h3>
    <div class="card"><div class="title">◷ Time Capsule <span class="pill accent">${total}</span></div>
      <div class="sub">Каждая посещённая страница может быть заморожена локально — даже если сайт удалит её навсегда.</div>
      <div class="btn-row"><button class="btn primary" data-act="capsule">Снять капсулу</button>
      <button class="btn" data-act="view-capsules">Открыть архив</button></div></div>
    <div class="card"><div class="title">◉ Ghost Guard <span class="pill ${ghost?.verified ? 'ok' : 'err'}">${ghost?.verified ? 'verified' : 'не проверен'}</span></div>
      <div class="sub">Подчищает отпечаток Electron, чтобы Google и другие сайты видели обычный браузер, а не бота.</div>
      <div class="btn-row"><button class="btn primary" data-act="view-ghost">Проверить отпечаток</button></div></div>
    <div class="card"><div class="title">⚙ Плагины <span class="pill">${state.plugins.length}</span></div>
      <div class="sub">Панели, команды, content-scripts и фильтры навигации — с манифестом и правами.</div>
      <div class="btn-row"><button class="btn" data-act="view-plugins">Управлять</button>
      <button class="btn ghost" data-act="plugins-dir">Папка плагинов</button></div></div>
    <h3>Горячие клавиши</h3>
    <div class="card"><div class="sub">
      <b>Ctrl+K</b> — командная палитра<br>
      <b>Ctrl+T</b> / <b>Ctrl+W</b> — новая / закрыть вкладку<br>
      <b>Ctrl+Shift+S</b> — split view<br>
      <b>Ctrl+Shift+C</b> — капсула страницы<br>
      <b>Ctrl+Shift+F</b> — Focus Room<br>
      <b>Alt+←/→</b> — назад / вперёд
    </div></div>`;

  body.querySelector('[data-act="capsule"]').onclick = async () => {
    const r = await nb.capsules.capture();
    if (r) toast('success', `Капсула: ${r.title.slice(0, 40)}`);
  };
  body.querySelector('[data-act="view-capsules"]').onclick = () => setPanel('capsules');
  body.querySelector('[data-act="view-ghost"]').onclick = () => setPanel('ghost');
  body.querySelector('[data-act="view-plugins"]').onclick = () => setPanel('plugins');
  body.querySelector('[data-act="plugins-dir"]').onclick = () => nb.shell.openPluginsDir();
}

async function renderCapsules(body) {
  $('#panel-title').textContent = 'Time Capsule';
  const data = await nb.capsules.list();
  state.caps = data;
  body.innerHTML = `
    <div class="search-row">
      <input id="caps-q" placeholder="Поиск по архиву…">
      <button class="btn primary" id="caps-take">Снять</button>
    </div>
    <div class="muted small" style="margin:2px 0 10px">${data.total} капсул · хранятся локально в ${esc(data.dir || '')}</div>
    <div id="caps-list"></div>`;
  const list = body.querySelector('#caps-list');
  const paint = (items) => {
    if (!items.length) {
      list.innerHTML = `<div class="empty"><img src="../../assets/mascot.png"><div>Пока пусто. Открой любую страницу и нажми «Снять».</div></div>`;
      return;
    }
    list.innerHTML = items.map((item) => `
      <div class="card">
        <div class="title">${esc(item.title || item.url)}</div>
        <div class="sub">${esc(item.url)}</div>
        <div class="meta">
          <span class="pill">${new Date(item.capturedAt).toLocaleString('ru-RU')}</span>
          <span class="pill">${(item.size / 1024).toFixed(0)} KB</span>
          ${item.screenshot ? '<span class="pill accent">screenshot</span>' : ''}
        </div>
        <div class="btn-row">
          <button class="btn primary" data-open="${item.id}">Открыть</button>
          <button class="btn ghost" data-src="${item.id}">Оригинал</button>
          <button class="btn danger" data-del="${item.id}">Удалить</button>
        </div>
      </div>`).join('');
  };
  paint(data.items);

  body.querySelector('#caps-q').oninput = async (e) => {
    const res = await nb.capsules.list(e.target.value);
    paint(res.items);
  };
  body.querySelector('#caps-take').onclick = async () => {
    const item = await nb.capsules.capture();
    if (item) renderCapsules(body);
  };
  list.onclick = (e) => {
    const open = e.target.closest('[data-open]');
    const del = e.target.closest('[data-del]');
    const src = e.target.closest('[data-src]');
    if (open) nb.capsules.open(open.dataset.open);
    if (del) { nb.capsules.remove(del.dataset.del).then(() => renderCapsules(body)); }
    if (src) {
      const item = state.caps.items.find((i) => i.id === src.dataset.src);
      if (item) nb.shell.openExternal(item.url);
    }
  };
}

async function renderGhost(body) {
  $('#panel-title').textContent = 'Ghost Guard';
  const st = (state.ghostStatus = await nb.ghost.status());
  const score = st.trustScore || 0;
  const checks = st.checks || [];
  body.innerHTML = `
    <div class="card">
      <div class="title">Доверие отпечатка <span class="pill ${st.verified ? 'ok' : 'err'}">${st.verified ? 'проверен' : 'не проверен'}</span></div>
      <div class="meter"><i style="width:${score}%"></i></div>
      <div class="sub">${score}/100 · проверок капчи: ${st.challenges || 0}</div>
      <div class="btn-row">
        <button class="btn primary" id="ghost-verify">Проверить страницу</button>
        <button class="btn" id="ghost-repair">Пересобрать сессию</button>
      </div>
    </div>
    <h3>Слои защиты</h3>
    <div class="card"><div class="sub">
      <b>User-Agent</b> — ${esc((st.userAgent || '').slice(0, 90))}<br>
      <b>navigator.webdriver</b> — скрыт<br>
      <b>WebRTC / DNT</b> — ${state.settings.ghostGuard.blockWebRTC ? 'включено' : 'выключено'}<br>
      <b>Google Rescue</b> — ${state.settings.ghostGuard.googleRescue ? 'включено' : 'выключено'}
    </div></div>
    ${checks.length ? `<h3>Проверки</h3>${checks.map((c) => `<div class="card"><div class="title">${c.pass ? '✅' : '⚠️'} ${esc(c.label)}</div><div class="sub">вес ${c.weight}</div></div>`).join('')}` : '<div class="empty">Нажми «Проверить страницу» — я посчитаю отпечаток на активной вкладке.</div>'}
    ${(st.rescues || []).length ? `<h3>Перехваты капчи</h3>${st.rescues.slice().reverse().map((r) => `<div class="card"><div class="sub">${esc(r.url).slice(0, 110)}</div><div class="btn-row"><button class="btn primary" data-rescue="${esc(r.rescueUrl)}">Открыть без капчи</button></div></div>`).join('')}` : ''}
    <div class="card"><div class="sub">Ghost Guard не взламывает капчу. Он убирает признаки автоматизации и предлагает альтернативный маршрут, когда Google всё равно сомневается.</div></div>`;

  body.querySelector('#ghost-verify').onclick = async () => {
    const res = await nb.ghost.diagnose();
    state.ghostStatus = res;
    renderGhost(body);
    toast(res.verified ? 'success' : 'warn', `Доверие: ${res.trustScore ?? '—'}/100`);
  };
  body.querySelector('#ghost-repair').onclick = async () => {
    await nb.ghost.repair();
    renderGhost(body);
  };
  body.querySelectorAll('[data-rescue]').forEach((b) => {
    b.onclick = () => nb.tabs.create(b.dataset.rescue);
  });
}

async function renderPlugins(body, focusId) {
  $('#panel-title').textContent = 'Плагины';
  const list = (state.plugins = await nb.plugins.list());
  const info = await nb.appInfo();
  body.innerHTML = `
    <div class="btn-row">
      <button class="btn primary" id="pl-reload">Перезагрузить все</button>
      <button class="btn" id="pl-dir">Открыть папку плагинов</button>
      <button class="btn ghost" id="pl-docs">Документация API</button>
    </div>
    <div class="muted small" style="margin-bottom:12px">Пользовательские плагины: <code>${esc(info.userPluginsDir)}</code></div>
    ${list.length ? '' : '<div class="empty"><img src="../../assets/mascot.png"><div>Плагинов нет. Загляни в docs/PLUGIN-API.md — там пошаговый гайд.</div></div>'}
    <div id="pl-list">
      ${list.map((p) => `
        <div class="card" data-plugin="${esc(p.id)}">
          <div class="title">${esc(p.name)} <span class="pill">v${esc(p.version)}</span></div>
          <div class="sub">${esc(p.description || 'Без описания')}</div>
          <div class="meta">
            <span class="pill ${p.status === 'active' ? 'ok' : p.status === 'error' ? 'err' : ''}">${p.status}</span>
            ${p.builtin ? '<span class="pill accent">built-in</span>' : ''}
            ${(p.permissions || []).map((perm) => `<span class="pill">${esc(perm)}</span>`).join('')}
          </div>
          ${p.error ? `<div class="sub" style="color:#ff8fa8">${esc(p.error)}</div>` : ''}
          <div class="btn-row">
            <button class="btn ${p.status === 'active' ? 'ghost' : 'primary'}" data-toggle="${esc(p.id)}" data-enabled="${p.status === 'active' ? 'false' : 'true'}">
              ${p.status === 'active' ? 'Выключить' : 'Включить'}
            </button>
            ${p.commands.map((c) => `<button class="btn" data-cmd="${esc(p.id)}::${esc(c.id)}">▶ ${esc(c.title)}</button>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;

  body.querySelector('#pl-reload').onclick = async () => { await nb.plugins.reload(); renderPlugins(body); };
  body.querySelector('#pl-dir').onclick = () => nb.shell.openPluginsDir();
  body.querySelector('#pl-docs').onclick = () => nb.shell.openDocs();
  body.onclick = async (e) => {
    const toggle = e.target.closest('[data-toggle]');
    const cmd = e.target.closest('[data-cmd]');
    if (toggle) {
      await nb.plugins.setEnabled(toggle.dataset.toggle, toggle.dataset.enabled === 'true');
      renderPlugins(body);
    }
    if (cmd) {
      const [pluginId, commandId] = cmd.dataset.cmd.split('::');
      const res = await nb.plugins.command(pluginId, commandId);
      if (res && res.ok === false) toast('error', res.error);
      else toast('success', 'Команда выполнена');
    }
  };
  if (focusId) body.querySelector(`[data-plugin="${focusId}"]`)?.scrollIntoView({ block: 'center' });
}

async function renderFocus(body) {
  $('#panel-title').textContent = 'Focus Room';
  const st = await nb.focus.status();
  state.focusUntil = st.until;
  const since = st.until > Date.now() ? new Date(st.until) : null;
  body.innerHTML = `
    <div class="card">
      <div class="title">Режим глубокой работы</div>
      <div class="sub">Блокирует отвлекающие сайты (список настраивается) и показывает таймер прямо в тулбаре.</div>
      <div class="btn-row">
        ${[15, 25, 45, 60].map((m) => `<button class="btn ${m === 25 ? 'primary' : ''}" data-min="${m}">${m} мин</button>`).join('')}
      </div>
      ${since ? `<div class="sub">Завершится в ${since.toLocaleTimeString('ru-RU')}. <button class="btn ghost" id="focus-end">Остановить</button></div>` : '<div class="sub">Сейчас не активно.</div>'}
    </div>
    <h3>Блокируются</h3>
    <div class="card"><div class="sub">${state.settings.focus.blockedHosts.map((h) => `<span class="pill">${esc(h)}</span>`).join(' ')}</div></div>
    <div class="muted small">Список меняется в настройках плагина Focus Room — или через API <code>api.focus</code>.</div>`;
  body.querySelectorAll('[data-min]').forEach((b) => {
    b.onclick = async () => {
      await startFocus(Number(b.dataset.min));
      toast('success', `Focus Room на ${b.dataset.min} минут`);
      renderFocus(body);
    };
  });
  const end = body.querySelector('#focus-end');
  if (end) end.onclick = async () => { await nb.focus.stop(); state.focusUntil = 0; updateFocus(); renderFocus(body); };
}

function renderSettings(body) {
  $('#panel-title').textContent = 'Настройки';
  const s = state.settings;
  const themeCards = Object.entries(THEMES).map(([key, t]) => `
    <button class="theme-card ${s.theme === key ? 'active' : ''}" data-theme="${key}">
      <div class="theme-swatch">
        <i style="background:${t.vars['--bg']}"></i><i style="background:${t.vars['--panel-2']}"></i>
        <i style="background:${t.vars['--accent']}"></i><i style="background:${t.vars['--accent-2']}"></i>
      </div>${t.label}
    </button>`).join('');

  body.innerHTML = `
    <h3>Тема</h3>
    <div class="theme-grid">${themeCards}
      <button class="theme-card ${s.theme === 'custom' ? 'active' : ''}" data-theme="custom">
        <div class="theme-swatch"><i style="background:${s.custom.bg}"></i><i style="background:${s.custom.panel}"></i><i style="background:${s.custom.accent}"></i></div>Custom
      </button>
    </div>
    ${s.theme === 'custom' ? `
      <div class="card" style="margin-top:10px">
        ${[['bg', 'Фон'], ['panel', 'Панели'], ['text', 'Текст'], ['accent', 'Акцент']].map(([k, label]) => `
          <div class="field"><label>${label}</label><input type="color" data-custom="${k}" value="${esc(s.custom[k])}"></div>`).join('')}
      </div>` : ''}

    <h3>Поиск</h3>
    <div class="field"><label>Поисковик по умолчанию</label>
      <select id="set-engine">
        ${[['duckduckgo', 'DuckDuckGo'], ['google', 'Google'], ['bing', 'Bing'], ['startpage', 'Startpage']].map(([v, l]) => `<option value="${v}" ${s.searchEngine === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Ghost Guard UA
      <span class="desc">Подмена отпечатка браузера</span></label>
      <select id="set-ua">
        ${[['auto', 'Авто'], ['chrome-linux', 'Chrome / Linux'], ['chrome-win', 'Chrome / Windows'], ['safari-mac', 'Safari / macOS']].map(([v, l]) => `<option value="${v}" ${s.userAgentPreset === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
    </div>

    <h3>Ghost Guard</h3>
    ${[['enabled', 'Включён'], ['humanizeTyping', 'Человеческая печать'], ['stripWebdriver', 'Скрывать webdriver'], ['realisticUserAgent', 'Реалистичный User-Agent'], ['blockWebRTC', 'Ограничивать WebRTC'], ['googleRescue', 'Google Rescue при капче']].map(([k, label]) => `
      <div class="field"><label>${label}</label>
        <label class="switch"><input type="checkbox" data-gg="${k}" ${s.ghostGuard[k] ? 'checked' : ''}><span></span></label>
      </div>`).join('')}

    <h3>Time Capsule</h3>
    ${[['autoCapture', 'Автоснимки страниц'], ['captureScreenshots', 'Скриншоты (медленнее)']].map(([k, label]) => `
      <div class="field"><label>${label}</label>
        <label class="switch"><input type="checkbox" data-caps="${k}" ${s.capsule[k] ? 'checked' : ''}><span></span></label>
      </div>`).join('')}
    <div class="field"><label>Максимум капсул</label><input type="number" min="20" max="5000" id="caps-max" value="${s.capsule.maxItems}"></div>
    <div class="btn-row"><button class="btn" id="caps-open-dir">Папка капсул</button></div>

    <h3>Маскот</h3>
    <div class="field"><label>Реакции BoyKisser</label>
      <label class="switch"><input type="checkbox" data-mascot="reactions" ${s.mascot.reactions ? 'checked' : ''}><span></span></label>
    </div>
    <div class="field"><label>Имя маскота</label><input type="text" id="mascot-name" value="${esc(s.mascot.name)}"></div>

    <h3>О браузере</h3>
    <div class="card"><div class="sub" id="about-info">…</div>
      <div class="btn-row"><button class="btn ghost" id="reset-settings">Сбросить настройки</button></div>
    </div>`;

  body.querySelectorAll('[data-theme]').forEach((b) => {
    b.onclick = () => patchSettings({ theme: b.dataset.theme }).then(() => { applyTheme(); renderSettings(body); });
  });
  body.querySelectorAll('[data-custom]').forEach((i) => {
    i.oninput = () => {
      const custom = { ...state.settings.custom, [i.dataset.custom]: i.value };
      patchSettings({ theme: 'custom', custom }).then(() => applyTheme());
    };
  });
  body.querySelector('#set-engine').onchange = (e) => patchSettings({ searchEngine: e.target.value });
  body.querySelector('#set-ua').onchange = (e) => patchSettings({ userAgentPreset: e.target.value });
  body.querySelectorAll('[data-gg]').forEach((i) => {
    i.onchange = () => patchSettings({ ghostGuard: { [i.dataset.gg]: i.checked } }).then(() => renderGhostState());
  });
  body.querySelectorAll('[data-caps]').forEach((i) => {
    i.onchange = () => patchSettings({ capsule: { [i.dataset.caps]: i.checked } });
  });
  body.querySelector('#caps-max').onchange = (e) => patchSettings({ capsule: { maxItems: Number(e.target.value) } });
  body.querySelector('[data-mascot="reactions"]').onchange = (e) => patchSettings({ mascot: { reactions: e.target.checked } });
  body.querySelector('#mascot-name').onchange = (e) => {
    patchSettings({ mascot: { name: e.target.value || 'BoyKisser' } }).then(() => {
      $$('[data-mascot-name]').forEach((el) => { el.textContent = state.settings.mascot.name; });
    });
  };
  body.querySelector('#reset-settings').onclick = async () => {
    state.settings = await nb.settings.reset();
    applyTheme();
    renderSettings(body);
    toast('success', 'Настройки сброшены');
  };
  nb.appInfo().then((info) => {
    const el = body.querySelector('#about-info');
    if (el) el.innerHTML = `NeverBrowser v${info.version}<br>Electron ${info.electron} · Chromium ${info.chromium}<br>Автор: @${esc(info.author)} · Маскот: BoyKisser`;
  });
}

function renderGhostState() {
  const shield = $('#omni-shield');
  const on = state.settings?.ghostGuard.enabled;
  shield.classList.toggle('warn', !on);
  shield.title = on ? 'Ghost Guard: защита включена' : 'Ghost Guard выключен';
}

/* ------------------------------------------------------------------ */
/* Plugin panels in sidebar                                            */
/* ------------------------------------------------------------------ */

function renderPluginPanels() {
  const wrap = $('#plugin-panels');
  const panels = state.plugins.flatMap((p) => (p.panels || []).map((panel) => ({ ...panel, pluginId: p.id, pluginName: p.name, disabled: p.status !== 'active' })));
  if (!panels.length) {
    wrap.innerHTML = '<div class="muted small" style="padding:2px 10px 8px">Пока нет панелей плагинов.</div>';
    return;
  }
  wrap.innerHTML = panels.map((p) => `
    <button class="plugin-panel-btn" data-plugin-panel="${esc(p.pluginId)}::${esc(p.id)}" ${p.disabled ? 'disabled style="opacity:.45"' : ''}>
      <span class="icon">${esc(p.icon || '◇')}</span>
      <span>${esc(p.title)}</span>
    </button>`).join('');
  wrap.onclick = async (e) => {
    const btn = e.target.closest('[data-plugin-panel]');
    if (!btn) return;
    const [pluginId, panelId] = btn.dataset.pluginPanel.split('::');
    openPluginPanel(pluginId, panelId);
  };
}

async function openPluginPanel(pluginId, panelId) {
  const panel = await nb.plugins.panel(pluginId, panelId);
  if (!panel) return toast('error', 'Панель не найдена');
  const body = $('#panel-body');
  state.panel = 'plugin';
  $('#panel').classList.remove('hidden');
  nb.layout({ rightInset: 392 });
  $$('.side-item').forEach((b) => b.classList.remove('active'));
  $('#panel-title').textContent = `${panel.title} · ${panel.pluginName}`;
  const frameId = `plugin-frame-${Date.now()}`;
  const panelKey = `${pluginId}::${panelId}`;
  body.innerHTML = `<div class="muted small" style="margin-bottom:8px">Плагин <b>${esc(panel.pluginName)}</b> · ${esc(pluginId)}</div>
    <iframe class="plugin-frame" id="${frameId}" data-key="${esc(panelKey)}" sandbox="allow-scripts allow-forms" style="height:${panel.height - 60}px"></iframe>
    <div class="btn-row"><button class="btn ghost" id="pp-close">Закрыть панель</button></div>`;
  const frame = body.querySelector(`#${frameId}`);
  const bridge = `
    <script>
      const send = (msg) => parent.postMessage({ __nb: true, pluginId: ${JSON.stringify(pluginId)}, panelId: ${JSON.stringify(panelId)}, data: msg }, '*');
      window.nbPanel = {
        ready: () => send({ type: 'ready' }),
        call: (method, args) => send({ type: 'call', method, args }),
        show: (data) => window.dispatchEvent(new CustomEvent('nb:data', { detail: data }))
      };
      window.addEventListener('message', (e) => {
        if (e.data && e.data.__nbData) window.dispatchEvent(new CustomEvent('nb:data', { detail: e.data.__nbData }));
      });
      send({ type: 'ready' });
    <\/script>`;
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8">
    <style>
      :root{color-scheme:dark;--bg:${getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#101018'};--accent:var(--accent, #ff7ab8)}
      body{margin:0;padding:0;background:transparent;color:${getComputedStyle(document.documentElement).getPropertyValue('--text') || '#fff'};
        font:13px/1.5 Inter,system-ui,sans-serif}
      h1,h2,h3{font-size:14px;margin:0 0 8px;color:${getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#ff7ab8'}}
      button{font:inherit;color:#1a1020;background:${getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#ff7ab8'};border:0;border-radius:9px;padding:7px 12px;cursor:pointer}
      input,select{font:inherit;background:#1d1d28;color:inherit;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:6px 8px;outline:none}
      .row{display:flex;gap:8px;align-items:center;margin-bottom:8px}
      .card{padding:10px;border:1px solid rgba(255,255,255,.1);border-radius:10px;margin-bottom:8px}
      .muted{opacity:.65}.pill{font-size:10px;padding:2px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.2)}
    </style></head><body>${panel.html}${bridge}</body></html>`;

  frame.onload = () => {
    frame.contentWindow.postMessage({ __nbData: { type: 'init', theme: state.settings.theme, settings: state.settings } }, '*');
  };
  body.querySelector('#pp-close').onclick = () => setPanel(null);
}

window.addEventListener('message', (e) => {
  const msg = e.data;
  if (!msg || !msg.__nb) return;
  nb.plugins.panelMessage(msg.pluginId, { panelId: msg.panelId, data: msg.data });
});

/* ------------------------------------------------------------------ */
/* Command palette                                                     */
/* ------------------------------------------------------------------ */

const BUILTIN_COMMANDS = [
  { icon: '➕', title: 'Новая вкладка', kind: 'tab', run: () => nb.tabs.create() },
  { icon: '◷', title: 'Снять капсулу страницы', kind: 'capsule', run: () => nb.capsules.capture() },
  { icon: '▥', title: 'Переключить split view', kind: 'view', run: () => toggleSplit() },
  { icon: '⌛', title: 'Focus Room 25 минут', kind: 'focus', run: () => startFocus(25) },
  { icon: '◉', title: 'Ghost Guard: проверить отпечаток', kind: 'ghost', run: () => nb.ghost.diagnose() },
  { icon: '🩹', title: 'Ghost Guard: пересобрать сессию', kind: 'ghost', run: () => nb.ghost.repair() },
  { icon: '⚙', title: 'Плагины', kind: 'panel', run: () => setPanel('plugins') },
  { icon: '🎨', title: 'Настройки темы', kind: 'panel', run: () => setPanel('settings') },
  { icon: '📚', title: 'Документация плагинов', kind: 'docs', run: () => nb.shell.openDocs() }
];

function paletteItems(query) {
  const q = query.toLowerCase().trim();
  const items = [...BUILTIN_COMMANDS];
  for (const plugin of state.plugins) {
    for (const cmd of plugin.commands || []) {
      items.push({
        icon: '🧩', title: cmd.title, kind: plugin.name,
        run: () => nb.plugins.command(plugin.id, cmd.id)
      });
    }
    for (const panel of plugin.panels || []) {
      items.push({ icon: panel.icon || '◇', title: panel.title, kind: plugin.name, run: () => openPluginPanel(plugin.id, panel.id) });
    }
  }
  for (const item of state.caps.items.slice(0, 80)) {
    items.push({ icon: '◷', title: item.title || item.url, kind: 'capsule', run: () => nb.capsules.open(item.id) });
  }
  for (const tab of state.tabs) {
    items.push({ icon: '🗂', title: tab.title || tab.url, kind: 'вкладка', run: () => nb.tabs.activate(tab.id) });
  }
  if (!q) return items.slice(0, 60);
  return items.filter((i) => `${i.title} ${i.kind}`.toLowerCase().includes(q)).slice(0, 60);
}

function openPalette() {
  const palette = $('#palette');
  palette.classList.remove('hidden');
  nb.layout({ modal: true });
  const input = $('#palette-input');
  input.value = '';
  input.focus();
  drawPalette('');
  input.oninput = () => drawPalette(input.value);
}

function closePalette() {
  $('#palette').classList.add('hidden');
  nb.layout({ modal: false });
}

function drawPalette(query) {
  state.paletteItems = paletteItems(query);
  state.paletteIndex = 0;
  const res = $('#palette-results');
  res.innerHTML = state.paletteItems.map((item, i) => `
    <div class="palette-item ${i === 0 ? 'sel' : ''}" data-i="${i}">
      <span class="icon">${item.icon || '•'}</span><span>${esc(item.title)}</span><span class="kind">${esc(item.kind)}</span>
    </div>`).join('') || '<div class="empty">Ничего не найдено</div>';
  res.onclick = (e) => {
    const el = e.target.closest('[data-i]');
    if (!el) return;
    runPaletteItem(Number(el.dataset.i));
  };
}

function runPaletteItem(index) {
  const item = state.paletteItems[index];
  closePalette();
  if (item) item.run();
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function toast(kind, text) {
  const wrap = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3600);
  setTimeout(() => el.remove(), 4000);
  while (wrap.children.length > 3) wrap.firstElementChild.remove();
}

function setMascot(text, mood = 'idle') {
  if (!state.settings?.mascot.reactions) return;
  $('#mascot-text').textContent = text;
  const img = $('#dock-mascot');
  img.className = '';
  if (mood !== 'idle') {
    void img.offsetWidth;
    img.classList.add(`react-${['happy', 'shield', 'error'].includes(mood) ? mood : 'happy'}`);
  }
  const dock = $('.mascot-dock');
  dock.classList.remove('pop');
  void dock.offsetWidth;
  dock.classList.add('pop');
}

async function startFocus(minutes) {
  const res = await nb.focus.start(minutes);
  if (res && res.until) state.focusUntil = res.until;
  updateFocus();
  return res;
}

async function patchSettings(patch) {
  state.settings = await nb.settings.patch(patch);
  return state.settings;
}

function toggleSplit() {
  const other = state.tabs.find((t) => t.active && !t.split);
  if (state.split) {
    nb.tabs.split(state.activeId);
    return;
  }
  const candidate = state.tabs.find((t) => !t.active);
  if (candidate) nb.tabs.split(candidate.id);
  else toast('warn', 'Открой вторую вкладку — и включится split view.');
}

function updateFocus() {
  const pill = $('#focus-pill');
  if (!state.focusUntil || state.focusUntil < Date.now()) {
    pill.classList.add('hidden');
    return;
  }
  pill.classList.remove('hidden');
  const left = Math.max(0, state.focusUntil - Date.now());
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  $('#focus-timer').textContent = `${m}:${String(s).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

function wire() {
  // Window controls
  $('#win-min').onclick = () => nb.window.minimize();
  $('#win-max').onclick = () => nb.window.toggleMaximize();
  $('#win-close').onclick = () => nb.window.close();
  $('#new-tab').onclick = () => nb.tabs.create();
  $('#sidebar-toggle').onclick = () => toggleSidebar();
  $('#split-btn').onclick = () => toggleSplit();
  $('#focus-btn').onclick = () => setPanel('focus');
  $('#palette-btn').onclick = () => openPalette();

  // Navigation
  $('#back').onclick = () => nb.tabs.back(state.activeId);
  $('#forward').onclick = () => nb.tabs.forward(state.activeId);
  $('#reload').onclick = () => {
    const tab = state.tabs.find((t) => t.active);
    if (tab?.loading) nb.tabs.stop(state.activeId);
    else nb.tabs.reload(state.activeId);
  };
  const go = () => {
    const value = $('#omnibox').value.trim();
    if (!value) return;
    nb.tabs.navigate(state.activeId, value);
    $('#omnibox').blur();
  };
  $('#omni-go').onclick = go;
  $('#omnibox').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') go();
    if (e.key === 'Escape') $('#omnibox').blur();
  });
  $('#omnibox').addEventListener('focus', () => $('#omnibox').select());
  $('#omni-shield').onclick = () => setPanel('ghost');

  // Side nav
  $('#side-nav').onclick = (e) => {
    const btn = e.target.closest('.side-item');
    if (!btn) return;
    const view = btn.dataset.view;
    if (state.panel === view) setPanel(null);
    else setPanel(view);
  };
  $('#panel-close').onclick = () => setPanel(null);

  // Quick panel buttons
  $$('#quick-tools [data-panel]').forEach((b) => {
    b.onclick = () => setPanel(b.dataset.panel);
  });

  // Palette keyboard
  window.addEventListener('keydown', (e) => {
    const paletteOpen = !$('#palette').classList.contains('hidden');
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); setPanel('plugins'); return; }
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); paletteOpen ? closePalette() : openPalette(); return; }
    if (mod && e.key.toLowerCase() === 't') { e.preventDefault(); nb.tabs.create(); return; }
    if (mod && e.key.toLowerCase() === 'w') { e.preventDefault(); if (state.activeId) nb.tabs.close(state.activeId); return; }
    if (mod && e.key.toLowerCase() === 'r') { e.preventDefault(); nb.tabs.reload(state.activeId, e.shiftKey); return; }
    if (mod && e.key.toLowerCase() === 'l') { e.preventDefault(); $('#omnibox').focus(); return; }
    if (mod && e.key === ',') { e.preventDefault(); setPanel('settings'); return; }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); nb.capsules.capture(); return; }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); setPanel('focus'); return; }
    if (mod && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); toggleSplit(); return; }
    if (mod && ['1', '2', '3', '4', '5'].includes(e.key)) {
      e.preventDefault();
      const views = ['home', 'capsules', 'ghost', 'plugins', 'focus'];
      setPanel(views[Number(e.key) - 1]);
      return;
    }
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); nb.tabs.back(state.activeId); return; }
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); nb.tabs.forward(state.activeId); return; }
    if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); nb.tabs.zoom(currentZoom + 0.1); return; }
    if (mod && e.key === '-') { e.preventDefault(); nb.tabs.zoom(currentZoom - 0.1); return; }
    if (mod && e.key === '0') { e.preventDefault(); nb.tabs.zoom(1); return; }

    if (e.key === 'Escape') {
      if (paletteOpen) { e.preventDefault(); closePalette(); }
      else if (state.panel) setPanel(null);
      return;
    }
    if (paletteOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); movePalette(1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); movePalette(-1); }
      if (e.key === 'Enter') { e.preventDefault(); runPaletteItem(state.paletteIndex); }
      return;
    }
  });

  // IPC subscriptions
  nb.on('tabs:changed', ({ tabs, activeId, split }) => {
    state.tabs = tabs;
    state.activeId = activeId;
    state.split = split;
    renderTabs();
  });
  nb.on('settings:changed', (settings) => {
    state.settings = settings;
    applyTheme();
    renderGhostState();
    $$('[data-mascot-name]').forEach((el) => { el.textContent = settings.mascot.name || 'BoyKisser'; });
  });
  nb.on('plugins:changed', (list) => {
    state.plugins = list;
    renderPluginPanels();
  });
  nb.on('mascot:mood', ({ mood, text }) => setMascot(text, mood));
  nb.on('toast', ({ kind, text }) => toast(kind, text));
  nb.on('ghost:ban', (payload) => {
    toast('warn', 'Google показал проверку на робота. Ghost Guard нашёл обход.');
    setPanel('ghost');
    setMascot('Google опять проверяет? Я нашёл маршрут без капчи.', 'shield');
    state.ghostStatus = { ...(state.ghostStatus || {}), rescues: [...(state.ghostStatus?.rescues || []), payload] };
  });
  nb.on('ghost:event', ({ status }) => { state.ghostStatus = status; });
  nb.on('plugin:open-panel', ({ pluginId, panelId }) => openPluginPanel(pluginId, panelId));
  nb.on('plugin:panel:event', ({ pluginId, panelId, data }) => {
    const frame = document.querySelector(`iframe[data-key="${pluginId}::${panelId}"]`);
    frame?.contentWindow?.postMessage({ __nbData: data }, '*');
  });
  nb.on('plugin:theme', ({ vars }) => {
    if (!vars) { applyTheme(); return; }
    for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
  });
  nb.on('capsule:changed', () => { if (state.panel === 'capsules') renderCapsules($('#panel-body')); });
  nb.on('focus:tick', ({ until }) => { state.focusUntil = until || 0; updateFocus(); });

  setInterval(updateFocus, 1000);
}

let currentZoom = 1;
function movePalette(dir) {
  state.paletteIndex = Math.max(0, Math.min(state.paletteItems.length - 1, state.paletteIndex + dir));
  $$('.palette-item').forEach((el, i) => el.classList.toggle('sel', i === state.paletteIndex));
  const el = $$('.palette-item')[state.paletteIndex];
  el?.scrollIntoView({ block: 'nearest' });
}

let sidebarCollapsed = false;
function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  $('#frame').classList.toggle('sidebar-collapsed', sidebarCollapsed);
  nb.layout({ sidebarWidth: sidebarCollapsed ? 0 : 264 });
  if (sidebarCollapsed) setPanel(null);
}

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */

async function boot() {
  state.settings = await nb.settings.get();
  state.plugins = await nb.plugins.list();
  const t = await nb.tabs.list();
  state.tabs = t.tabs;
  state.activeId = t.activeId;
  state.split = t.split;
  state.ghostStatus = await nb.ghost.status();
  state.caps = await nb.capsules.list();

  applyTheme();
  renderTabs();
  renderPluginPanels();
  renderGhostState();
  $$('[data-mascot-name]').forEach((el) => { el.textContent = state.settings.mascot.name || 'BoyKisser'; });
  setPanel('home');
  wire();
  nb.layout({ chromeHeight: 100, sidebarWidth: sidebarCollapsed ? 0 : 264 });

  // Welcome line from the mascot.
  setTimeout(() => setMascot('Привет! Я BoyKisser. Слежу за вкладками, капсулами и капчей.', 'happy'), 600);
}

boot();
