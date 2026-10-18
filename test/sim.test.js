// Headless sanity checks for the simulation.
import assert from 'assert';
import { Game } from '../shared/sim.js';

// 1. A raft with nobody farting drifts down the river and eventually hits something.
{
  const g = new Game();
  g.addPlayer(0, 'A', 'frog');
  for (let i = 0; i < 60 * 40; i++) g.step(1 / 60);
  const ev = g.drainEvents();
  assert(ev.some((e) => e.type === 'go'), 'race starts after countdown');
  assert(g.deaths > 0 || g.raft.si > 50, 'raft moves down the river');
}

// 2. With an invincible raft the current carries it all the way to the finish.
{
  const g = new Game();
  for (let i = 0; i < 4; i++) g.addPlayer(i, 'P' + i, 'bear');
  let t = 0;
  while (g.phase !== 'finished' && t < 400) {
    g.raft.shield = 1e9;
    g.setInput(0, { f: true });
    g.step(1 / 60);
    t += 1 / 60;
  }
  assert.equal(g.phase, 'finished', 'raft reaches the finish');
  assert.equal(g.cp, g.track.checkpoints.length - 1, 'passes every checkpoint');
  console.log(`invincible run finished in ${g.finishTime.toFixed(1)}s, track length ${g.track.length}`);
}

// 3. Farting pushes the raft the way the character faces.
{
  const g = new Game();
  g.addPlayer(0, 'A', 'frog');
  g.phase = 'racing';
  const before = { vx: g.raft.vx, vy: g.raft.vy };
  g.setInput(0, { f: true });
  g.step(1 / 60);
  const fa = g.raft.a + g.players[0].f;
  const dv = (g.raft.vx - before.vx) * Math.cos(fa) + (g.raft.vy - before.vy) * Math.sin(fa);
  assert(dv > 2, 'fart adds velocity along facing direction');
}

// 4. Seats, max players, removal.
{
  const g = new Game();
  for (let i = 0; i < 4; i++) g.addPlayer(i, 'P' + i, 'capy');
  assert.equal(g.snapshot().players.length, 4);
  g.removePlayer(2);
  assert.equal(g.snapshot().players.length, 3);
}

console.log('sim tests passed');
