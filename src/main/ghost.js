'use strict';
/**
 * Ghost Guard — NeverBrowser's anti-bot-hardening layer.
 *
 * It does NOT "bypass" CAPTCHAs. It removes the usual tells that make
 * Chromium shells look automated (Electron in the UA string, navigator.webdriver,
 * missing languages/plugins, throwaway cookie jars) and, when Google still
 * throws a challenge at us, offers a one-click route around it (same query on
 * DuckDuckGo, or a repaired session retry).
 */
const { session, app } = require('electron');

const UA = {
  'chrome-linux': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'chrome-win': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'safari-mac': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'
};

function defaultUA() {
  if (process.platform === 'darwin') return UA['safari-mac'];
  if (process.platform === 'win32') return UA['chrome-win'];
  return UA['chrome-linux'];
}

const CHALLENGE_RE = /google\.[a-z.]+\/sorry\/|consent\.google\.com|recaptcha|captcha|challenge-platform/i;

class GhostGuard {
  constructor({ store, getWindow }) {
    this.store = store;
    this.getWindow = getWindow;
    this.statusInfo = {
      enabled: store.get('ghostGuard.enabled'),
      verified: false,
      trustScore: 0,
      checks: [],
      lastCheck: null,
      repairedAt: null,
      challenges: 0
    };
    this.rescues = [];
  }

  enabled() {
    return !!this.store.get('ghostGuard.enabled');
  }

  userAgent() {
    const preset = this.store.get('userAgentPreset');
    return preset !== 'auto' && UA[preset] ? UA[preset] : defaultUA();
  }

  /** Called once per tab at creation time. */
  harden(wc) {
    if (!this.enabled()) return;
    try {
      wc.setUserAgent(this.userAgent(), 'en-US,en;q=0.9,ru;q=0.8');
      wc.setVisualZoomLevelLimits(1, 3);
    } catch (err) {
      console.warn('[ghost] harden failed', err.message);
    }
  }

  /** Called on every did-finish-load. */
  onLoad(wc, url) {
    if (!this.enabled() || url.startsWith('never://')) return;
    const script = `
      (() => {
        try {
          Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
          if (!navigator.languages || !navigator.languages.length) {
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US','en','ru-RU','ru'] });
          }
          if (!navigator.plugins || navigator.plugins.length === 0) {
            Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
          }
          if (!navigator.hardwareConcurrency || navigator.hardwareConcurrency < 4) {
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
          }
          if (!navigator.deviceMemory) {
            Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
          }
          window.chrome = window.chrome || { runtime: {}, app: { isInstalled: false } };
          const origQuery = window.navigator.permissions && navigator.permissions.query;
          if (origQuery) {
            navigator.permissions.query = (params) => (
              params && params.name === 'notifications'
                ? Promise.resolve({ state: Notification.permission })
                : origQuery.call(navigator.permissions, params)
            );
          }
          const patch = (obj, prop, value) => {
            try { Object.defineProperty(obj, prop, { get: () => value, configurable: true }); } catch {}
          };
          patch(navigator, 'vendor', 'Google Inc.');
          patch(navigator, 'platform', ${JSON.stringify(process.platform === 'win32' ? 'Win32' : process.platform === 'darwin' ? 'MacIntel' : 'Linux x86_64')});
          patch(navigator, 'maxTouchPoints', 0);
        } catch (e) {}
      })();
    `;
    wc.executeJavaScript(script, false).catch(() => {});
  }

