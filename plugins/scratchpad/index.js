/**
 * Scratchpad — notes with autosave.
 * Demonstrates: panel <-> plugin messaging, storage, clipboard, tabs API.
 */
module.exports = {
  activate(api) {
    const save = (text) => api.storage.set('text', text);
    const load = () => api.storage.get('text', '');

    api.ui.registerPanel({
      id: 'notes',
      title: 'Scratchpad',
      icon: '📝',
      width: 360,
      height: 520,
      html: `<h2>Scratchpad</h2>
        <p class="muted">Заметки сохраняются в профиле браузера и переживают перезапуск.</p>
        <textarea id="pad" placeholder="Пиши здесь…" style="width:100%;height:260px;resize:vertical;background:#1d1d28;color:inherit;border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px;font:13px/1.5 ui-monospace,monospace;outline:none"></textarea>
        <div class="row" style="justify-content:space-between;margin-top:8px">
          <span class="muted" id="count">0 слов</span>
          <span class="muted" id="saved">сохранено</span>
        </div>
        <div class="row" style="flex-wrap:wrap">
          <button id="copy">Копировать</button>
          <button id="clear">Очистить</button>
        </div>
        <script>
          const api = window.nbPanel;
          const pad = document.getElementById('pad');
          const count = document.getElementById('count');
          const saved = document.getElementById('saved');
          let timer;
          const words = (t) => (t.trim().match(/\\S+/g) || []).length;
          const tick = () => { count.textContent = words(pad.value) + ' слов'; };
          pad.addEventListener('input', () => {
            tick();
            saved.textContent = 'печатаю…';
            clearTimeout(timer);
            timer = setTimeout(() => { api.call('save', pad.value); saved.textContent = 'сохранено'; }, 400);
          });
          document.getElementById('copy').onclick = () => api.call('copy', pad.value);
          document.getElementById('clear').onclick = () => { pad.value = ''; tick(); api.call('save', ''); };
          window.addEventListener('nb:data', (e) => {
            const d = e.detail || {};
            if (d.type === 'load') { pad.value = d.text || ''; tick(); }
            if (d.type === 'toast') saved.textContent = d.text;
          });
          api.call('load');
        <\/script>`
    });

    api.ui.onPanelMessage('notes', (msg) => {
      if (msg.type === 'load') api.ui.postToPanel('notes', { type: 'load', text: load() });
      if (msg.type === 'save') save(String(msg.args ?? ''));
      if (msg.type === 'copy') {
        api.clipboard.write(String(msg.args ?? ''));
        api.ui.postToPanel('notes', { type: 'toast', text: 'скопировано' });
      }
    });

    api.ui.registerCommand({
      id: 'clear',
      title: 'Scratchpad: очистить заметки',
      run: () => { save(''); api.ui.notify('Scratchpad очищен.', 'info'); }
    });
    api.ui.registerCommand({
      id: 'copy',
      title: 'Scratchpad: скопировать заметки',
      run: () => {
        const text = load();
        if (!text) return 'пусто';
        api.clipboard.write(text);
        api.ui.notify('Заметки в буфере обмена.', 'success');
        return 'copied';
      }
    });

    api.events.on('tab:navigated', ({ title, url }) => {
      if (!url || url.startsWith('never://')) return;
      // Optional "jot this tab" hook: plugins may append to the pad automatically.
      api.storage.set('lastSeen', { title, url, at: Date.now() });
    });
  }
};
