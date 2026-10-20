// BoyKisser Moods — reactive mascot dialogue.
const LINES = [
  'Никогда не забывай: я уже запомнил эту страницу.',
  'Снова работаешь? Уважаю.',
  'Ты открыл столько вкладок… я всё вижу. 👀',
  'Эта страница теперь в Time Capsule. Пусть попробуют удалить.',
  'Капча? Не сегодня.',
  'Не забывай пить воду, человек.'
];

const SOCIAL = ['youtube.com', 'tiktok.com', 'x.com', 'twitter.com', 'instagram.com', 'twitch.tv'];

module.exports = {
  activate(api) {
    const seen = new Set();
    let lastLine = -1;

    function pick() {
      let index = Math.floor(Math.random() * LINES.length);
      if (index === lastLine) index = (index + 1) % LINES.length;
      lastLine = index;
      return LINES[index];
    }

    api.events.on('tab:navigated', ({ url, title }) => {
      if (!url || url.startsWith('never://')) return;
      let host = '';
      try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return; }

      if (SOCIAL.some((s) => host === s)) {
        api.mascot.setMood('shield', `Опять ${host}? Ладно, только по делу.`);
        return;
      }
      if (!seen.has(host)) {
        seen.add(host);
        api.storage.set('hosts', [...seen]);
        api.mascot.setMood('happy', `Новое место: ${host}. ${pick()}`);
      }
    });

    api.events.on('capsule:captured', () => {
      api.mascot.setMood('happy', 'Снимок сохранён навсегда. Я никогда не забуду.');
    });

    api.ui.registerCommand({
      id: 'say',
      title: 'BoyKisser: скажи что-нибудь',
      run: () => {
        api.mascot.say(pick());
        return 'meow';
      }
    });

    const saved = api.storage.get('hosts', []);
    if (Array.isArray(saved)) saved.forEach((h) => seen.add(h));
  }
};
