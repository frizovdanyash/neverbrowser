'use strict';
/**
 * NeverBrowser — main process.
 * Custom window chrome + WebContentsView tabs + plugin host + mascot brain.
 */
const { app, BrowserWindow, WebContentsView, ipcMain, shell, session, Menu, nativeTheme, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const Store = require('./store').Store;
const { PluginHost } = require('./plugins');
const { CapsuleVault } = require('./capsule');
const { GhostGuard } = require('./ghost');
const t = require('./tabs');

const ROOT = path.join(__dirname, '..', '..');
const RENDERER = path.join(ROOT, 'src', 'renderer');
const BUNDLED_PLUGINS = path.join(ROOT, 'plugins');
const USER_PLUGINS = path.join(app.getPath('userData'), 'plugins');

let win = null;
let store = null;
let plugins = null;
let capsules = null;
let ghost = null;

const state = {
  chromeHeight: 100,
  sidebarWidth: 264,
  splitRatio: 0.5,
  split: false,
  rightInset: 0,
  modal: false,
  focusUntil: 0
};

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

class TabManager {
  constructor() {
    this.tabs = new Map();
    this.order = [];
    this.activeId = null;
    this.secondaryId = null;
    this.seq = 0;
  }

  create({ url = 'never://start', title = 'New tab', background = false } = {}) {
    const id = `tab-${++this.seq}`;
    const view = new WebContentsView({
      webPreferences: {
        partition: 'persist:neverbrowser',
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        safeDialogs: true,
        spellcheck: true
      }
    });
    const wc = view.webContents;
    view.setBackgroundColor('#101018');
    const tab = { id, view, wc, title, url, loading: false, canGoBack: false, canGoForward: false, muted: false, createdAt: Date.now() };
    this.tabs.set(id, tab);
    this.order.push(id);

    ghost.harden(wc);

    const emit = () => this.sendTabs();
    wc.on('page-title-updated', (_e, title) => { tab.title = title; emit(); this.pushMascot('reading'); });
    wc.on('did-start-loading', () => { tab.loading = true; emit(); });
    wc.on('did-stop-loading', () => { tab.loading = false; this.syncMeta(tab); emit(); });
    wc.on('did-navigate', (_e, url) => { tab.url = url; this.syncMeta(tab); emit(); this.onNavigated(tab); });
    wc.on('did-navigate-in-page', (_e, url, sameDoc) => { tab.url = url; emit(); if (!sameDoc) this.onNavigated(tab); });
    wc.on('did-fail-load', (_e, code, desc, url, isMain) => {
      if (!isMain || code === -3) return;
      tab.loading = false;
      this.pushMascot('error');
      this.send('tab:error', { id, code, desc, url });
      emit();
    });
    wc.on('page-favicon-updated', (_e, icons) => { tab.favicon = icons?.[0]; emit(); });
    wc.on('context-menu', (_e, params) => this.contextMenu(tab, params));
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) this.create({ url });
      return { action: 'deny' };
    });
    wc.on('will-navigate', (event, url) => {
      const blocked = plugins?.filterNavigation(url);
      if (blocked) {
        event.preventDefault();
        this.send('toast', { kind: 'warn', text: `Blocked by Focus Room: ${blocked}` });
      }
    });
    wc.on('did-finish-load', () => {
      const url = wc.getURL();
      if (url.startsWith('never://')) return;
      plugins?.runContentScripts(wc, url);
      ghost.onLoad(wc, url);
      if (store.get('capsule.autoCapture')) capsules?.capture(tab);
      this.pushMascot('reading');
    });

    if (!background) this.activate(id);
    this.applyLayout();
    if (url !== 'never://start') this.navigate(id, url);
    else this.loadStart(tab);
    return tab;
  }

  loadStart(tab) {
    const file = path.join(RENDERER, 'newtab.html');
    tab.wc.loadFile(file);
    tab.url = 'never://start';
    tab.title = 'New tab';
    this.sendTabs();
  }

  navigate(id, input) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    const url = normalizeUrl(input, store.get('searchEngine'));
    if (url === 'never://start') {
      tab.url = url;
      this.loadStart(tab);
    } else {
      tab.wc.loadURL(url).catch(() => {});
      tab.url = url;
    }
    this.sendTabs();
  }

  activate(id) {
    if (!this.tabs.has(id)) return;
    this.activeId = id;
    for (const [tid, tab] of this.tabs) {
      if (tid === id || (state.split && tid === this.secondaryId)) {
        if (!win.contentView.children.includes(tab.view)) win.contentView.addChildView(tab.view);
      } else if (win.contentView.children.includes(tab.view)) {
        win.contentView.removeChildView(tab.view);
      }
    }
    this.applyLayout();
    this.sendTabs();
    this.pushMascot('idle');
  }

  close(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    if (win.contentView.children.includes(tab.view)) win.contentView.removeChildView(tab.view);
    tab.wc.close();
    this.tabs.delete(id);
    this.order = this.order.filter((x) => x !== id);
    if (this.secondaryId === id) { this.secondaryId = null; state.split = false; }
    if (this.activeId === id) {
      const next = this.order[Math.max(0, this.order.indexOf(id))] || this.order[0];
      if (next) this.activate(next); else this.create();
    }
    this.sendTabs();
    this.applyLayout();
  }

  toggleSplit(id) {
    if (!id || id === this.activeId) {
      state.split = false;
      this.secondaryId = null;
    } else {
      state.split = true;
      this.secondaryId = id;
    }
    if (this.activeId) this.activate(this.activeId);
  }

  syncMeta(tab) {
    try {
      tab.canGoBack = tab.wc.navigationHistory ? tab.wc.navigationHistory.canGoBack() : tab.wc.canGoBack();
      tab.canGoForward = tab.wc.navigationHistory ? tab.wc.navigationHistory.canGoForward() : tab.wc.canGoForward();
    } catch { /* noop */ }
    tab.url = tab.wc.getURL() || tab.url;
  }

  onNavigated(tab) {
    const url = tab.wc.getURL();
    plugins?.emit('tab:navigated', { url, title: tab.title, tabId: tab.id });
    ghost.onNavigate(tab, url);
    capsules?.noteVisit(url, tab.title);
    this.send('nav:changed', { id: tab.id, url, title: tab.title });
  }

  contextMenu(tab, params) {
    const items = [
      { label: 'Back', enabled: tab.canGoBack, click: () => tab.wc.navigationHistory.goBack() },
      { label: 'Forward', enabled: tab.canGoForward, click: () => tab.wc.navigationHistory.goForward() },
      { label: 'Reload', click: () => tab.wc.reload() },
      { type: 'separator' },
      { label: 'Copy link', enabled: !!params.linkURL, click: () => clipboard.writeText(params.linkURL) },
      { label: 'Open link in new tab', enabled: !!params.linkURL, click: () => this.create({ url: params.linkURL }) },
      { type: 'separator' },
      { label: 'Snapshot to Time Capsule', click: () => capsules?.capture(tab, true) },
      { label: 'Inspect element', click: () => tab.wc.inspectElement(params.x, params.y) }
    ];
    Menu.buildFromTemplate(items).popup({ window: win });
  }

  applyLayout() {
    if (!win || win.isDestroyed()) return;
    const [w, h] = win.getContentSize();
    const left = state.sidebarWidth;
    const top = state.chromeHeight;
    const rightInset = state.rightInset;
    const width = Math.max(0, w - left - rightInset);
    const height = Math.max(0, h - top);
    const active = this.tabs.get(this.activeId);
    const secondary = state.split ? this.tabs.get(this.secondaryId) : null;

    if (state.modal) {
      for (const tab of this.tabs.values()) {
        if (win.contentView.children.includes(tab.view)) win.contentView.removeChildView(tab.view);
      }
      return;
    }
    for (const [tid, tab] of this.tabs) {
      const wanted = tid === this.activeId || (state.split && tid === this.secondaryId);
      const attached = win.contentView.children.includes(tab.view);
      if (wanted && !attached) win.contentView.addChildView(tab.view);
      if (!wanted && attached) win.contentView.removeChildView(tab.view);
    }

    if (secondary && active && secondary !== active) {
      const splitX = Math.round(width * state.splitRatio);
      active.view.setBounds({ x: left, y: top, width: splitX - 4, height });
      secondary.view.setBounds({ x: left + splitX + 4, y: top, width: width - splitX - 4, height });
    } else if (active) {
      active.view.setBounds({ x: left, y: top, width, height });
    }
  }

  list() {
    return this.order.map((id) => {
      const tab = this.tabs.get(id);
      return {
        id, title: tab.title, url: tab.url, favicon: tab.favicon,
        loading: tab.loading, muted: tab.muted,
        canGoBack: tab.canGoBack, canGoForward: tab.canGoForward,
        active: id === this.activeId, split: state.split && id === this.secondaryId
      };
    });
  }

  sendTabs() {
    this.send('tabs:changed', { tabs: this.list(), activeId: this.activeId, split: state.split });
  }

  send(channel, payload) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  pushMascot(mood, text) {
    if (!store.get('mascot.reactions')) return;
    this.send('mascot:mood', { mood, text });
  }

  active() {
    return this.tabs.get(this.activeId);
  }
}

