// JSON settings store with defaults and listeners.

'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SETTINGS = {
  theme: 'midnight',
  accent: '#ff7ab8',
  custom: {
    bg: '#101018',
    panel: '#17171f',
    text: '#f5f2ff',
    accent: '#ff7ab8'
  },
  searchEngine: 'duckduckgo',
  ghostGuard: {
    enabled: true,
    humanizeTyping: true,
    stripWebdriver: true,
    realisticUserAgent: true,
    blockWebRTC: true,
    googleRescue: true
  },
  capsule: {
    autoCapture: true,
    captureScreenshots: false,
    maxItems: 300
  },
  focus: {
    duration: 25,
    blockedHosts: ['youtube.com', 'x.com', 'twitter.com', 'tiktok.com', 'reddit.com']
  },
  sidebar: { width: 264, collapsed: false },
  mascot: { enabled: true, reactions: true, name: 'BoyKisser' },
  splitRatio: 0.5,
  startup: 'start',
  userAgentPreset: 'auto'
};

function deepMerge(base, patch) {
  if (Array.isArray(base) || Array.isArray(patch)) return patch ?? base;
  if (typeof base !== 'object' || base === null) return patch ?? base;
  if (typeof patch !== 'object' || patch === null) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return out;
}

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'settings.json');
    this.listeners = new Set();
    this.data = { ...DEFAULT_SETTINGS };
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      this.data = deepMerge(DEFAULT_SETTINGS, JSON.parse(raw));
    } catch {
    }
    this.timer = null;
  }

  all() {
    return this.data;
  }

  get(key) {
    return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), this.data);
  }

  patch(patch) {
    this.data = deepMerge(this.data, patch);
    this.emit();
    return this.data;
  }

  reset() {
    this.data = structuredClone(DEFAULT_SETTINGS);
    this.emit();
    return this.data;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
      } catch (err) {
        console.error('[store] failed to save', err);
      }
    }, 120);
    for (const fn of this.listeners) fn(this.data);
  }
}

module.exports = { Store, DEFAULT_SETTINGS, deepMerge };
