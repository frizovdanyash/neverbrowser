// Focus Room — deep work sessions with navigation blocking.
module.exports = {
  activate(api) {
    const DISTRACTIONS = ['youtube.com', 'youtu.be', 'tiktok.com', 'x.com', 'twitter.com', 'reddit.com', 'instagram.com', 'twitch.tv', 'vk.com/clips'];

    let until = api.storage.get('until', 0);
    let blocks = api.storage.get('blocks', 0);

    const active = () => until > Date.now();
    const remaining = () => Math.max(0, until - Date.now());

    function label() {
      if (!active()) return 'не активно';
      const m = Math.floor(remaining() / 60000);
      const s = Math.floor((remaining() % 60000) / 1000);
      return `${m}:${String(s).padStart(2, '0')}`;
    }

    api.ui.registerPanel({
      id: 'focus-panel',
      title: 'Focus Room',
      icon: '⌛',
      width: 360,
      height: 420,
      html: `<h2>Focus Room</h2>
        <p class="muted">Блокирует отвлекающие сайты, пока идёт сессия. Список можно расширить в коде плагина.</p>
        <div class="row" style="flex-wrap:wrap">
          <button data-min="15">15 мин</button>
          <button data-min="25">25 мин</button>
          <button data-min="45">45 мин</button>
          <button data-min="60">60 мин</button>
        </div>
        <div class="card"><b id="status">не активно</b><br><span class="muted">капсул заблокировано: <span id="blocks">0</span></span></div>
        <div class="row"><button id="stop">Остановить</button></div>
        <h3>Блокируются</h3>
        <div id="hosts"></div>
        <script>
          const send = window.nbPanel;
          document.querySelectorAll('[data-min]').forEach((b) => b.onclick = () => send.call('start', Number(b.dataset.min)));
          document.getElementById('stop').onclick = () => send.call('stop');
          window.addEventListener('nb:data', (e) => {
            const d = e.detail || {};
            if (d.type === 'state') {
              document.getElementById('status').textContent = d.label;
              document.getElementById('blocks').textContent = d.blocks;
              document.getElementById('hosts').innerHTML = d.hosts.map((h) => '<span class="pill">' + h + '</span>').join(' ');
            }
          });
          send.call('status');
        <\/script>`
    });

    api.ui.onPanelMessage('focus-panel', (msg) => {
      if (msg.type === 'start') start(msg.args);
      if (msg.type === 'stop') stop();
      if (msg.type === 'status') push();
    });

    function push() {
      api.ui.postToPanel('focus-panel', {
        type: 'state',
        label: active() ? `осталось ${label()}` : 'не активно',
        blocks,
        hosts: DISTRACTIONS
      });
    }

    function start(minutes) {
      until = Date.now() + minutes * 60_000;
      api.storage.set('until', until);
      api.ui.notify(`Focus Room: ${minutes} мин. Не отвлекайся.`, 'success');
      api.mascot.setMood('happy', `Сессия на ${minutes} минут. Я предупрежу, если полезешь в YouTube.`);
      push();
    }

    function stop() {
      until = 0;
      api.storage.set('until', 0);
      api.ui.notify('Focus Room завершён. Можно выдохнуть.', 'info');
      push();
    }

    api.ui.registerCommand({
      id: 'start-25',
      title: 'Focus Room: 25 минут',
      description: 'Включить классический помидор',
      run: () => start(25)
    });
    api.ui.registerCommand({ id: 'start-15', title: 'Focus Room: 15 минут', run: () => start(15) });
    api.ui.registerCommand({ id: 'start-45', title: 'Focus Room: 45 минут', run: () => start(45) });
    api.ui.registerCommand({ id: 'stop', title: 'Focus Room: остановить', run: () => stop() });

    api.navigation.registerFilter('focus-room', (url) => {
      if (!active()) return null;
      try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        if (DISTRACTIONS.some((d) => host === d || host.endsWith('.' + d))) {
          blocks += 1;
          api.storage.set('blocks', blocks);
          api.ui.notify(`Focus Room заблокировал ${host} — вернись к работе 💪`, 'warn');
          api.mascot.setMood('shield', 'Не сейчас. Таймер ещё идёт!');
          return 'включён Focus Room';
        }
      } catch {  }
      return null;
    });

    api.events.on('focus:started', (payload) => {
      until = payload.until;
      api.storage.set('until', until);
      push();
    });
    api.events.on('focus:stopped', () => {
      until = 0;
      push();
    });
    api.events.on('tab:navigated', () => push());

    const timer = setInterval(() => {
      if (until && until <= Date.now()) {
        until = 0;
        api.storage.set('until', 0);
        api.ui.notify('Focus Room: время вышло. Молодец!', 'success');
        api.mascot.setMood('happy', 'Сессия завершена. Ты справился!');
      }
      push();
    }, 5000);

    return { deactivate: () => clearInterval(timer) };
  }
};
