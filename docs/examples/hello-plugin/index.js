/**
 * Hello Plugin — шаблон для NeverBrowser.
 * Скопируй папку в <userData>/plugins/ и нажми «Перезагрузить все».
 */
module.exports = {
  activate(api) {
    let clicks = 0;

    api.ui.registerPanel({
      id: 'hello',
      title: 'Hello',
      icon: '👋',
      width: 340,
      height: 360,
      html: `<h2>Привет из плагина!</h2>
        <p class="muted">Это HTML внутри NeverBrowser. У него нет доступа к браузеру —
        только мост <code>nbPanel</code>.</p>
        <div class="card"><b id="clicks">0</b> кликов</div>
        <div class="row">
          <button id="ping">Поздороваться</button>
          <button id="theme">Сменить акцент</button>
        </div>
        <script>
          const api = window.nbPanel;
          document.getElementById('ping').onclick = () => api.call('ping');
          document.getElementById('theme').onclick = () => api.call('theme');
          window.addEventListener('nb:data', (e) => {
            const d = e.detail || {};
            if (d.type === 'clicks') document.getElementById('clicks').textContent = d.value;
          });
          api.call('clicks');
        <\/script>`
    });

    api.ui.onPanelMessage('hello', (msg) => {
      if (msg.type === 'clicks') {
        api.ui.postToPanel('hello', { type: 'clicks', value: clicks });
      }
      if (msg.type === 'ping') {
        clicks += 1;
        api.storage.set('clicks', clicks);
        api.ui.postToPanel('hello', { type: 'clicks', value: clicks });
        api.ui.notify('Привет от hello-plugin!', 'success');
        api.mascot.say('Мяу. Кнопка нажата, я доволен.');
      }
      if (msg.type === 'theme') {
        api.ui.setTheme({ '--accent': '#5fe3b5', '--accent-2': '#4cc9f0' });
        api.ui.notify('Акцент изменён на мятный.', 'info');
      }
    });

    api.ui.registerCommand({
      id: 'greet',
      title: 'Hello Plugin: поздороваться',
      description: 'Показывает тост и реплику маскота',
      run: () => {
        api.ui.notify('Привет! Это команда из палитры Ctrl+K.', 'success');
        api.mascot.say('Ты вызвал команду. Я впечатлён.');
        return 'ok';
      }
    });

    clicks = api.storage.get('clicks', 0);
  }
};
