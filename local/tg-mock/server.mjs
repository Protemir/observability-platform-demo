// Minimal stand-in for the Telegram Bot API (sendMessage only) for the local stand.
// Alertmanager's telegram_configs posts here instead of api.telegram.org, so the
// message format can be checked without creating a real bot. UI: http://localhost:8088
import http from 'node:http';

const messages = [];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Telegram HTML parse_mode allows a small tag set; render only <b>, <code>, <a href>.
const tgHtml = (s) => esc(s)
  .replace(/&lt;(\/?)(b|code)&gt;/g, '<$1$2>')
  .replace(/&lt;a href="([^"&]*)"&gt;/g, '<a href="$1">')
  .replace(/&lt;\/a&gt;/g, '</a>')
  .replace(/\n/g, '<br>');

const page = (list = messages) => `<!doctype html><html><head><meta charset="utf-8"><title>Telegram (mock)</title>
<meta http-equiv="refresh" content="10">
<style>
body{margin:0;font:15px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;background:#0e1621;color:#e4ecf2}
header{background:#17212b;padding:12px 18px;border-bottom:1px solid #0b1118;display:flex;gap:12px;align-items:center}
.av{width:38px;height:38px;border-radius:50%;background:#5288c1;display:grid;place-items:center;font-weight:700}
header small{display:block;color:#6d7f8f;font-size:13px}
main{padding:18px;max-width:760px}
.m{background:#182533;border-radius:12px 12px 12px 4px;padding:10px 14px;margin:0 0 10px;max-width:640px}
.m time{display:block;text-align:right;color:#6d7f8f;font-size:12px;margin-top:4px}
code{background:#0e1621;padding:1px 5px;border-radius:4px;font-size:13px}
a{color:#6ab3f3}
.empty{color:#6d7f8f}
</style></head><body>
<header><div class="av">A</div><div><b>Stand alerts</b><small>bot: alertmanager · ${list.length} сообщений</small></div></header>
<main>${list.length ? list.map((m) => `<div class="m">${tgHtml(m.text)}<time>${m.at}</time></div>`).join('') : '<p class="empty">Пока нет сообщений</p>'}</main>
</body></html>`;

http.createServer((req, res) => {
  if (req.method === 'POST' && /^\/bot[^/]+\/sendMessage$/.test(req.url)) {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      let p = {};
      try { p = JSON.parse(body); } catch { p = Object.fromEntries(new URLSearchParams(body)); }
      const at = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
      messages.unshift({ text: p.text || '', chat: p.chat_id, at });
      if (messages.length > 200) messages.pop();
      console.log(`${at} chat=${p.chat_id} ${String(p.text || '').split('\n')[0]}`);
      res.writeHead(200, { 'content-type': 'application/json' });
      // Bot API types: chat.id and date are numbers (Alertmanager's client is strict about it).
      res.end(JSON.stringify({ ok: true, result: { message_id: messages.length, date: Math.floor(Date.now() / 1000), chat: { id: Number(p.chat_id) || 0, type: 'supergroup' }, text: p.text } }));
    });
    return;
  }
  if (req.method === 'GET' && req.url === '/api/messages') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(messages));
  }
  // ?q=<regex> shows only matching messages (e.g. one scenario); ?since=<ISO time> only newer ones.
  const u = new URL(req.url, 'http://x');
  let list = messages;
  const q = u.searchParams.get('q');
  const since = u.searchParams.get('since');
  try { if (q) list = list.filter((m) => new RegExp(q, 'i').test(m.text)); } catch {}
  if (since) list = list.filter((m) => Date.parse(m.at.replace(' UTC', 'Z').replace(' ', 'T')) >= Date.parse(since));
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(page(list));
}).listen(8088, () => console.log('tg-mock on :8088'));
