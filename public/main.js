import { Renderer, CHAR_INFO } from './render.js';
import { Game, CHARACTERS, MAX_PLAYERS, FART_COOLDOWN, moveSeat } from '/shared/sim.js';
import { buildTrack } from '/shared/track.js';
import { KEYMAPS, localInput, onlineInput, bindTouch, isTouchDevice } from './input.js';
import { unlockAudio, playFart, playPop, playBeep, playCheckpoint, playFinish } from './audio.js';

const $ = (id) => document.getElementById(id);
const track = buildTrack();
const renderer = new Renderer($('view'), track);

const screens = ['menu', 'lobby', 'local', 'finish'];
function show(name) {
  for (const s of screens) $(s).classList.toggle('hidden', s !== name);
  $('hud').classList.toggle('hidden', !(name === 'hud' || name === 'finish'));
}

function fmtTime(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

// ---------- shared state ----------
let mode = null;        // 'local' | 'online' | null
let localGame = null;
let current = null;     // latest renderable state
let mySlot = null;
let lastPhase = null;
let lastCountdownBeep = null;

let prefs = { name: '', char: 'frog' };
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem('ft-prefs') || '{}') }; } catch {}
const savePrefs = () => { try { localStorage.setItem('ft-prefs', JSON.stringify(prefs)); } catch {} };

// ---------- menu ----------
function charPicker(el, selected, onPick) {
  el.innerHTML = '';
  for (const c of CHARACTERS) {
    const b = document.createElement('button');
    b.className = 'char' + (c === selected ? ' on' : '');
    b.innerHTML = `<span class="emoji">${CHAR_INFO[c].emoji}</span>${CHAR_INFO[c].label}`;
    b.onclick = () => {
      for (const x of el.children) x.classList.remove('on');
      b.classList.add('on');
      onPick(c);
    };
    el.appendChild(b);
  }
}

$('name').value = prefs.name;
$('name').oninput = () => { prefs.name = $('name').value; savePrefs(); };
charPicker($('chars'), prefs.char, (c) => {
  prefs.char = c; savePrefs();
  if (mode === 'online') send({ type: 'char', char: c });
});

const params = new URLSearchParams(location.search);
if (params.get('room')) $('code').value = params.get('room').toUpperCase();

const playerName = () => $('name').value.trim() || 'Pemain';

$('btn-create').onclick = () => { unlockAudio(); connect({ type: 'create', name: playerName(), char: prefs.char }); };
$('btn-join').onclick = () => {
  unlockAudio();
  const code = $('code').value.trim().toUpperCase();
  if (code.length !== 4) return ($('menu-error').textContent = 'Masukkan kod 4 huruf.');
  connect({ type: 'join', code, name: playerName(), char: prefs.char });
};
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });

// ---------- online ----------
let ws = null;
let buffer = [];        // snapshots, oldest first, for interpolation
let clockOffset = null; // local clock (s) minus server sim time, filtered for jitter
let myOff = 0;          // locally predicted rim offset of my own character
let myCd = 0;           // locally predicted fart cooldown
let lobby = null;
let lastSent = '';
let lastSentAt = 0;

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function connect(firstMsg) {
  $('menu-error').textContent = '';
  if (ws) ws.close();
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  const sock = ws;
  ws.onopen = () => send(firstMsg);
  ws.onerror = () => { $('menu-error').textContent = 'Tak dapat sambung ke server.'; };
  ws.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    if (mode === 'online') { leaveToMenu(); $('menu-error').textContent = 'Sambungan terputus.'; }
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'error') {
      $('menu-error').textContent = msg.msg;
    } else if (msg.type === 'joined') {
      mode = 'online';
      mySlot = msg.slot;
      myOff = 0;
      myCd = 0;
      buffer = [];
      history.replaceState(null, '', `?room=${msg.code}`);
    } else if (msg.type === 'lobby') {
      lobby = msg;
      renderLobby();
    } else if (msg.type === 'state') {
      onSnapshot(msg.s, msg.ev);
    }
  };
}

