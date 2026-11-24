// OVERPRESSURE multiplayer server: serves the game page, runs room lobbies (create / join by code, teams, map,
// host-started countdown) and relays match traffic. The match itself is simulated in the host player's browser
// (bots included); this server only passes messages between the host and everyone else in the room.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
let WebSocketServer;
try { ({ WebSocketServer } = require('ws')); }
catch (e) { console.error('The "ws" package is missing. Use the package.json from the multiplayer zip (it lists "ws" under dependencies), then redeploy.'); process.exit(1); }

const PORT = process.env.PORT || 8080;
const MAPS = ['factory', 'rail', 'ice', 'aquarium', 'jail'];
const TEAM_SIZE = 5;
const COUNTDOWN = 5;

// ---------- static page (gzipped once, cached) ----------
// The game page is normally public/index.html, but it is also found if it was uploaded next to server.js, under
// another name, or in any sub-folder (GitHub's web uploader sometimes flattens or renames folders).
function findPage() {
  const tryFiles = [path.join(__dirname, 'public', 'index.html'), path.join(__dirname, 'index.html')];
  for (const f of tryFiles) if (fs.existsSync(f)) return f;
  const big = [];
  const walk = (dir, depth) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory() && depth < 3) walk(f, depth + 1);
      else if (e.isFile() && /\.html?$/i.test(e.name)) big.push([fs.statSync(f).size, f]);
    }
  };
  try { walk(__dirname, 0); } catch (e) {}
  big.sort((a, b) => b[0] - a[0]);
  return big.length && big[0][0] > 1e6 ? big[0][1] : null; // the game page is the big one (~17 MB)
}
let page = null, pageGz = null, pagePath = null;
function loadPage() {
  pagePath = findPage();
  if (!pagePath) { console.error('Game page not found. Put index.html in a folder named "public" next to server.js.'); return; }
  try { page = fs.readFileSync(pagePath); pageGz = zlib.gzipSync(page, { level: 9 }); console.log('page', path.relative(__dirname, pagePath), (page.length / 1048576).toFixed(1), 'MB →', (pageGz.length / 1048576).toFixed(1), 'MB gzipped'); }
  catch (e) { console.error('could not read', pagePath, e.message); page = null; }
}
loadPage();
function missingPage(res) {
  let files = [];
  const walk = (dir, pre) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name === 'node_modules' || e.name.startsWith('.')) continue; files.push(pre + e.name + (e.isDirectory() ? '/' : '')); if (e.isDirectory() && pre.length < 40) walk(path.join(dir, e.name), pre + e.name + '/'); } };
  try { walk(__dirname, ''); } catch (e) {}
  res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<body style="font:16px sans-serif;background:#111;color:#eee;padding:30px;max-width:720px">
    <h2>OVERPRESSURE: game page missing</h2>
    <p>The server is running, but it can't find the game file. Upload <b>index.html</b> (about 17 MB, from the <b>public</b> folder in the zip) into a folder named <b>public</b> in your repository, next to server.js. Render redeploys by itself after you commit.</p>
    <p>Files the server can see right now:</p><pre style="background:#222;padding:12px">${files.join('\n').replace(/</g, '&lt;') || '(none)'}</pre></body>`);
}
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  if (url === '/' || url === '/index.html') {
    if (!page) loadPage();
    if (!page) return missingPage(res);
    const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', ...(gz ? { 'content-encoding': 'gzip' } : {}) });
    return res.end(gz ? pageGz : page);
  }
  res.writeHead(404); res.end('not found');
});

// ---------- rooms ----------
const rooms = new Map();
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
let nextId = 1;
function newCode() {
  for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += ALPHA[(Math.random() * ALPHA.length) | 0]; if (!rooms.has(c)) return c; }
}
const send = (ws, m) => { if (ws.readyState === 1) ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };
function lobbyState(room) {
  return { t: 'lobby', code: room.code, host: room.hostId, state: room.state, map: room.map, countdown: room.countdown,
    players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team })) };
}
function broadcastLobby(room) { const m = JSON.stringify(lobbyState(room)); for (const p of room.players.values()) send(p.ws, m); }
function teamCount(room, t) { let n = 0; for (const p of room.players.values()) if (p.team === t) n++; return n; }
function cancelCountdown(room) { if (room.timer) clearInterval(room.timer); room.timer = null; room.countdown = null; room.state = 'lobby'; }
function startCountdown(room) {
  room.state = 'countdown'; room.countdown = COUNTDOWN; broadcastLobby(room);
  room.timer = setInterval(() => {
    room.countdown--;
    if (room.countdown > 0) return broadcastLobby(room);
    clearInterval(room.timer); room.timer = null; room.countdown = null;
    room.state = 'game';
    const roster = [...room.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team }));
    const m = JSON.stringify({ t: 'start', map: room.map, roster, host: room.hostId, seed: (Math.random() * 1e9) | 0 });
    for (const p of room.players.values()) send(p.ws, m);
    broadcastLobby(room);
  }, 1000);
}
function leave(ws) {
  const me = ws.player; if (!me || !me.room) return;
  const room = me.room; me.room = null;
  room.players.delete(me.id);
  if (!room.players.size) { cancelCountdown(room); rooms.delete(room.code); return; }
  if (room.hostId === me.id) {
    // the match lives in the host's browser: if the host goes, the match ends and the room returns to the lobby
    const wasGame = room.state === 'game';
    cancelCountdown(room);
    room.hostId = room.players.keys().next().value;
    if (wasGame) for (const p of room.players.values()) send(p.ws, { t: 'hostLeft' });
  } else if (room.state === 'game') {
    const host = room.players.get(room.hostId); if (host) send(host.ws, { t: 'left', id: me.id });
  } else if (room.state === 'countdown') cancelCountdown(room);
  broadcastLobby(room);
}

const wss = new WebSocketServer({ server, maxPayload: 256 * 1024 });
wss.on('connection', (ws) => {
  ws.player = { id: 'p' + nextId++, name: 'Player', team: 0, ws, room: null };
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  send(ws, { t: 'hello', id: ws.player.id, maps: MAPS });
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const me = ws.player, room = me.room;
    // in-game relay: host → everyone (or one player); player → host
    if (m.t === 'r') {
      if (!room || room.state !== 'game') return;
      if (me.id === room.hostId) {
        const out = JSON.stringify({ t: 'r', from: me.id, d: m.d });
        if (m.to) { const p = room.players.get(m.to); if (p) send(p.ws, out); }
        else for (const p of room.players.values()) if (p.id !== me.id) send(p.ws, out);
      } else { const host = room.players.get(room.hostId); if (host) send(host.ws, JSON.stringify({ t: 'r', from: me.id, d: m.d })); }
      return;
    }
    const name = (s) => String(s || 'Player').replace(/[<>&"]/g, '').trim().slice(0, 14) || 'Player';
    if (m.t === 'create') {
      leave(ws);
      const r = { code: newCode(), hostId: me.id, players: new Map(), state: 'lobby', map: MAPS[(Math.random() * MAPS.length) | 0], countdown: null, timer: null };
      rooms.set(r.code, r);
      me.name = name(m.name); me.team = 0; me.room = r; r.players.set(me.id, me);
      send(ws, { t: 'joined', code: r.code, you: me.id });
      broadcastLobby(r);
    } else if (m.t === 'join') {
      const r = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!r) return send(ws, { t: 'err', msg: 'No room with that code.' });
      if (r.state === 'game') return send(ws, { t: 'err', msg: 'That match is already under way.' });
      if (r.players.size >= TEAM_SIZE * 2) return send(ws, { t: 'err', msg: 'That room is full.' });
      leave(ws);
      if (r.state === 'countdown') cancelCountdown(r);
      me.name = name(m.name); me.team = teamCount(r, 0) <= teamCount(r, 1) ? 0 : 1; me.room = r; r.players.set(me.id, me);
      send(ws, { t: 'joined', code: r.code, you: me.id });
      broadcastLobby(r);
    } else if (!room) return;
    else if (m.t === 'leave') { leave(ws); send(ws, { t: 'left-room' }); }
    else if (room.state === 'game') {
      // the host brings the room back to the lobby once a match is over
      if (m.t === 'back' && me.id === room.hostId) { room.state = 'lobby'; broadcastLobby(room); }
    }
    else if (m.t === 'team') {
      const t = m.team ? 1 : 0;
      if (t !== me.team && teamCount(room, t) < TEAM_SIZE) { me.team = t; if (room.state === 'countdown') cancelCountdown(room); broadcastLobby(room); }
    } else if (m.t === 'name') { me.name = name(m.name); broadcastLobby(room); }
    else if (m.t === 'map' && me.id === room.hostId && MAPS.includes(m.map)) { room.map = m.map; if (room.state === 'countdown') cancelCountdown(room); broadcastLobby(room); }
    else if (m.t === 'ready' && me.id === room.hostId) {
      if (room.state === 'countdown') { cancelCountdown(room); broadcastLobby(room); }
      else startCountdown(room);
    }
  });
  ws.on('close', () => leave(ws));
});
// keep connections alive through proxies, drop dead ones
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 25000);

server.listen(PORT, () => console.log('OVERPRESSURE server on :' + PORT));
