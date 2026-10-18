// Deterministic-ish game simulation. Runs on the server for online games and in the
// browser for local (same-device) games.
import { buildTrack, sampleAt, isSpiky, obstaclePose } from './track.js';

export const MAX_PLAYERS = 4;
export const CHARACTERS = ['frog', 'hippo', 'bear', 'capy'];

export const RAFT_R = 2.3;
export const SEAT_R = 1.45;
export const MOVE_SPEED = 2.4; // rad/s around the rim
export const FART_COOLDOWN = 0.55;
const FART_IMPULSE = 3.4;
const CURRENT = 4.2;
const WATER_DRAG = 0.9;
const ANG_DRAG = 1.4;
const COUNTDOWN = 3;
const DEAD_TIME = 1.8;
const SPAWN_SHIELD = 1.5;

// How far (radians) each player may slide either side of their home seat:
// everyone gets an equal slice of the rim, with a small gap to the neighbours.
export function seatRange(n) {
  return n <= 1 ? Infinity : Math.PI / n - 0.14;
}

// Moving "right" from the character's own point of view (it always faces the centre)
// goes clockwise from above, i.e. towards a smaller rim angle.
export function moveSeat(off, inp, dt, n) {
  const range = seatRange(n);
  const v = off + ((inp.l ? 1 : 0) - (inp.r ? 1 : 0)) * MOVE_SPEED * dt;
  return Math.max(-range, Math.min(range, v));
}

export class Game {
  constructor() {
    this.track = buildTrack();
    this.players = new Array(MAX_PLAYERS).fill(null);
    this.events = [];
    this.reset();
  }

  reset() {
    this.t = 0;
    this.phase = 'countdown';
    this.countdown = COUNTDOWN;
    this.time = 0;
    this.cp = 0;
    this.deaths = 0;
    this.finishTime = null;
    this.spawn();
  }

  spawn() {
    const s = this.track.checkpoints[this.cp] + 6;
    const sm = sampleAt(this.track, s);
    this.raft = {
      x: sm.x, y: sm.y, vx: sm.tx * CURRENT, vy: sm.ty * CURRENT,
      a: Math.atan2(sm.ty, sm.tx), w: 0,
      dead: false, deadT: 0, shield: SPAWN_SHIELD, si: Math.round(s),
    };
    for (const p of this.players) if (p) { p.off = 0; p.cd = 0; }
  }

  addPlayer(slot, name, char) {
    this.players[slot] = {
      slot, name, char, off: 0, cd: 0, seat: 0,
      input: { l: false, r: false, f: false, tap: false },
    };
    this.layoutSeats();
  }

  removePlayer(slot) {
    this.players[slot] = null;
    this.layoutSeats();
  }

  layoutSeats() {
    const list = this.players.filter(Boolean);
    const n = list.length;
    const base = n === 2 ? Math.PI / 2 : Math.PI / 4;
    list.forEach((p, k) => {
      p.seat = base + (k * 2 * Math.PI) / n;
      p.off = moveSeat(p.off, {}, 0, n);
    });
  }

  setInput(slot, inp) {
    const p = this.players[slot];
    if (!p) return;
    p.input.l = !!inp.l;
    p.input.r = !!inp.r;
    p.input.f = !!inp.f;
    if (inp.f) p.input.tap = true; // latch so quick taps between ticks are not lost
  }