function renderLobby() {
  if (!lobby) return;
  $('lobby-code').textContent = lobby.code;
  $('share-link').value = `${location.origin}/?room=${lobby.code}`;
  const ul = $('lobby-players');
  ul.innerHTML = '';
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const p = lobby.players[i];
    const li = document.createElement('li');
    if (p) {
      const tags = [p.slot === lobby.host ? '👑 host' : '', p.slot === mySlot ? '(kau)' : ''].filter(Boolean).join(' ');
      li.innerHTML = `<span class="emoji">${CHAR_INFO[p.char].emoji}</span><b></b><span class="tag">${tags}</span>`;
      li.querySelector('b').textContent = p.name;
    } else {
      li.className = 'empty';
      li.textContent = 'Menunggu pemain…';
    }
    ul.appendChild(li);
  }
  const isHost = lobby.host === mySlot;
  $('btn-start').classList.toggle('hidden', !isHost);
  $('lobby-wait').textContent = isHost ? `${lobby.players.length}/4 pemain. Tekan Mula bila dah sedia.` : 'Menunggu host mula…';
  $('btn-again').disabled = !isHost;
  $('finish-wait').textContent = isHost ? '' : 'Menunggu host tekan Main Lagi…';

  if (!lobby.started) show('lobby');
  else if (!current || current.phase !== 'finished') show('hud');
}

$('btn-start').onclick = () => { unlockAudio(); send({ type: 'start' }); };
$('btn-leave').onclick = () => leaveToMenu();
$('btn-copy').onclick = async () => {
  const link = $('share-link').value;
  try {
    if (navigator.share && isTouchDevice()) await navigator.share({ title: 'Fart Together', url: link });
    else await navigator.clipboard.writeText(link);
    $('btn-copy').textContent = 'Siap!';
  } catch {
    $('share-link').select();
  }
  setTimeout(() => ($('btn-copy').textContent = 'Salin'), 1500);
};

function onSnapshot(s, events) {
  const nowS = performance.now() / 1000;
  if (buffer.length && s.t < buffer[buffer.length - 1].t) { buffer = []; clockOffset = null; } // new round
  // Track the smallest observed delay; packets that arrive late don't drag the clock.
  const off = nowS - s.t;
  if (clockOffset === null || off < clockOffset) clockOffset = off;
  else clockOffset += (off - clockOffset) * 0.01;
  buffer.push(s);
  if (buffer.length > 40) buffer.shift();
  for (const ev of events) {
    // My own farts were already shown the moment I pressed the button.
    if (ev.type === 'fart' && ev.slot === mySlot) continue;
    handleEvent(ev, s);
  }
}

const lerp = (a, b, k) => a + (b - a) * k;
const lerpAngle = (a, b, k) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

// Render slightly in the past (in server time) and interpolate between snapshots.
const INTERP_DELAY = 0.07;
function interpolated() {
  if (!buffer.length) return null;
  const rt = performance.now() / 1000 - clockOffset - INTERP_DELAY;
  let i = buffer.length - 1;
  while (i > 0 && buffer[i - 1].t > rt) i--;
  let a, b, k;
  if (i === 0) { a = b = buffer[0]; k = 0; }
  else {
    a = buffer[i - 1]; b = buffer[i];
    k = Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t || 1)));
  }
  const prev = new Map(a.players.map((p) => [p.slot, p]));
  return {
    ...b,
    t: lerp(a.t, b.t, k),
    time: lerp(a.time, b.time, k),
    raft: {
      ...b.raft,
      x: lerp(a.raft.x, b.raft.x, k),
      y: lerp(a.raft.y, b.raft.y, k),
      a: lerpAngle(a.raft.a, b.raft.a, k),
      si: Math.round(lerp(a.raft.si, b.raft.si, k)),
    },
    players: b.players.map((p) => {
      const q = prev.get(p.slot);
      return q ? { ...p, pos: lerpAngle(q.pos, p.pos, k), cd: lerp(q.cd, p.cd, k) } : p;
    }),
  };
}

