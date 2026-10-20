// NeverBrowser plugin host: manifests, sandbox, API, panels, commands.

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const API_VERSION = 1;
const PERMISSIONS = new Set([
  'tabs', 'tabs.script', 'storage', 'ui', 'commands', 'notifications',
  'network', 'content-scripts', 'navigation', 'theme', 'capsules',
  'settings', 'clipboard', 'focus', 'mascot'
]);

const KNOWN_EVENTS = new Set([
  'tab:created', 'tab:closed', 'tab:activated', 'tab:navigated',
  'focus:started', 'focus:stopped', 'ghost:challenge', 'capsule:captured',
  'settings:changed', 'plugin:ready'
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function checkManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') return ['manifest.json must be an object'];
  if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(manifest.id || '')) errors.push('id must be kebab-case (2-49 chars, a-z0-9-)');
  if (!manifest.name) errors.push('name is required');
  if (!/^\d+\.\d+\.\d+/.test(manifest.version || '')) errors.push('version must be semver (x.y.z)');
  if (!manifest.main) errors.push('main is required');
  if (manifest.apiVersion && manifest.apiVersion > API_VERSION) errors.push(`apiVersion ${manifest.apiVersion} is newer than host ${API_VERSION}`);
  for (const perm of manifest.permissions || []) {
    if (!PERMISSIONS.has(perm)) errors.push(`unknown permission "${perm}"`);
  }
  return errors;
}