/* ------------------------------------------------------------------ */
/* Window                                                                */
/* ------------------------------------------------------------------ */

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#101018',
    show: false,
    icon: path.join(ROOT, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(ROOT, 'src', 'preload', 'index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(RENDERER, 'index.html'));
  win.once('ready-to-show', () => win.show());

  win.on('resize', () => tabs.applyLayout());
  win.on('maximize', () => { tabs.applyLayout(); tabs.send('window:state', { maximized: true }); });
  win.on('unmaximize', () => { tabs.applyLayout(); tabs.send('window:state', { maximized: false }); });
  win.on('enter-full-screen', () => tabs.send('window:state', { fullscreen: true }));
  win.on('leave-full-screen', () => tabs.send('window:state', { fullscreen: false }));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) tabs.create({ url });
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });

  tabs = new TabManager();
  tabs.create({ url: store.get('startup') === 'start' ? 'never://start' : 'never://start' });
}

/* ------------------------------------------------------------------ */
/* URL helpers                                                          */
/* ------------------------------------------------------------------ */

const ENGINES = {
  google: 'https://www.google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  bing: 'https://www.bing.com/search?q=',
  startpage: 'https://www.startpage.com/sp/search?query='
};

function normalizeUrl(input, engine = 'duckduckgo') {
  const raw = String(input || '').trim();
  if (!raw) return 'never://start';
  if (raw === 'never://start' || raw.startsWith('never://')) return raw;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(raw)) return `http://${raw}`;
  const looksLikeHost = /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(raw) && !/\s/.test(raw);
  if (looksLikeHost) return `https://${raw}`;
  return `${ENGINES[engine] || ENGINES.duckduckgo}${encodeURIComponent(raw)}`;
}

