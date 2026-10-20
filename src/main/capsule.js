// Time Capsule: page snapshots, index, playback.

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_HTML = 8 * 1024 * 1024;

function esc(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

class CapsuleVault {
  constructor({ dir, store, getWindow }) {
    this.dir = dir;
    this.store = store;
    this.getWindow = getWindow;
    this.indexFile = path.join(dir, 'index.json');
    fs.mkdirSync(dir, { recursive: true });
    try {
      this.index = JSON.parse(fs.readFileSync(this.indexFile, 'utf8'));
    } catch {
      this.index = { version: 1, items: [] };
    }
  }

  saveIndex() {
    fs.writeFileSync(this.indexFile, JSON.stringify(this.index, null, 2));
  }

  send(channel, payload) {
    const win = this.getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  noteVisit() {
  }

  async capture(tab, manual = false) {
    if (!tab || !/^https?:/.test(tab.url)) return null;
    const id = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    let html = '';
    try {
      html = await tab.wc.executeJavaScript('document.documentElement.outerHTML', true);
    } catch (err) {
      if (manual) this.send('toast', { kind: 'error', text: `Не удалось снять капсулу: ${err.message}` });
      return null;
    }
    if (!html) return null;
    if (html.length > MAX_HTML) html = `${html.slice(0, MAX_HTML)}\n<!-- truncated by NeverBrowser -->`;
    const title = tab.title || tab.url;
    const capturedAt = new Date().toISOString();

    const banner = `
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap">
      <style>
        #nb-capsule-banner{position:fixed;z-index:2147483647;left:0;right:0;bottom:0;display:flex;gap:14px;align-items:center;
          padding:10px 16px;background:#12121a;color:#f5f2ff;font:13px/1.4 Inter,system-ui,sans-serif;
          box-shadow:0 -8px 30px rgba(0,0,0,.35);border-top:2px solid #ff7ab8}
        #nb-capsule-banner img{height:34px;width:auto}
        #nb-capsule-banner b{color:#ff9ecb}
        #nb-capsule-banner a{margin-left:auto;color:#101018;background:#ff9ecb;border-radius:999px;padding:6px 12px;text-decoration:none;font-weight:600}
      </style>
      <div id="nb-capsule-banner">
        <img src="data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#ff7ab8"/><text x="16" y="22" font-size="16" text-anchor="middle" font-family="sans-serif">N</text></svg>')}" alt="">
        <div><b>NeverBrowser · Time Capsule</b><br>Снимок от ${esc(capturedAt)}. Страница сохранена локально и может отличаться от оригинала.</div>
        <a href="${esc(tab.url)}" target="_blank" rel="noreferrer">Открыть оригинал</a>
      </div>`;

    const base = `<base href="${esc(tab.url)}">`;
    let doc = html;
    if (/<head[^>]*>/i.test(doc)) {
      doc = doc.replace(/<head([^>]*)>/i, `<head$1>${base}${banner}`);
    } else {
      doc = `${base}${banner}${doc}`;
    }

    const htmlFile = path.join(this.dir, `${id}.html`);
    fs.writeFileSync(htmlFile, doc, 'utf8');

    let screenshot = null;
    if (manual || this.store.get('capsule.captureScreenshots')) {
      try {
        const image = await tab.wc.capturePage();
        if (image && !image.isEmpty()) {
          const shotFile = path.join(this.dir, `${id}.png`);
          fs.writeFileSync(shotFile, image.toPNG());
          screenshot = `${id}.png`;
        }
      } catch {  }
    }

    const item = {
      id, url: tab.url, title, capturedAt, screenshot,
      size: Buffer.byteLength(doc, 'utf8'), manual
    };
    this.index.items.unshift(item);
    const max = this.store.get('capsule.maxItems') || 300;
    const overflow = this.index.items.splice(max);
    for (const old of overflow) this.removeFiles(old.id);

    this.saveIndex();
    this.send('capsule:changed', { item });
    if (manual) {
      this.send('toast', { kind: 'success', text: `Капсула сохранена: «${title.slice(0, 48)}»` });
      this.send('mascot:mood', { mood: 'happy', text: 'Снимок в кармане. Даже если сайт исчезнет — он у нас останется.' });
    }
    return item;
  }

  removeFiles(id) {
    for (const ext of ['html', 'png']) {
      try { fs.unlinkSync(path.join(this.dir, `${id}.${ext}`)); } catch {  }
    }
  }

  list(query) {
    const q = String(query || '').toLowerCase().trim();
    const items = q
      ? this.index.items.filter((i) => `${i.title} ${i.url}`.toLowerCase().includes(q))
      : this.index.items;
    return { items: items.slice(0, 500), total: this.index.items.length, dir: this.dir };
  }

  open(id, tabs) {
    const item = this.index.items.find((i) => i.id === id);
    if (!item) return null;
    const file = path.join(this.dir, `${item.id}.html`);
    if (!fs.existsSync(file)) return null;
    tabs.create({ url: `file://${file}` });
    return item;
  }

  remove(id) {
    const before = this.index.items.length;
    this.index.items = this.index.items.filter((i) => i.id !== id);
    this.removeFiles(id);
    this.saveIndex();
    this.send('capsule:changed', { removed: id });
    return before !== this.index.items.length;
  }
}

module.exports = { CapsuleVault };