// Client-side prediction for my own character so moving and farting feel instant.
function predictSelf(state, inp, dt) {
  const latest = buffer[buffer.length - 1];
  const me = latest?.players.find((p) => p.slot === mySlot);
  if (!me) return state;
  const serverOff = me.pos - me.seat;
  myOff = moveSeat(myOff, inp, dt, latest.players.length);
  // Ease towards the server when idle; snap if we drifted far (e.g. a respawn).
  if (Math.abs(myOff - serverOff) > 0.8) myOff = serverOff;
  else if (!inp.l && !inp.r) myOff += (serverOff - myOff) * Math.min(1, dt * 4);

  myCd = Math.max(0, myCd - dt);
  const players = state.players.map((p) => (p.slot === mySlot ? { ...p, pos: p.seat + myOff, cd: myCd } : p));
  const out = { ...state, players };
  if (inp.f && myCd <= 0 && state.phase === 'racing' && !state.raft.dead) {
    myCd = FART_COOLDOWN;
    handleEvent({ type: 'fart', slot: mySlot }, out);
  }
  return out;
}

function sendInput(inp) {
  const key = `${+inp.l}${+inp.r}${+inp.f}`;
  const now = performance.now();
  if (key !== lastSent || now - lastSentAt > 200) {
    send({ type: 'input', l: inp.l, r: inp.r, f: inp.f });
    lastSent = key;
    lastSentAt = now;
  }
}

// ---------- local ----------
let localCount = 2;
const localPlayers = Array.from({ length: MAX_PLAYERS }, (_, i) => ({ name: `P${i + 1}`, char: CHARACTERS[i] }));

function renderLocalSetup() {
  const seg = $('local-count');
  seg.innerHTML = '';
  for (let n = 1; n <= MAX_PLAYERS; n++) {
    const b = document.createElement('button');
    b.textContent = n;
    b.className = n === localCount ? 'on' : '';
    b.onclick = () => { localCount = n; renderLocalSetup(); };
    seg.appendChild(b);
  }
  const box = $('local-players');
  box.innerHTML = '';
  for (let i = 0; i < localCount; i++) {
    const d = document.createElement('div');
    d.className = 'lp';
    d.innerHTML = `<div class="lp-head">P${i + 1} <span class="lp-keys">${KEYMAPS[i].label}</span></div><div class="chars"></div>`;
    charPicker(d.querySelector('.chars'), localPlayers[i].char, (c) => { localPlayers[i].char = c; });
    box.appendChild(d);
  }
}

$('btn-local').onclick = () => { unlockAudio(); renderLocalSetup(); show('local'); };
$('btn-local-back').onclick = () => show('menu');
$('btn-local-start').onclick = () => { unlockAudio(); startLocal(); };

function startLocal() {
  mode = 'local';
  localGame = new Game();
  for (let i = 0; i < localCount; i++) {
    const name = i === 0 && $('name').value.trim() ? $('name').value.trim() : localPlayers[i].name;
    localGame.addPlayer(i, name, localPlayers[i].char);
  }
  lastPhase = null;
  show('hud');
}