function globToRegex(glob) {
  if (glob === '<all_urls>') return /^https?:\/\//;
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

function hostAllowed(host, allowlist) {
  if (!allowlist || allowlist.length === 0) return false;
  return allowlist.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

class PluginHost {
  constructor({ dirs, userData, getTabs, getWindow, store, capsules, ghost, focusState, startFocus, stopFocus }) {
    this.dirs = dirs;
    this.focusState = focusState;
    this.startFocus = startFocus;
    this.stopFocus = stopFocus;
    this.userData = userData;
    this.getTabs = getTabs;
    this.getWindow = getWindow;
    this.store = store;
    this.capsules = capsules;
    this.ghost = ghost;
    this.plugins = new Map();
    this.panels = new Map();
    this.commands = new Map();
    this.contentScripts = [];
    this.navFilters = [];
    this.listeners = [];
    this.panelHandlers = new Map();
    this.stateFile = path.join(userData, 'plugins-state.json');
    this.storageDir = path.join(userData, 'plugin-storage');
    fs.mkdirSync(this.storageDir, { recursive: true });
    try { this.state = readJson(this.stateFile); } catch { this.state = { disabled: [] }; }
    if (!Array.isArray(this.state.disabled)) this.state.disabled = [];
    this.extensionDirs = dirs;
  }

  findPlugins() {
    const found = [];
    for (const root of this.dirs) {
      if (!fs.existsSync(root)) continue;
      const entries = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory());
      for (const entry of entries) {
        const dir = path.join(root, entry.name);
        const manifestFile = path.join(dir, 'manifest.json');
        if (!fs.existsSync(manifestFile)) continue;
        try {
          const manifest = readJson(manifestFile);
          found.push({ dir, manifest, root });
        } catch (err) {
          console.error(`[plugins] bad manifest in ${dir}:`, err.message);
        }
      }
    }
    return found;
  }

  async loadAll() {
    this.dispose();
    this.plugins.clear();
    const seen = new Set();
    for (const { dir, manifest, root } of this.findPlugins()) {
      if (seen.has(manifest.id)) continue;
      seen.add(manifest.id);
      const errors = checkManifest(manifest);
      const builtin = root === this.dirs[0];
      const record = {
        dir, manifest, builtin,
        id: manifest.id || 'invalid',
        name: manifest.name || 'Unnamed plugin',
        version: manifest.version || '0.0.0',
        description: manifest.description || '',
        author: manifest.author || 'unknown',
        homepage: manifest.homepage || '',
        permissions: manifest.permissions || [],
        contributes: manifest.contributes || {},
        status: 'loaded',
        error: errors.length ? errors.join('; ') : null,
        panels: [], commands: [], activation: null
      };
      if (errors.length) {
        record.status = 'error';
        this.plugins.set(record.id, record);
        continue;
      }
      if (this.state.disabled.includes(record.id)) {
        record.status = 'disabled';
        this.plugins.set(record.id, record);
        continue;
      }
      this.plugins.set(record.id, record);
      await this.activate(record);
    }
    this.send('plugins:changed', this.list());
    return this.list();
  }

  async activate(record) {
    const { manifest, dir, id } = record;
    const mainFile = path.join(dir, manifest.main);
    if (!mainFile.startsWith(dir) || !fs.existsSync(mainFile)) {
      record.status = 'error';
      record.error = `entry file not found: ${manifest.main}`;
      return;
    }
    const permissionSet = new Set(manifest.permissions || []);
    const api = this.createApi(record, permissionSet);
    const timers = new Set();
    const intervals = new Set();
    const scopedConsole = {
      log: (...a) => console.log(`[${id}]`, ...a),
      info: (...a) => console.info(`[${id}]`, ...a),
      warn: (...a) => console.warn(`[${id}]`, ...a),
      error: (...a) => console.error(`[${id}]`, ...a)
    };
    const trackedTimeout = (fn, ms, ...args) => {
      const handle = setTimeout(() => { timers.delete(handle); fn(...args); }, Math.min(ms, 2 ** 31 - 1));
      timers.add(handle);
      return handle;
    };
    const trackedInterval = (fn, ms, ...args) => {
      const handle = setInterval(fn, Math.max(50, ms));
      intervals.add(handle);
      return handle;
    };

    const sandbox = {
      console: scopedConsole,
      setTimeout: trackedTimeout,
      clearTimeout: (h) => { timers.delete(h); clearTimeout(h); },
      setInterval: trackedInterval,
      clearInterval: (h) => { intervals.delete(h); clearInterval(h); },
      URL, URLSearchParams, TextEncoder, TextDecoder,
      structuredClone,
      queueMicrotask
    };

    try {
      const code = fs.readFileSync(mainFile, 'utf8');
      const context = vm.createContext(sandbox);
      const wrapper = new vm.Script(
        `(function (module, exports, api) {\n"use strict";\n${code}\n})`,
        { filename: mainFile }
      ).runInContext(context, { timeout: 5000 });
      const module = { exports: {} };
      const ret = wrapper(module, module.exports, api);
      if (ret && typeof ret.then === 'function') await ret;
      const definition = module.exports && module.exports.activate ? module.exports : null;
      if (!definition) {
        if (typeof module.exports === 'function') await module.exports(api);
        else if (!record.commands.length && !record.panels.length) throw new Error('module.exports.activate(api) is required');
      } else {
        await definition.activate(api);
        record.definition = definition;
      }
      record.status = 'active';
      record.activation = { timers, intervals, context };
      record.error = null;
      this.emit('plugin:ready', { id, name: manifest.name });
      console.log(`[plugins] activated ${id}@${manifest.version}`);
    } catch (err) {
      record.status = 'error';
      record.error = err.message;
      console.error(`[plugins] failed to activate ${id}:`, err);
      this.cleanup(record);
    }
  }

  cleanup(record) {
    if (!record.activation) return;
    for (const t of record.activation.timers) clearTimeout(t);
    for (const i of record.activation.intervals) clearInterval(i);
    record.activation = null;
    try {
      if (record.definition && typeof record.definition.deactivate === 'function') {
        record.definition.deactivate();
      }
    } catch (err) {
      console.error(`[plugins] deactivate ${record.id} failed`, err);
    }
  }

  dispose() {
    for (const record of this.plugins.values()) this.cleanup(record);
    this.panels.clear();
    this.commands.clear();
    this.contentScripts = [];
    this.navFilters = [];
    this.listeners = [];
    this.panelHandlers.clear();
  }

  async reload() {
    await this.loadAll();
    this.send('toast', { kind: 'success', text: 'Плагины перезагружены.' });
    return this.list();
  }

  async setEnabled(id, enabled) {
    const record = this.plugins.get(id);
    if (!record) return false;
    const disabled = new Set(this.state.disabled);
    if (enabled) disabled.delete(id); else disabled.add(id);
    this.state.disabled = [...disabled];
    fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));

    if (enabled) {
      record.status = 'loaded';
      await this.activate(record);
    } else {
      this.cleanup(record);
      this.unregisterPlugin(id);
      record.status = 'disabled';
    }
    this.send('plugins:changed', this.list());
    this.send('mascot:mood', { mood: enabled ? 'happy' : 'idle', text: enabled ? `${record.name} проснулся.` : `${record.name} отдыхает.` });
    return true;
  }

  unregisterPlugin(id) {
    for (const key of [...this.panels.keys()]) if (key.startsWith(`${id}::`)) this.panels.delete(key);
    for (const key of [...this.commands.keys()]) if (key.startsWith(`${id}::`)) this.commands.delete(key);
    for (const key of [...this.panelHandlers.keys()]) if (key.startsWith(`${id}::`)) this.panelHandlers.delete(key);
    this.contentScripts = this.contentScripts.filter((s) => s.pluginId !== id);
    this.navFilters = this.navFilters.filter((f) => f.pluginId !== id);
    this.listeners = this.listeners.filter((l) => l.pluginId !== id);
  }

  createApi(record, perms) {
    const host = this;
    const id = record.id;
    const require = (perm) => {
      if (!perms.has(perm)) {
        const err = new Error(`Permission denied: "${perm}" is not declared in manifest.permissions (plugin ${id})`);
        err.code = 'ENOPERM';
        throw err;
      }
    };
    const storageFile = path.join(this.storageDir, `${id}.json`);
    let storageCache = null;
    const storage = () => {
      if (!storageCache) {
        try { storageCache = readJson(storageFile); } catch { storageCache = {}; }
      }
      return storageCache;
    };
    const saveStorage = () => {
      fs.mkdirSync(this.storageDir, { recursive: true });
      fs.writeFileSync(storageFile, JSON.stringify(storage(), null, 2));
    };
    const track = (event, fn) => {
      if (typeof fn !== 'function') return () => {};
      const entry = { pluginId: id, event, fn };
      host.listeners.push(entry);
      return () => { host.listeners = host.listeners.filter((l) => l !== entry); };
    };

    const api = {
      apiVersion: API_VERSION,
      plugin: {
        id, version: record.manifest.version, dir: record.dir, builtin: record.builtin,
        getDataDir: () => record.dir
      },

      storage: {
        get: (key, fallback) => {
          require('storage');
          const data = storage();
          return key in data ? data[key] : fallback;
        },
        set: (key, value) => { require('storage'); storage()[key] = value; saveStorage(); return value; },
        delete: (key) => { require('storage'); delete storage()[key]; saveStorage(); },
        all: () => { require('storage'); return { ...storage() }; },
        clear: () => { require('storage'); storageCache = {}; saveStorage(); }
      },

      settings: {
        get: (key) => { require('settings'); return host.store.get(`plugins.${id}.${key}`); },
        getAll: () => { require('settings'); return host.store.get(`plugins.${id}`) || {}; },
        set: (key, value) => {
          require('settings');
          host.store.patch({ plugins: { [id]: { [key]: value } } });
          return value;
        }
      },

      tabs: {
        list: () => { require('tabs'); return host.getTabs().list(); },
        active: () => { require('tabs'); return host.getTabs().active()?.id || null; },
        create: (url) => { require('tabs'); return host.getTabs().create({ url }); },
        close: (tabId) => { require('tabs'); return host.getTabs().close(tabId); },
        activate: (tabId) => { require('tabs'); return host.getTabs().activate(tabId); },
        navigate: (tabId, url) => { require('tabs'); return host.getTabs().navigate(tabId, url); },
        execute: async (tabId, code) => {
          require('tabs.script');
          const tab = host.getTabs().tabs.get(tabId || host.getTabs().activeId);
          if (!tab) throw new Error('tab not found');
          return tab.wc.executeJavaScript(String(code), true);
        },
        onNavigate: (fn) => { require('tabs'); return track('tab:navigated', fn); }
      },

      ui: {
        registerPanel: ({ id: panelId, title, icon, html, width, height }) => {
          require('ui');
          if (!/^[a-z0-9-]+$/.test(panelId || '')) throw new Error('panel id must be kebab-case');
          const key = `${id}::${panelId}`;
          host.panels.set(key, {
            pluginId: id, pluginName: record.name, panelId, title: title || panelId,
            icon: icon || '◇', html: String(html || '<p>Empty panel</p>'),
            width: Math.min(900, Math.max(280, width || 360)),
            height: Math.min(800, Math.max(200, height || 520))
          });
          record.panels.push(panelId);
          return () => host.panels.delete(key);
        },
        registerCommand: ({ id: commandId, title, description, shortcut, run }) => {
          require('commands');
          if (!/^[a-z0-9-]+$/i.test(commandId || '')) throw new Error('command id must be alphanumeric/kebab');
          const key = `${id}::${commandId}`;
          host.commands.set(key, { pluginId: id, pluginName: record.name, id: commandId, title, description: description || '', shortcut: shortcut || null, run });
          record.commands.push(commandId);
          return () => host.commands.delete(key);
        },
        notify: (message, kind = 'info') => {
          require('notifications');
          host.send('toast', { kind, text: String(message) });
        },
        addStatusItem: ({ id: itemId, text, title, onClick }) => {
          require('ui');
          host.send('plugins:changed', host.list());
          return { id: itemId, text, title, onClick };
        },
        postToPanel: (panelId, data) => {
          require('ui');
          host.send('plugin:panel:event', { pluginId: id, panelId, data });
        },
        onPanelMessage: (panelId, handler) => {
          require('ui');
          host.panelHandlers.set(`${id}::${panelId}`, handler);
          return () => host.panelHandlers.delete(`${id}::${panelId}`);
        },
        openPanel: (panelId) => {
          require('ui');
          host.send('plugin:open-panel', { pluginId: id, panelId });
        },
        setTheme: (vars) => {
          require('theme');
          host.send('plugin:theme', { pluginId: id, vars });
        },
        clearTheme: () => {
          require('theme');
          host.send('plugin:theme', { pluginId: id, vars: null });
        },
        setMascotMood: (mood, text) => {
          require('mascot');
          host.send('mascot:mood', { mood, text });
        }
      },

      commands: {
        register: (command) => {
          require('commands');
          const key = `${id}::${command.id}`;
          host.commands.set(key, { pluginId: id, pluginName: record.name, description: '', ...command });
          record.commands.push(command.id);
          return () => host.commands.delete(key);
        },
        execute: (commandId) => host.runCommand(id, commandId)
      },

      net: {
        fetch: async (url, options = {}) => {
          require('network');
          const parsed = new URL(url);
          if (!/^https?:$/.test(parsed.protocol)) throw new Error('only http(s) URLs are allowed');
          if (!hostAllowed(parsed.hostname, record.manifest.allowedHosts)) {
            throw new Error(`host not in manifest.allowedHosts: ${parsed.hostname}`);
          }
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), Math.min(options.timeout || 10000, 30000));
          try {
            const res = await fetch(url, {
              method: options.method || 'GET',
              headers: options.headers,
              body: options.body,
              signal: controller.signal
            });
            const body = await res.text();
            return {
              ok: res.ok,
              status: res.status,
              headers: Object.fromEntries(res.headers.entries()),
              body
            };
          } finally {
            clearTimeout(timeout);
          }
        }
      },

      contentScripts: {
        register: ({ id: scriptId, matches, js, css, runAt }) => {
          require('content-scripts');
          if (!Array.isArray(matches) || matches.length === 0) throw new Error('matches[] is required');
          const entry = {
            pluginId: id, id: scriptId || `cs-${this.contentScripts.length}`,
            regexes: matches.map(globToRegex), js: js || null, css: css || null, runAt: runAt || 'document-idle'
          };
          this.contentScripts.push(entry);
        }
      },

      navigation: {
        registerFilter: (name, fn) => {
          require('navigation');
          if (typeof fn !== 'function') throw new Error('filter must be a function(url) -> reason|null');
          this.navFilters.push({ pluginId: id, pluginName: record.name, name, fn });
          return () => { this.navFilters = this.navFilters.filter((f) => f.fn !== fn); };
        }
      },

      capsules: {
        list: (query) => { require('capsules'); return host.capsules.list(query); },
        capture: async () => { require('capsules'); const t = host.getTabs().active(); return host.capsules.capture(t, true); },
        open: (capsuleId) => { require('capsules'); return host.capsules.open(capsuleId, host.getTabs()); },
        remove: (capsuleId) => { require('capsules'); return host.capsules.remove(capsuleId); }
      },

      ghost: {
        status: () => { require('ghost'); return host.ghost?.status(); },
        diagnose: () => { require('ghost'); return host.ghost?.diagnose(host.getTabs().active()); },
        repair: () => { require('ghost'); return host.ghost?.repair(); }
      },

      focus: {
        status: () => ({ until: 0, ...(host.focusState ? host.focusState() : {}) }),
        start: (minutes) => { require('focus'); return host.startFocus?.(minutes); },
        stop: () => { require('focus'); return host.stopFocus?.(); },
        onChange: (fn) => track('focus:started', fn)
      },

      clipboard: {
        write: (text) => {
          require('clipboard');
          const { clipboard } = require('electron');
          clipboard.writeText(String(text));
        }
      },

      events: {
        on: (event, fn) => {
          if (!KNOWN_EVENTS.has(event)) throw new Error(`unknown event: ${event}`);
          return track(event, fn);
        },
        emit: (event, payload) => host.emit(`plugin:${id}:${event}`, payload)
      },

      log: {
        log: (...a) => console.log(`[${id}]`, ...a),
        info: (...a) => console.info(`[${id}]`, ...a),
        warn: (...a) => console.warn(`[${id}]`, ...a),
        error: (...a) => console.error(`[${id}]`, ...a)
      }
    };

    api.mascot = {
      setMood: (mood, text) => {
        require('mascot');
        host.send('mascot:mood', { mood, text });
      },
      say: (text) => {
        require('mascot');
        host.send('mascot:mood', { mood: 'happy', text });
      }
    };

    Object.freeze(api.plugin);
    return api;
  }

  emit(event, payload) {
    for (const listener of [...this.listeners]) {
      if (listener.event !== event) continue;
      try {
        listener.fn(payload);
      } catch (err) {
        console.error(`[plugins] ${listener.pluginId} handler for ${event} threw:`, err.message);
      }
    }
    for (const listener of [...this.listeners]) {
      if (listener.event !== `plugin:*`) continue;
      try { listener.fn({ event, payload }); } catch {  }
    }
  }

  filterNavigation(url) {
    for (const filter of this.navFilters) {
      try {
        const reason = filter.fn(url);
        if (reason) return `${filter.pluginName}: ${reason}`;
      } catch (err) {
        console.error(`[plugins] nav filter ${filter.pluginId} failed:`, err.message);
      }
    }
    return null;
  }

  runContentScripts(wc, url) {
    for (const script of this.contentScripts) {
      if (!script.regexes.some((re) => re.test(url))) continue;
      if (script.css) wc.insertCSS(script.css).catch(() => {});
      if (script.js) {
        wc.executeJavaScript(`(() => { try { ${script.js} } catch (e) { console.warn('[NeverBrowser content script]', e); } })()`, true).catch(() => {});
      }
    }
  }

  async runCommand(pluginId, commandId, args) {
    const key = `${pluginId}::${commandId}`;
    const command = this.commands.get(key);
    if (!command) throw new Error(`unknown command ${key}`);
    try {
      const result = await command.run(args);
      return { ok: true, result: result ?? null };
    } catch (err) {
      console.error(`[plugins] command ${key} failed`, err);
      this.send('toast', { kind: 'error', text: `${command.pluginName}: ${err.message}` });
      return { ok: false, error: err.message };
    }
  }

  getPanel(pluginId, panelId) {
    const panel = this.panels.get(`${pluginId}::${panelId}`);
    return panel ? { ...panel } : null;
  }

  panelMessage(pluginId, payload) {
    if (!payload || !payload.panelId) return;
    const handler = this.panelHandlers.get(`${pluginId}::${payload.panelId}`);
    if (handler) {
      try { handler(payload.data, payload.panelId); } catch (err) {
        console.error(`[plugins] panel handler ${pluginId}/${payload.panelId} failed`, err);
      }
    }
  }

  list() {
    return [...this.plugins.values()].map((p) => ({
      id: p.id, name: p.name, version: p.version, description: p.description,
      author: p.author, homepage: p.homepage, permissions: p.permissions,
      contributes: p.contributes, status: p.status, error: p.error,
      builtin: p.builtin,
      panels: p.panels.map((panelId) => {
        const panel = this.panels.get(`${p.id}::${panelId}`);
        return panel ? { id: panel.panelId, title: panel.title, icon: panel.icon, width: panel.width, height: panel.height } : null;
      }).filter(Boolean),
      commands: p.commands.map((cmdId) => {
        const cmd = this.commands.get(`${p.id}::${cmdId}`);
        return cmd ? { id: cmd.id, title: cmd.title, description: cmd.description, shortcut: cmd.shortcut } : null;
      }).filter(Boolean)
    }));
  }

  send(channel, payload) {
    const win = this.getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

module.exports = { PluginHost, PERMISSIONS, checkManifest };