  emit(e) { this.events.push(e); }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  nearest(hint) {
    const smp = this.track.samples;
    const r = this.raft;
    let best = hint, bd = Infinity;
    const lo = Math.max(0, hint - 30), hi = Math.min(smp.length - 1, hint + 30);
    for (let i = lo; i <= hi; i++) {
      const d = (smp[i].x - r.x) ** 2 + (smp[i].y - r.y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  pop(reason) {
    const r = this.raft;
    if (r.dead || r.shield > 0 || this.phase !== 'racing') return;
    r.dead = true;
    r.deadT = DEAD_TIME;
    r.vx = r.vy = r.w = 0;
    this.deaths++;
    this.emit({ type: 'pop', reason, x: r.x, y: r.y });
  }

  step(dt) {
    this.t += dt;
    const r = this.raft;

    // Players can always slide around the rim, even during the countdown.
    const n = this.players.filter(Boolean).length;
    for (const p of this.players) {
      if (!p) continue;
      p.off = moveSeat(p.off, p.input, dt, n);
      p.cd = Math.max(0, p.cd - dt);
    }

    if (this.phase === 'countdown') {
      this.countdown -= dt;
      for (const p of this.players) if (p) p.input.tap = false;
      if (this.countdown <= 0) {
        this.phase = 'racing';
        this.emit({ type: 'go' });
      }
      return;
    }

    if (this.phase === 'racing') this.time += dt;

    if (r.dead) {
      r.deadT -= dt;
      if (r.deadT <= 0) {
        this.spawn();
        this.emit({ type: 'respawn' });
      }
      return;
    }

    // Farts: everyone faces the centre with their butt over the edge, so a fart pushes
    // the raft from that side towards the opposite side.
    if (this.phase === 'racing') {
      for (const p of this.players) {
        if (!p) continue;
        if ((p.input.f || p.input.tap) && p.cd <= 0) {
          p.input.tap = false;
          p.cd = FART_COOLDOWN;
          const fa = r.a + p.seat + p.off + Math.PI;
          r.vx += Math.cos(fa) * FART_IMPULSE;
          r.vy += Math.sin(fa) * FART_IMPULSE;
          this.emit({ type: 'fart', slot: p.slot });
        }
      }
    }

    // River current + drag.
    let sm = this.track.samples[r.si];
    const k = 1 - Math.exp(-WATER_DRAG * dt);
    const flow = this.phase === 'finished' ? 0.5 : CURRENT;
    r.vx += (sm.tx * flow - r.vx) * k;
    r.vy += (sm.ty * flow - r.vy) * k;
    r.w *= Math.exp(-ANG_DRAG * dt);

    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.a += r.w * dt;
    r.shield = Math.max(0, r.shield - dt);

    r.si = this.nearest(r.si);
    sm = this.track.samples[r.si];

    // Banks.
    const lim = this.track.width / 2 - RAFT_R;
    const d = (r.x - sm.x) * sm.nx + (r.y - sm.y) * sm.ny;
    if (Math.abs(d) > lim) {
      const side = Math.sign(d);
      const over = d - side * lim;
      r.x -= sm.nx * over;
      r.y -= sm.ny * over;
      const vl = r.vx * sm.nx + r.vy * sm.ny;
      if (vl * side > 0) {
        r.vx -= 1.4 * vl * sm.nx;
        r.vy -= 1.4 * vl * sm.ny;
        const vt = r.vx * sm.tx + r.vy * sm.ty;
        r.w += side * vt * 0.08;
        this.emit({ type: 'bump' });
      }
      if (isSpiky(this.track, sm.s, side)) this.pop('wall');
    }
    // Back wall at the start and at the end of the river.
    const along = (r.x - sm.x) * sm.tx + (r.y - sm.y) * sm.ty;
    if ((r.si <= 1 && along < 0) || (r.si >= this.track.length - 3 && along > 0)) {
      const vt = r.vx * sm.tx + r.vy * sm.ty;
      if (vt * along > 0) { r.vx -= 1.4 * vt * sm.tx; r.vy -= 1.4 * vt * sm.ty; }
    }

    // Obstacles.
    for (const ob of this.track.obstacles) {
      if (Math.abs(ob.s - sm.s) > 14) continue;
      const o = obstaclePose(this.track, ob, this.t);
      const px = r.x - o.cx, py = r.y - o.cy;
      const u = Math.max(-o.half, Math.min(o.half, px * o.dx + py * o.dy));
      const dist = Math.hypot(px - o.dx * u, py - o.dy * u);
      // While the respawn shield is up the raft ghosts through obstacles.
      if (dist < RAFT_R + o.thick && r.shield <= 0) this.pop('spikes');
    }

    if (this.phase !== 'racing') return;

    // Checkpoints + finish.
    const cps = this.track.checkpoints;
    for (let c = this.cp + 1; c < cps.length; c++) {
      if (sm.s >= cps[c]) {
        this.cp = c;
        this.emit({ type: 'checkpoint', index: c });
      }
    }
    if (sm.s >= this.track.finishS) {
      this.phase = 'finished';
      this.finishTime = this.time;
      this.emit({ type: 'finish', time: this.time, deaths: this.deaths });
    }
  }

  snapshot() {
    const r = this.raft;
    return {
      t: this.t,
      phase: this.phase,
      countdown: this.countdown,
      time: this.time,
      cp: this.cp,
      deaths: this.deaths,
      finishTime: this.finishTime,
      raft: { x: r.x, y: r.y, a: r.a, dead: r.dead, shield: r.shield, si: r.si },
      players: this.players.filter(Boolean).map((p) => ({
        slot: p.slot, name: p.name, char: p.char, pos: p.seat + p.off, seat: p.seat, cd: p.cd,
      })),
    };
  }
}
