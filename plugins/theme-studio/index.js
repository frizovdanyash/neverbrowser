// Theme Studio — runtime theme presets.
const PRESETS = {
  'Bubblegum': { '--accent': '#ff7ab8', '--accent-2': '#c084fc', '--bg': '#140f18', '--panel': '#1c1422', '--panel-2': '#241a2c' },
  'Mint': { '--accent': '#5fe3b5', '--accent-2': '#4cc9f0', '--bg': '#0a1512', '--panel': '#10201b', '--panel-2': '#152a23' },
  'Sunset': { '--accent': '#ff9d5c', '--accent-2': '#ff5c8a', '--bg': '#170f0b', '--panel': '#211711', '--panel-2': '#2b1e16' },
  'Cyber': { '--accent': '#00ffc8', '--accent-2': '#ff00e5', '--bg': '#08080f', '--panel': '#101018', '--panel-2': '#15151f' }
};

module.exports = {
  activate(api) {
    api.ui.registerPanel({
      id: 'studio',
      title: 'Theme Studio',
      icon: '🎨',
      width: 340,
      height: 360,
      html: `<h2>Theme Studio</h2>
        <p class="muted">Пресеты меняют CSS-переменные оболочки и всех панелей. Сброс возвращает тему из настроек.</p>
        <div class="row" style="flex-wrap:wrap">
          ${Object.keys(PRESETS).map((name) => `<button data-preset="${name}">${name}</button>`).join('')}
        </div>
        <div class="row"><button id="reset">Сбросить</button></div>
        <p class="muted">Хочешь свой? Открой docs/PLUGIN-API.md → <b>api.ui.setTheme</b>.</p>
        <script>
          const api = window.nbPanel;
          document.querySelectorAll('[data-preset]').forEach((b) => b.onclick = () => api.call('preset', b.dataset.preset));
          document.getElementById('reset').onclick = () => api.call('reset');
        <\/script>`
    });

    api.ui.onPanelMessage('studio', (msg) => {
      if (msg.type === 'preset') {
        const vars = PRESETS[msg.args];
        if (!vars) return;
        api.ui.setTheme(vars);
        api.storage.set('preset', msg.args);
        api.ui.notify(`Тема «${msg.args}» применена.`, 'success');
      }
      if (msg.type === 'reset') {
        api.ui.clearTheme();
        api.storage.delete('preset');
        api.ui.notify('Тема сброшена.', 'info');
      }
    });

    api.ui.registerCommand({
      id: 'reset',
      title: 'Theme Studio: сбросить пресет',
      run: () => api.ui.clearTheme()
    });

    const saved = api.storage.get('preset');
    if (saved && PRESETS[saved]) api.ui.setTheme(PRESETS[saved]);
  }
};
