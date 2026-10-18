import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { Game, MAX_PLAYERS, CHARACTERS } from './shared/sim.js';

const PORT = process.env.PORT || 3000;
const TICK = 1 / 60;
const SEND_EVERY = 2; // ticks -> 30 snapshots per second

const app = express();
app.use(express.static('public'));
app.use('/shared', express.static('shared'));
app.use('/vendor/three', express.static('node_modules/three/build'));
app.use('/vendor/three-addons', express.static('node_modules/three/examples/jsm'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map();

function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function cleanName(n) {
  return String(n || '').replace(/[<>]/g, '').trim().slice(0, 14) || 'Pemain';
}

function cleanChar(c) {
  return CHARACTERS.includes(c) ? c : CHARACTERS[0];
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const c of room.clients) if (c.ws.readyState === c.ws.OPEN) c.ws.send(data);
}

function lobbyInfo(room) {
  return {
    type: 'lobby',
    code: room.code,
    host: room.host,
    started: !!room.game,
    players: room.clients.map((c) => ({ slot: c.slot, name: c.name, char: c.char })),
  };
}

function startGame(room) {
  room.game = new Game();
  for (const c of room.clients) room.game.addPlayer(c.slot, c.name, c.char);
  clearInterval(room.loop);
  let tick = 0;
  room.loop = setInterval(() => {
    room.game.step(TICK);
    if (++tick % SEND_EVERY === 0) {
      broadcast(room, { type: 'state', s: room.game.snapshot(), ev: room.game.drainEvents() });
    }
  }, TICK * 1000);
  broadcast(room, lobbyInfo(room));
}

function stopRoom(room) {
  clearInterval(room.loop);
  rooms.delete(room.code);
}

function joinRoom(ws, room, name, char) {
  const used = new Set(room.clients.map((c) => c.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  const client = { ws, slot, name: cleanName(name), char: cleanChar(char) };
  room.clients.push(client);
  if (room.host == null) room.host = slot;
  ws.room = room;
  ws.client = client;
  if (room.game) room.game.addPlayer(slot, client.name, client.char);
  send(ws, { type: 'joined', code: room.code, slot });
  broadcast(room, lobbyInfo(room));
}

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  room.clients = room.clients.filter((c) => c.ws !== ws);
  if (room.game) room.game.removePlayer(ws.client.slot);
  ws.room = null;
  if (room.clients.length === 0) return stopRoom(room);
  if (room.host === ws.client.slot) room.host = room.clients[0].slot;
  broadcast(room, lobbyInfo(room));
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const room = ws.room;

    switch (msg.type) {
      case 'create': {
        if (room) leave(ws);
        const r = { code: makeCode(), clients: [], host: null, game: null, loop: null };
        rooms.set(r.code, r);
        joinRoom(ws, r, msg.name, msg.char);
        break;
      }
      case 'join': {
        if (room) leave(ws);
        const r = rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!r) return send(ws, { type: 'error', msg: 'Bilik tak jumpa. Semak kod.' });
        if (r.clients.length >= MAX_PLAYERS) return send(ws, { type: 'error', msg: 'Bilik dah penuh (maksimum 4 orang).' });
        joinRoom(ws, r, msg.name, msg.char);
        break;
      }
      case 'char': {
        if (!room) return;
        ws.client.char = cleanChar(msg.char);
        if (room.game?.players[ws.client.slot]) room.game.players[ws.client.slot].char = ws.client.char;
        broadcast(room, lobbyInfo(room));
        break;
      }
      case 'start': {
        if (room && room.host === ws.client.slot) startGame(room);
        break;
      }
      case 'input': {
        if (room?.game) room.game.setInput(ws.client.slot, msg);
        break;
      }
      case 'leave': {
        leave(ws);
        break;
      }
    }
  });

  ws.on('close', () => leave(ws));
});

// Drop dead connections so rooms free up their seats.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

server.listen(PORT, () => {
  console.log(`Fart Together running on http://localhost:${PORT}`);
});