/* ------------------------------------------------------------------ */
/* IPC                                                                   */
/* ------------------------------------------------------------------ */

let tabs = null;

function wireIpc() {
  const on = (channel, fn) => ipcMain.handle(channel, (event, ...args) => fn(...args));

  on('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    author: 'frizovdanya',
    userPluginsDir: USER_PLUGINS
  }));

  on('settings:get', () => store.all());
  on('settings:patch', (patch) => {
    const next = store.patch(patch);
    applySettings(next);
    return next;
  });
  on('settings:reset', () => {
    const next = store.reset();
    applySettings(next);
    return next;
  });

  on('tabs:list', () => ({ tabs: tabs.list(), activeId: tabs.activeId, split: state.split }));
  on('tabs:new', (url) => tabs.create({ url: url || 'never://start' }));
  on('tabs:close', (id) => tabs.close(id));
  on('tabs:activate', (id) => tabs.activate(id));
  on('tabs:navigate', (id, url) => tabs.navigate(id, url));
  on('tabs:back', (id) => { const tb = tabs.tabs.get(id); if (tb?.wc.navigationHistory.canGoBack()) tb.wc.navigationHistory.goBack(); });
  on('tabs:forward', (id) => { const tb = tabs.tabs.get(id); if (tb?.wc.navigationHistory.canGoForward()) tb.wc.navigationHistory.goForward(); });
  on('tabs:reload', (id, hard) => { const tb = tabs.tabs.get(id); if (tb) hard ? tb.wc.reloadIgnoringCache() : tb.wc.reload(); });
  on('tabs:stop', (id) => tabs.tabs.get(id)?.wc.stop());
  on('tabs:mute', (id, muted) => {
    const tb = tabs.tabs.get(id);
    if (!tb) return;
    tb.muted = muted;
    tb.wc.setAudioMuted(muted);
    tabs.sendTabs();
  });
  on('tabs:split', (id) => tabs.toggleSplit(id));
  on('tabs:reorder', (order) => { tabs.order = order; tabs.sendTabs(); });
  on('tabs:zoom', (factor) => {
    const tb = tabs.active();
    if (tb) tb.wc.setZoomFactor(factor);
  });

  on('layout:set', (patch) => {
    if (typeof patch.chromeHeight === 'number') state.chromeHeight = Math.round(patch.chromeHeight);
    if (typeof patch.sidebarWidth === 'number') state.sidebarWidth = Math.round(patch.sidebarWidth);
    if (typeof patch.splitRatio === 'number') state.splitRatio = Math.min(0.8, Math.max(0.2, patch.splitRatio));
    if (typeof patch.split === 'boolean' && patch.split === false) { state.split = false; tabs.secondaryId = null; }
    if (typeof patch.rightInset === 'number') state.rightInset = Math.max(0, Math.round(patch.rightInset));
    if (typeof patch.modal === 'boolean') state.modal = patch.modal;
    if (typeof patch.sidebarWidth === 'number' && patch.sidebarWidth === 0) state.sidebarWidth = 0;
    tabs.applyLayout();
    return state;
  });

  on('window:minimize', () => win.minimize());
  on('window:toggleMaximize', () => win.isMaximized() ? win.unmaximize() : win.maximize());
  on('window:close', () => win.close());
  on('window:isMaximized', () => win.isMaximized());

  on('shell:openExternal', (url) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
  on('shell:openPluginsDir', () => shell.openPath(USER_PLUGINS));
  on('shell:openDocs', () => shell.openPath(path.join(ROOT, 'docs', 'PLUGIN-API.md')));

  on('plugins:list', () => plugins.list());
  on('plugins:setEnabled', (id, enabled) => plugins.setEnabled(id, enabled));
  on('plugins:command', (id, commandId, args) => plugins.runCommand(id, commandId, args));
  on('plugins:panel', (pluginId, panelId) => plugins.getPanel(pluginId, panelId));
  on('plugins:panelMessage', (pluginId, payload) => plugins.panelMessage(pluginId, payload));
  on('plugins:reload', () => plugins.reload());

  on('capsule:list', (query) => capsules.list(query));
  on('capsule:capture', () => { const tb = tabs.active(); return tb ? capsules.capture(tb, true) : null; });
  on('capsule:open', (id) => capsules.open(id, tabs));
  on('capsule:remove', (id) => capsules.remove(id));

  on('ghost:status', () => ghost.status());
  on('ghost:verify', () => ghost.verify());
  on('ghost:diagnose', () => ghost.diagnose(tabs.active()));
  on('ghost:repair', () => ghost.repair());

  on('focus:start', (minutes) => plugins.startFocus(minutes));
  on('focus:stop', () => plugins.stopFocus());
  on('focus:status', () => ({ until: state.focusUntil, now: Date.now() }));

  on('page:execute', (id, code) => {
    const tb = tabs.tabs.get(id);
    return tb ? tb.wc.executeJavaScript(code, true) : null;
  });
}