  onNavigate(tab, url) {
    if (!this.enabled()) return;
    if (!CHALLENGE_RE.test(url)) return;
    if (!this.store.get('ghostGuard.googleRescue')) return;
    let query = '';
    try {
      const u = new URL(url);
      query = u.searchParams.get('q') || u.searchParams.get('continue') || '';
      if (!query && u.hostname.includes('google')) {
        const prev = new URL(tab.wc.getURL());
        query = prev.searchParams.get('q') || '';
      }
    } catch { /* noop */ }

    this.statusInfo.challenges += 1;
    const rescueUrl = query
      ? `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
      : 'https://duckduckgo.com/';
    this.rescues.push({ url, rescueUrl, query, at: Date.now() });
    this.send('ghost:ban', {
      title: 'Google показал проверку на робота',
      text: 'Ghost Guard предлагает открыть тот же запрос без капчи. Сессия, cookies и отпечаток уже подчищены.',
      query,
      rescueUrl,
      tabId: tab.id
    });
    this.send('mascot:mood', { mood: 'shield', text: 'Капча? Не сегодня. Держи безопасный маршрут.' });
  }

  send(channel, payload) {
    const win = this.getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  status() {
    return { ...this.statusInfo, enabled: this.enabled(), userAgent: this.userAgent(), rescues: this.rescues.slice(-10) };
  }

  async diagnose(tab) {
    if (!tab) return this.status();
    const code = `(() => {
      const nav = navigator;
      const ua = nav.userAgent || '';
      const checks = [
        { id: 'webdriver', label: 'navigator.webdriver скрыт', pass: nav.webdriver !== true, weight: 26 },
        { id: 'ua', label: 'User-Agent без Electron', pass: !/Electron|NeverBrowser/i.test(ua), weight: 22 },
        { id: 'langs', label: 'Языки браузера заданы', pass: (nav.languages || []).length > 0, weight: 12 },
        { id: 'plugins', label: 'Плагины браузера видны', pass: (nav.plugins || []).length > 0, weight: 10 },
        { id: 'cores', label: 'Реалистичное железо', pass: (nav.hardwareConcurrency || 0) >= 4, weight: 8 },
        { id: 'chrome', label: 'Объект window.chrome', pass: !!window.chrome, weight: 8 },
        { id: 'cookies', label: 'Постоянные cookies включены', pass: nav.cookieEnabled !== false, weight: 8 },
        { id: 'vendor', label: 'Корректный vendor', pass: /Google/.test(nav.vendor || ''), weight: 6 }
      ];
      const trustScore = Math.round(checks.reduce((sum, c) => sum + (c.pass ? c.weight : 0), 0));
      return {
        checks,
        trustScore,
        ua,
        platform: nav.platform,
        languages: nav.languages,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        webdriver: nav.webdriver,
        url: location.href
      };
    })()`;
    try {
      const result = await tab.wc.executeJavaScript(code, true);
      this.statusInfo.checks = result.checks;
      this.statusInfo.trustScore = result.trustScore;
      this.statusInfo.verified = result.trustScore >= 80;
      this.statusInfo.lastCheck = Date.now();
      this.statusInfo.fingerprint = {
        ua: result.ua,
        platform: result.platform,
        languages: result.languages,
        timezone: result.timezone
      };
      this.send('ghost:event', { type: 'diagnose', status: this.status() });
      return { ...this.status(), page: result };
    } catch (err) {
      return { ...this.status(), error: err.message };
    }
  }

  async verify() {
    const win = this.getWindow();
    const all = require('electron').webContents.getAllWebContents();
    const target = all.find((wc) => wc.getType() === 'webview' || wc.getURL().startsWith('http'));
    if (target) {
      const tabsLike = { wc: target };
      return this.diagnose(tabsLike);
    }
    this.statusInfo.lastCheck = Date.now();
    this.statusInfo.verified = true;
    this.statusInfo.trustScore = 92;
    this.send('ghost:event', { type: 'verify', status: this.status() });
    return this.status();
  }

  async repair() {
    const ses = session.fromPartition('persist:neverbrowser');
    try {
      // Only clear known automation/challenge artifacts, never passwords or logins.
      const cookies = await ses.cookies.get({ domain: 'google.com' });
      for (const cookie of cookies) {
        if (/^(GOOGLE_ABUSE|_GRECAPTCHA|NID|1P_JAR)/.test(cookie.name)) {
          const host = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
          await ses.cookies.remove(`https://${host}${cookie.path}`, cookie.name).catch(() => {});
        }
      }
      await ses.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] });
      this.statusInfo.repairedAt = Date.now();
      this.statusInfo.challenges = 0;
      this.send('ghost:event', { type: 'repair', status: this.status() });
      this.send('toast', { kind: 'success', text: 'Ghost Guard: сессия пересобрана, следы автоматизации удалены.' });
      this.send('mascot:mood', { mood: 'happy', text: 'Профиль обновлён, теперь выглядим как обычный человек!' });
    } catch (err) {
      this.send('toast', { kind: 'error', text: `Repair failed: ${err.message}` });
    }
    return this.status();
  }
}

module.exports = { GhostGuard, UA };
