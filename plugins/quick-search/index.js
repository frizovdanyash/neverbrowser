/**
 * Quick Search — multi-engine search from a panel.
 * Demonstrates: tabs.create, capsules.list, panel messaging.
 */
module.exports = {
  activate(api) {
    const ENGINES = {
      DuckDuckGo: 'https://duckduckgo.com/?q=',
      Google: 'https://www.google.com/search?q=',
      Bing: 'https://www.bing.com/search?q=',
      Startpage: 'https://www.startpage.com/sp/search?query='
    };
    let engine = api.storage.get('engine', 'DuckDuckGo');

    api.ui.registerPanel({
      id: 'quick',
      title: 'Quick Search',
      icon: '🔎',
      width: 340,
      height: 380,
      html: `<h2>Quick Search</h2>
        <div class="row" style="flex-wrap:wrap">
          ${Object.keys(ENGINES).map((name) => `<label class="pill"><input type="radio" name="engine" value="${name}" ${name === engine ? 'checked' : ''}> ${name}</label>`).join(' ')}
        </div>
        <div class="row"><input id="q" placeholder="Запрос…" style="flex:1"><button id="go">→</button></div>
        <div class="row"><button id="newtab">Открыть в новой вкладке</button></div>
        <h3>Найдено в капсулах</h3>
        <div id="caps" class="muted">Введи запрос — я поищу и в Time Capsule.</div>
        <script>
          const api = window.nbPanel;
          const q = document.getElementById('q');
          const caps = document.getElementById('caps');
          const current = () => document.querySelector('input[name="engine"]:checked').value;
          document.getElementById('go').onclick = () => {
            api.call('search', { q: q.value, engine: current() });
            api.call('caps', q.value);
          };
          document.getElementById('newtab').onclick = () => {
            api.call('newtab', { q: q.value, engine: current() });
          };
          q.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('go').click(); });
          q.addEventListener('input', () => api.call('caps', q.value));
          window.addEventListener('nb:data', (e) => {
            const d = e.detail || {};
            if (d.type === 'caps') {
              caps.innerHTML = d.items.length
                ? d.items.map((i) => '<div class="card"><b>' + i.title + '</b><br><span class="muted">' + i.url + '</span></div>').join('')
                : '<span class="muted">Ничего не найдено в капсулах.</span>';
            }
          });
        <\/script>`
    });

    api.ui.onPanelMessage('quick', (msg) => {
      if (msg.type === 'search' && msg.args?.q) {
        api.tabs.navigate(null, ENGINES[msg.args.engine] + encodeURIComponent(msg.args.q));
      }
      if (msg.type === 'newtab' && msg.args?.q) {
        api.tabs.create(ENGINES[msg.args.engine] + encodeURIComponent(msg.args.q));
      }
      if (msg.type === 'caps') {
        const result = api.capsules.list(msg.args || '');
        api.ui.postToPanel('quick', { type: 'caps', items: result.items.slice(0, 8) });
      }
    });

    api.ui.registerCommand({
      id: 'search',
      title: 'Quick Search: открыть панель',
      run: () => api.ui.openPanel('quick')
    });
  }
};
