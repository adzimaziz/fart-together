// Checks that every obstacle group leaves a realistic gap: a raft drifting straight at
// a steady speed and lateral position must get through for a decent share of entry times.
import { buildTrack, obstaclePose, sampleAt } from '../shared/track.js';
import { RAFT_R } from '../shared/sim.js';

export function passability(track = buildTrack(), speeds = [4.2, 6]) {
  const groups = [];
  for (const ob of [...track.obstacles].sort((a, b) => a.s - b.s)) {
    const g = groups.find((x) => Math.abs(x.s - ob.s) < 10);
    if (g) g.obs.push(ob); else groups.push({ s: ob.s, obs: [ob] });
  }
  const lim = track.width / 2 - RAFT_R - 0.3;
  return groups.map((g) => {
    let best = 0;
    for (const v of speeds) {
      for (let y = -lim; y <= lim + 1e-9; y += lim / 8) {
        let ok = 0, total = 0;
        for (let t0 = 0; t0 < 12; t0 += 0.1) {
          total++;
          let hit = false;
          for (let s = g.s - 14; s <= g.s + 14 && !hit; s += 0.25) {
            const t = t0 + (s - (g.s - 14)) / v;
            const sm = sampleAt(track, s);
            const x = sm.x + sm.nx * y, z = sm.y + sm.ny * y;
            for (const ob of g.obs) {
              const o = obstaclePose(track, ob, t);
              const px = x - o.cx, pz = z - o.cy;
              const u = Math.max(-o.half, Math.min(o.half, px * o.dx + pz * o.dy));
              if (Math.hypot(px - o.dx * u, pz - o.dy * u) < RAFT_R + o.thick) { hit = true; break; }
            }
          }
          if (!hit) ok++;
        }
        best = Math.max(best, ok / total);
      }
    }
    return { s: g.s, types: g.obs.map((o) => o.type).join('+'), best };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const r of passability()) console.log(r.s, r.types.padEnd(16), (r.best * 100).toFixed(0) + '%');
}
