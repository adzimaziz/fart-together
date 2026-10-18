// Course definition + helpers shared by the server simulation and the browser renderer.
// Coordinates are 2D (x, y). The renderer maps y -> three.js z.

export const TRACK_DEF = {
  width: 16,
  points: [
    [0, 30], [0, -30], [8, -70], [26, -105], [24, -145], [4, -175],
    [-20, -205], [-26, -245], [-12, -285], [0, -325], [2, -370], [0, -410],
  ],
  // side: +1 = right bank (along normal), -1 = left bank
  spikyWalls: [
    { s0: 70, s1: 120, side: 1 },
    { s0: 160, s1: 215, side: -1 },
    { s0: 228, s1: 270, side: 1 },
    { s0: 228, s1: 270, side: -1 },
    { s0: 310, s1: 350, side: -1 },
    { s0: 360, s1: 400, side: 1 },
  ],
  // Every obstacle must leave a real gap; test/passable.js checks this.
  obstacles: [
    { type: 'spinner', s: 55, off: 0, half: 3.8, speed: 0.7, phase: 0 },
    { type: 'slider', s: 92, amp: 4, half: 2.2, speed: 0.9, phase: 0 },
    { type: 'spinner', s: 120, off: 3, half: 3.4, speed: -1.0, phase: 1 },
    // Mirrored pair: both bars line up with the flow at the same moment, opening the lane.
    { type: 'spinner', s: 180, off: -5.5, half: 2.6, speed: 0.8, phase: 0 },
    { type: 'spinner', s: 180, off: 5.5, half: 2.6, speed: -0.8, phase: Math.PI },
    { type: 'slider', s: 214, amp: 4.4, half: 2.0, speed: 1.2, phase: 1 },
    { type: 'spinner', s: 250, off: 0, half: 3.8, speed: 0.65, phase: 2 },
    { type: 'slider', s: 316, amp: 4, half: 2.0, speed: 1.3, phase: 0 },
    { type: 'slider', s: 336, amp: 4, half: 2.0, speed: 1.3, phase: Math.PI },
    { type: 'spinner', s: 374, off: 0, half: 3.8, speed: -0.8, phase: 0.5 },
  ],
  checkpoints: [0, 145, 290],
  finishBack: 30, // finish line sits this far before the end of the river
};

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  const f = (a, b, c, d) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

export function buildTrack(def = TRACK_DEF) {
  const pts = def.points;
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
    for (let k = 0; k < 60; k++) dense.push(catmull(p0, p1, p2, p3, k / 60));
  }
  dense.push(pts[pts.length - 1]);

  const cum = [0];
  for (let i = 1; i < dense.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  }
  const length = cum[cum.length - 1];

  // Resample at 1 unit spacing so sample index == arc length.
  const samples = [];
  let j = 1;
  for (let s = 0; s <= length; s += 1) {
    while (j < cum.length - 1 && cum[j] < s) j++;
    const u = (s - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
    samples.push({
      x: dense[j - 1][0] + (dense[j][0] - dense[j - 1][0]) * u,
      y: dense[j - 1][1] + (dense[j][1] - dense[j - 1][1]) * u,
      s,
    });
  }
  for (let i = 0; i < samples.length; i++) {
    const a = samples[Math.max(i - 1, 0)], b = samples[Math.min(i + 1, samples.length - 1)];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const sm = samples[i];
    sm.tx = (b.x - a.x) / l;
    sm.ty = (b.y - a.y) / l;
    sm.nx = -sm.ty;
    sm.ny = sm.tx;
  }

  return {
    ...def,
    samples,
    length: samples.length - 1,
    finishS: samples.length - 1 - def.finishBack,
  };
}

export function sampleAt(track, s) {
  const i = Math.max(0, Math.min(track.samples.length - 1, Math.round(s)));
  return track.samples[i];
}

export function isSpiky(track, s, side) {
  return track.spikyWalls.some((w) => w.side === side && s >= w.s0 && s <= w.s1);
}

// Returns the obstacle as a line segment: centre (cx, cy), unit direction (dx, dy), half length.
export function obstaclePose(track, ob, t) {
  const b = sampleAt(track, ob.s);
  if (ob.type === 'spinner') {
    const a = ob.phase + ob.speed * t;
    return { cx: b.x + b.nx * ob.off, cy: b.y + b.ny * ob.off, dx: Math.cos(a), dy: Math.sin(a), half: ob.half, thick: 0.7 };
  }
  const o = ob.amp * Math.sin(ob.speed * t + ob.phase);
  return { cx: b.x + b.nx * o, cy: b.y + b.ny * o, dx: b.nx, dy: b.ny, half: ob.half, thick: 0.7 };
}