// ---------- HUD + events ----------
let bigTimer = null;
function bigText(text, ms = 900) {
  const el = $('big-text');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(bigTimer);
  if (ms) bigTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function handleEvent(ev, s) {
  if (ev.type === 'fart') playFart(ev.slot);
  else if (ev.type === 'pop') { playPop(); bigText('POP! 💥', 1200); }
  else if (ev.type === 'go') { playBeep(true); bigText('GO! 💨', 800); }
  else if (ev.type === 'checkpoint') { playCheckpoint(); bigText('CHECKPOINT!', 1100); }
  else if (ev.type === 'finish') playFinish();
  renderer.onEvent(ev, s);
}

function updateHud(s) {
  $('hud-time').textContent = `⏱ ${fmtTime(s.finishTime ?? s.time)}`;
  $('hud-cp').textContent = `🚩 ${s.cp}/${track.checkpoints.length - 1}`;
  $('hud-deaths').textContent = `💥 ${s.deaths}`;

  const gas = $('hud-gas');
  if (gas.children.length !== s.players.length) {
    gas.innerHTML = s.players.map(() => '<div class="gas"><span></span><div class="bar"><i></i></div></div>').join('');
  }
  s.players.forEach((p, i) => {
    const el = gas.children[i];
    el.querySelector('span').textContent = `${CHAR_INFO[p.char].emoji} ${p.name}`;
    el.querySelector('i').style.width = `${Math.round((1 - p.cd / FART_COOLDOWN) * 100)}%`;
    el.style.outline = mode === 'online' && p.slot === mySlot ? '2px solid #e45bb5' : '';
  });

  if (s.phase === 'countdown') {
    const n = Math.ceil(s.countdown);
    if (n !== lastCountdownBeep && n > 0) { lastCountdownBeep = n; playBeep(); bigText(String(n), 0); }
  } else {
    lastCountdownBeep = null;
  }

  if (s.phase !== lastPhase) {
    if (s.phase === 'finished') {
      $('finish-stats').innerHTML =
        `Masa: <b>${fmtTime(s.finishTime)}</b><br>Rakit pecah: <b>${s.deaths}</b> kali<br>` +
        (s.deaths === 0 ? '🌟 Tiada pecah langsung! Hebat!' : 'Kentut lagi kuat lain kali! 💨');
      setTimeout(() => { if (current?.phase === 'finished') show('finish'); }, 1500);
    } else if (lastPhase === 'finished') {
      show('hud');
    }
    lastPhase = s.phase;
  }
}

function showHelp() {
  const touchUi = isTouchDevice() && mode === 'online';
  $('touch').classList.toggle('hidden', !touchUi);
  if (mode === 'local') {
    $('help').textContent = KEYMAPS.slice(0, localGame.players.filter(Boolean).length).map((k, i) => `P${i + 1}: ${k.label}`).join('  •  ');
  } else {
    $('help').textContent = touchUi ? '' : 'A/D atau ←/→ gerak kiri/kanan  •  W / ↑ / Space kentut  •  Kentut tolak rakit ke arah bertentangan!';
  }
}

$('btn-again').onclick = () => {
  if (mode === 'local') { localGame.reset(); lastPhase = null; show('hud'); }
  else send({ type: 'start' });
};
$('btn-menu').onclick = () => leaveToMenu();
$('btn-quit').onclick = () => leaveToMenu();

function leaveToMenu() {
  if (mode === 'online') { send({ type: 'leave' }); }
  mode = null;
  localGame = null;
  lobby = null;
  current = null;
  buffer = [];
  lastPhase = null;
  history.replaceState(null, '', location.pathname);
  show('menu');
}

bindTouch($('touch'));

// ---------- idle preview: a demo raft floating down the river behind the menu ----------
const demo = new Game();
CHARACTERS.forEach((c, i) => demo.addPlayer(i, CHAR_INFO[c].label, c));
demo.phase = 'racing';

// ---------- main loop ----------
let last = performance.now();
let acc = 0;
const STEP = 1 / 60;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (mode === 'local' && localGame) {
    localGame.players.forEach((p, i) => { if (p) localGame.setInput(i, localInput(i)); });
    acc += dt;
    while (acc >= STEP) {
      localGame.step(STEP);
      acc -= STEP;
      const s = localGame.snapshot();
      for (const ev of localGame.drainEvents()) handleEvent(ev, s);
    }
    current = localGame.snapshot();
  } else if (mode === 'online') {
    const inp = onlineInput();
    sendInput(inp);
    current = interpolated();
    if (current) current = predictSelf(current, inp, dt);
  } else {
    current = null;
  }

  if (current) {
    updateHud(current);
    showHelp();
    renderer.render(current, dt);
  } else {
    demo.raft.shield = 1e9; // invulnerable, just drifts along bumping into things
    demo.step(dt);
    demo.drainEvents();
    if (demo.raft.si > track.finishS - 5) { demo.cp = 0; demo.spawn(); }
    renderer.render(demo.snapshot(), dt);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
show('menu');
