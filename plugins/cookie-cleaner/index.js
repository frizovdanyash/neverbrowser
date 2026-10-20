/**
 * Cookie Cleaner — content script that hides consent banners.
 * Demonstrates: contentScripts.register (css + js), match patterns.
 */
module.exports = {
  activate(api) {
    api.contentScripts.register({
      id: 'hide-consent',
      matches: ['<all_urls>'],
      runAt: 'document-end',
      css: `
        [class*="cookie-consent"], [id*="cookie-consent"],
        [class*="cookie-banner"], [id*="cookie-banner"],
        [class*="cookieNotice"], [class*="cookie-notice"],
        [class*="consent-banner"], [class*="consentBanner"],
        [aria-label*="cookie" i], [aria-label*="consent" i],
        #onetrust-banner-sdk, #CybotCookiebotDialog, .cc-window, .fc-consent-root {
          display: none !important;
          visibility: hidden !important;
          height: 0 !important;
        }
        html, body { overflow: auto !important; }
      `,
      js: `
        const nuke = () => {
          document.querySelectorAll('[class*="cookie" i], [id*="cookie" i], [class*="consent" i]').forEach((el) => {
            const txt = (el.textContent || '').toLowerCase();
            if (/(cookie|consent|gdpr|privacy)/.test(txt) && /(accept|agree|принять|соглас)/.test(txt)) {
              el.remove();
            }
          });
        };
        nuke();
        new MutationObserver(nuke).observe(document.documentElement, { childList: true, subtree: true });
      `
    });

    api.ui.registerCommand({
      id: 'explain',
      title: 'Cookie Cleaner: как это работает',
      run: () => {
        api.ui.notify('Cookie Cleaner прячет баннеры согласия. Cookies сайта не удаляются — за это отвечает Ghost Guard.', 'info');
      }
    });
  }
};
