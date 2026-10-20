// Reading Mode — clean reader view.
const READER = String.raw`
(() => {
  const ID = 'nb-reader-style';
  const existing = document.getElementById(ID);
  if (existing) {
    existing.remove();
    document.body.style.maxWidth = '';
    document.body.style.margin = '';
    return { enabled: false };
  }
  const style = document.createElement('style');
  style.id = ID;
  style.textContent = \`
    body { background: #f8f3ec !important; color: #241c16 !important; }
    body * { background: transparent !important; color: inherit !important; font-family: Georgia, 'Times New Roman', serif !important; }
    body { max-width: 720px !important; margin: 40px auto !important; padding: 0 20px !important; font-size: 19px !important; line-height: 1.75 !important; }
    header, nav, aside, footer, [role="banner"], [role="navigation"], [role="complementary"],
    .ad, .ads, .advert, [class*="cookie"], [class*="banner"], [class*="popup"], [id*="subscribe"] { display: none !important; }
    img, video, figure { max-width: 100% !important; height: auto !important; }
    a { color: #b4542a !important; text-decoration: underline !important; }
    h1, h2, h3 { font-family: Inter, system-ui, sans-serif !important; line-height: 1.25 !important; }
    pre, code { font-family: ui-monospace, monospace !important; background: #efe6da !important; }
  \`;
  document.head.appendChild(style);
  const article = document.querySelector('article, main, [role="main"]');
  if (article) {
    const clone = article.cloneNode(true);
    document.body.innerHTML = '';
    document.body.appendChild(style);
    document.body.appendChild(clone);
  }
  return { enabled: true, article: !!article };
})()
`;

module.exports = {
  activate(api) {
    api.ui.registerCommand({
      id: 'toggle',
      title: 'Reading Mode: включить / выключить',
      shortcut: 'Ctrl+Shift+R',
      run: async () => {
        const result = await api.tabs.execute(null, READER);
        if (result?.enabled) {
          api.ui.notify('Reading Mode включён. Только текст, без мусора.', 'success');
          api.mascot.setMood('happy', 'Почитаем? Я убрал рекламу и баннеры.');
        } else {
          api.ui.notify('Reading Mode выключен. Обнови страницу, чтобы вернуть исходный вид.', 'info');
        }
        return result;
      }
    });

  }
};
