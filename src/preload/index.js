// Preload bridge: whitelisted IPC surface for the chrome.

'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const SEND_CHANNELS = new Set([
  'tabs:changed',
  'nav:changed',
  'tab:error',
  'settings:changed',
  'plugins:changed',
  'plugin:panel:event',
  'capsule:changed',
  'ghost:event',
  'ghost:ban',
  'mascot:mood',
  'toast',
  'focus:tick',
  'window:state',
  'command:run',
  'download:event',
  'plugin:open-panel',
  'plugin:theme'
]);

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('nb', {
  isElectron: true,
  platform: process.platform,

  on(channel, listener) {
    if (!SEND_CHANNELS.has(channel)) return () => {};
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },

  appInfo: () => invoke('app:info'),
  settings: {
    get: () => invoke('settings:get'),
    patch: (patch) => invoke('settings:patch', patch),
    reset: () => invoke('settings:reset')
  },
  tabs: {
    list: () => invoke('tabs:list'),
    create: (url) => invoke('tabs:new', url),
    close: (id) => invoke('tabs:close', id),
    activate: (id) => invoke('tabs:activate', id),
    navigate: (id, url) => invoke('tabs:navigate', id, url),
    back: (id) => invoke('tabs:back', id),
    forward: (id) => invoke('tabs:forward', id),
    reload: (id, hard) => invoke('tabs:reload', id, hard),
    stop: (id) => invoke('tabs:stop', id),
    mute: (id, muted) => invoke('tabs:mute', id, muted),
    split: (id) => invoke('tabs:split', id),
    reorder: (order) => invoke('tabs:reorder', order),
    zoom: (factor) => invoke('tabs:zoom', factor)
  },
  layout: (patch) => invoke('layout:set', patch),
  window: {
    minimize: () => invoke('window:minimize'),
    toggleMaximize: () => invoke('window:toggleMaximize'),
    close: () => invoke('window:close'),
    isMaximized: () => invoke('window:isMaximized')
  },
  shell: {
    openExternal: (url) => invoke('shell:openExternal', url),
    openPluginsDir: () => invoke('shell:openPluginsDir'),
    openDocs: () => invoke('shell:openDocs')
  },
  plugins: {
    list: () => invoke('plugins:list'),
    setEnabled: (id, enabled) => invoke('plugins:setEnabled', id, enabled),
    command: (id, commandId, args) => invoke('plugins:command', id, commandId, args),
    panel: (pluginId, panelId) => invoke('plugins:panel', pluginId, panelId),
    panelMessage: (pluginId, payload) => invoke('plugins:panelMessage', pluginId, payload),
    reload: () => invoke('plugins:reload')
  },
  capsules: {
    list: (q) => invoke('capsule:list', q),
    capture: () => invoke('capsule:capture'),
    open: (id) => invoke('capsule:open', id),
    remove: (id) => invoke('capsule:remove', id)
  },
  ghost: {
    status: () => invoke('ghost:status'),
    verify: () => invoke('ghost:verify'),
    diagnose: () => invoke('ghost:diagnose'),
    repair: () => invoke('ghost:repair')
  },
  focus: {
    start: (minutes) => invoke('focus:start', minutes),
    stop: () => invoke('focus:stop'),
    status: () => invoke('focus:status')
  },
  page: {
    execute: (id, code) => invoke('page:execute', id, code)
  }
});