/* ------------------------------------------------------------------ */
/* Settings application                                                 */
/* ------------------------------------------------------------------ */

let lastTheme = null;

function applySettings(settings) {
  if (!win) return;
  nativeTheme.themeSource = settings.theme === 'latte' ? 'light' : 'dark';
  tabs?.send('settings:changed', settings);
  lastTheme = settings.theme;
  tabs?.applyLayout();
}

/* ------------------------------------------------------------------ */
/* Boot                                                                 */
/* ------------------------------------------------------------------ */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(() => {
    app.setName('NeverBrowser');
    app.setAboutPanelOptions({
      applicationName: 'NeverBrowser',
      applicationVersion: app.getVersion(),
      copyright: 'frizovdanya',
      credits: 'Mascot: BoyKisser. Built with Electron.'
    });

    store = new Store(app.getPath('userData'));
    lastTheme = store.get('theme');

    // Session-level anti-bot hardening for the persistent profile.
    const ses = session.fromPartition('persist:neverbrowser');
    ses.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(['fullscreen', 'clipboard-sanitized-write', 'notifications'].includes(permission));
    });
    ses.webRequest.onBeforeSendHeaders((details, cb) => {
      const headers = details.requestHeaders;
      if (store.get('ghostGuard.enabled') && store.get('ghostGuard.blockWebRTC')) {
        headers['DNT'] = '1';
      }
      cb({ requestHeaders: headers });
    });

    ghost = new GhostGuard({ store, getWindow: () => win });
    capsules = new CapsuleVault({ dir: path.join(app.getPath('userData'), 'capsules'), store, getWindow: () => win });
    plugins = new PluginHost({
      dirs: [BUNDLED_PLUGINS, USER_PLUGINS],
      userData: app.getPath('userData'),
      getTabs: () => tabs,
      getWindow: () => win,
      store,
      capsules,
      ghost,
      focusState: () => ({ until: state.focusUntil, active: state.focusUntil > Date.now() }),
      startFocus: (minutes) => {
        state.focusUntil = Date.now() + Number(minutes) * 60000;
        plugins?.emit('focus:started', { minutes: Number(minutes), until: state.focusUntil });
        return { until: state.focusUntil };
      },
      stopFocus: () => {
        state.focusUntil = 0;
        plugins?.emit('focus:stopped', {});
        return { until: 0 };
      }
    });

    wireIpc();
    createWindow();
    plugins.loadAll().then(() => {
      tabs?.send('plugins:changed', plugins.list());
    });

    if (process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' });

    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', () => { try { plugins?.dispose(); } catch { /* noop */ } });
}
