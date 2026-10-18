import * as THREE from 'three';
import { sampleAt, obstaclePose } from '/shared/track.js';
import { RAFT_R } from '/shared/sim.js';

// 2D sim angle -> three.js rotation.y (sim y maps to world z).
const rotY = (a) => -a;

const COLORS = {
  water: 0x3fb8ec,
  sand: 0xf6b46a,
  wall: 0xf09a4c,
  rail: 0x86cf4e,
  pink: 0xe45bb5,
  spike: 0xfff4fb,
  raftRing: 0xf8dcb4,
  raftFloor: 0x9ccc65,
  bumper: 0xc8463c,
};

export const CHAR_INFO = {
  frog: { label: 'Katak', emoji: '🐸', color: 0x7ed957 },
  hippo: { label: 'Badak', emoji: '🦛', color: 0x5a8fd6 },
  bear: { label: 'Beruang', emoji: '🐻', color: 0x5b5560 },
  capy: { label: 'Kapibara', emoji: '🦫', color: 0xe8a160 },
};

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lambert(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

function textSprite(text, { size = 48, color = '#fff', stroke = '#3a2a1a', scale = 1 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `bold ${size}px Trebuchet MS, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 24;
  c.width = w; c.height = size + 24;
  ctx.font = `bold ${size}px Trebuchet MS, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 8; ctx.strokeStyle = stroke; ctx.strokeText(text, w / 2, c.height / 2);
  ctx.fillStyle = color; ctx.fillText(text, w / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  const h = 0.55 * scale;
  sp.scale.set((h * w) / c.height, h, 1);
  sp.renderOrder = 10;
  return sp;
}

function waterTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3fb8ec';
  ctx.fillRect(0, 0, 256, 256);
  const rnd = mulberry(7);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 256, y = rnd() * 256, l = 20 + rnd() * 40;
    ctx.lineWidth = 2 + rnd() * 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + l / 2, y + 6 - rnd() * 12, x + l, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function signTexture(text, bg) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#8a4b1c'; ctx.lineWidth = 12; ctx.strokeRect(6, 6, 500, 116);
  ctx.font = 'bold 72px Impact, Trebuchet MS, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 10; ctx.strokeStyle = '#7a3b10'; ctx.strokeText(text, 256, 68);
  ctx.fillStyle = '#ffe14d'; ctx.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- characters ----------
function makeCharacter(type) {
  const info = CHAR_INFO[type] || CHAR_INFO.frog;
  const g = new THREE.Group();
  const skin = lambert(info.color);
  const belly = lambert(new THREE.Color(info.color).lerp(new THREE.Color(0xffffff), 0.45));
  const white = lambert(0xffffff), black = lambert(0x1a1a1a);
  const sph = (r, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true;
    g.add(m); return m;
  };
  // Character faces local +x (that's the direction its fart pushes the raft).
  sph(0.62, skin, 0, 0.72, 0, 1, 1.05, 1);              // body
  sph(0.42, belly, 0.32, 0.68, 0, 0.6, 0.9, 0.85);      // belly
  sph(0.34, skin, -0.42, 0.45, 0, 1, 0.8, 1.2);         // butt
  sph(0.48, skin, 0.12, 1.5, 0, 1, 0.95, 1);            // head
  sph(0.16, skin, 0.38, 0.85, 0.55);                    // arms
  sph(0.16, skin, 0.38, 0.85, -0.55);
  sph(0.18, skin, 0.2, 0.15, 0.32, 1.3, 0.7, 1);        // feet
  sph(0.18, skin, 0.2, 0.15, -0.32, 1.3, 0.7, 1);

  const eye = (z, y = 1.62, x = 0.5, r = 0.11) => {
    sph(r, white, x, y, z);
    sph(r * 0.55, black, x + r * 0.7, y, z);
  };

  if (type === 'frog') {
    sph(0.2, skin, 0.22, 1.9, 0.2); sph(0.2, skin, 0.22, 1.9, -0.2);
    eye(0.2, 1.95, 0.36, 0.13); eye(-0.2, 1.95, 0.36, 0.13);
    sph(0.3, lambert(0x4f9e33), 0.5, 1.38, 0, 0.3, 0.12, 1.1); // mouth
  } else if (type === 'hippo') {
    sph(0.36, belly, 0.5, 1.38, 0, 0.9, 0.75, 1.1);           // snout
    sph(0.05, black, 0.8, 1.45, 0.12); sph(0.05, black, 0.8, 1.45, -0.12);
    sph(0.1, skin, 0.0, 1.95, 0.28); sph(0.1, skin, 0.0, 1.95, -0.28);
    eye(0.2, 1.7, 0.42); eye(-0.2, 1.7, 0.42);
  } else if (type === 'bear') {
    sph(0.22, belly, 0.5, 1.42, 0, 1, 0.8, 1);                // snout
    sph(0.08, black, 0.7, 1.5, 0);
    sph(0.16, skin, 0.0, 1.95, 0.32); sph(0.16, skin, 0.0, 1.95, -0.32);
    eye(0.18, 1.66, 0.48, 0.09); eye(-0.18, 1.66, 0.48, 0.09);
  } else {
    sph(0.3, lambert(0xc98448), 0.46, 1.42, 0, 1.1, 0.8, 0.9); // snout
    sph(0.06, black, 0.78, 1.5, 0.1); sph(0.06, black, 0.78, 1.5, -0.1);
    sph(0.09, skin, -0.05, 1.92, 0.3); sph(0.09, skin, -0.05, 1.92, -0.3);
    eye(0.22, 1.66, 0.4, 0.08); eye(-0.22, 1.66, 0.4, 0.08);
  }
  return g;
}

// ---------- particles ----------
class Puffs {
  constructor(scene) {
    this.scene = scene;
    this.geo = new THREE.IcosahedronGeometry(0.5, 1);
    this.pool = [];
    this.live = [];
  }
  spawn(pos, vel, color, life, grow) {
    let p = this.pool.pop();
    if (!p) {
      p = new THREE.Mesh(this.geo, new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false }));
      this.scene.add(p);
    }
    p.visible = true;
    p.material.color.setHex(color);
    p.material.opacity = 0.9;
    p.position.copy(pos);
    p.userData = { vel: vel.clone(), life, age: 0, grow, s0: 0.35 + Math.random() * 0.3 };
    p.scale.setScalar(p.userData.s0);
    this.live.push(p);
  }
  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i], u = p.userData;
      u.age += dt;
      const k = u.age / u.life;
      if (k >= 1) {
        p.visible = false;
        this.live.splice(i, 1);
        this.pool.push(p);
        continue;
      }
      u.vel.multiplyScalar(Math.exp(-2.5 * dt));
      p.position.addScaledVector(u.vel, dt);
      p.scale.setScalar(u.s0 + u.grow * k);
      p.material.opacity = 0.85 * (1 - k * k);
    }
  }
}

export class Renderer {
  constructor(canvas, track) {
    this.track = track;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9edcff);
    this.scene.fog = new THREE.Fog(0x9edcff, 70, 190);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
    this.camPos = null;
    this.camLook = new THREE.Vector3();

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xc7a27a, 1.4));
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -25; sc.right = sc.top = 25; sc.near = 1; sc.far = 80;
    this.scene.add(this.sun, this.sun.target);

    this.puffs = new Puffs(this.scene);
    this.buildWorld();
    this.buildRaft();
    this.charMeshes = new Map(); // slot -> { group, char, name }

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait phones need a wider view so the river fits.
    this.camera.fov = w < h ? 72 : 55;
    this.camera.updateProjectionMatrix();
  }

  buildWorld() {
    const tr = this.track, smp = tr.samples, half = tr.width / 2;
    const scene = this.scene;

    // Ground far below.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), lambert(0xf3c98f));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -6, -200);
    ground.receiveShadow = true;
    scene.add(ground);

    // Water ribbon.
    this.waterTex = waterTexture();
    this.waterTex.repeat.set(1, 1);
    {
      const pos = [], uv = [], idx = [];
      const w = half + 1;
      smp.forEach((p, i) => {
        pos.push(p.x - p.nx * w, 0, p.y - p.ny * w, p.x + p.nx * w, 0, p.y + p.ny * w);
        uv.push(0, p.s / 14, 1, p.s / 14);
        if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: this.waterTex, side: THREE.DoubleSide }));
      m.receiveShadow = true;
      scene.add(m);
    }

    // Banks: rail strip on the inner edge, sandy plateau behind, drop to the ground.
    const H = 1.4, TOP = 9;
    for (const side of [-1, 1]) {
      const prof = [ // [lateral offset from centre, height]
        [half, -0.5], [half, H], [half + 0.2, H + 0.5], [half + 1.4, H + 0.5], [half + 1.6, H],
        [half + TOP, H], [half + TOP + 1, -6],
      ];
      const pos = [], col = [], idx = [];
      const cRail = new THREE.Color(COLORS.rail), cWall = new THREE.Color(COLORS.wall), cSand = new THREE.Color(COLORS.sand);
      const pc = [cWall, cWall, cRail, cRail, cSand, cSand, cWall];
      const n = prof.length;
      smp.forEach((p, i) => {
        prof.forEach(([o, h], k) => {
          pos.push(p.x + p.nx * o * side, h, p.y + p.ny * o * side);
          col.push(pc[k].r, pc[k].g, pc[k].b);
        });
        if (i > 0) {
          for (let k = 0; k < n - 1; k++) {
            const a = (i - 1) * n + k, b = i * n + k;
            if (side > 0) idx.push(a, b, a + 1, a + 1, b, b + 1);
            else idx.push(a, a + 1, b, a + 1, b + 1, b);
          }
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      m.receiveShadow = true;
      scene.add(m);
    }

    // End caps so the river doesn't look open.
    for (const s of [0, tr.length]) {
      const p = sampleAt(tr, s);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(tr.width + 2, 3, 1.5), lambert(COLORS.wall));
      cap.position.set(p.x, 0.6, p.y);
      cap.rotation.y = rotY(Math.atan2(p.ny, p.nx));
      scene.add(cap);
    }

    // Spiky walls: pink strip + white cones pointing into the river.
    const spikes = [];
    const strips = [];
    for (const w of tr.spikyWalls) {
      for (let s = w.s0; s <= w.s1; s += 1.6) spikes.push({ s, side: w.side });
      for (let s = w.s0; s < w.s1; s += 2) strips.push({ s: s + 1, side: w.side });
    }
    const coneGeo = new THREE.ConeGeometry(0.32, 1.0, 10);
    coneGeo.rotateZ(-Math.PI / 2); // point along +x
    const spikeMesh = new THREE.InstancedMesh(coneGeo, lambert(COLORS.spike), spikes.length);
    const stripMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2.05, 1.3, 0.5), lambert(COLORS.pink), strips.length);
    const dummy = new THREE.Object3D();
    spikes.forEach((sp, i) => {
      const p = sampleAt(tr, sp.s);
      const o = half - 0.55;
      dummy.position.set(p.x + p.nx * o * sp.side, 0.75, p.y + p.ny * o * sp.side);
      dummy.rotation.set(0, rotY(Math.atan2(-p.ny * sp.side, -p.nx * sp.side)), 0);
      dummy.updateMatrix();
      spikeMesh.setMatrixAt(i, dummy.matrix);
    });
    strips.forEach((st, i) => {
      const p = sampleAt(tr, st.s);
      const o = half - 0.1;
      dummy.position.set(p.x + p.nx * o * st.side, 0.75, p.y + p.ny * o * st.side);
      dummy.rotation.set(0, rotY(Math.atan2(p.ty, p.tx)), 0);
      dummy.updateMatrix();
      stripMesh.setMatrixAt(i, dummy.matrix);
    });
    scene.add(spikeMesh, stripMesh);

    // Obstacles.
    this.obstacleMeshes = tr.obstacles.map((ob) => {
      const g = new THREE.Group();
      const len = ob.half * 2;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 1.1, 1.0), lambert(COLORS.pink));
      bar.castShadow = true;
      g.add(bar);
      const cg = new THREE.ConeGeometry(0.26, 0.8, 8);
      for (let x = -ob.half + 0.4; x <= ob.half - 0.3; x += 0.8) {
        for (const z of [-1, 1]) {
          const c = new THREE.Mesh(cg, lambert(COLORS.spike));
          c.position.set(x, 0, z * 0.85);
          c.rotation.x = z * Math.PI / 2;
          g.add(c);
        }
        const top = new THREE.Mesh(cg, lambert(COLORS.spike));
        top.position.set(x, 0.85, 0);
        g.add(top);
      }
      for (const end of [-1, 1]) {
        const c = new THREE.Mesh(cg, lambert(COLORS.spike));
        c.position.set(end * (ob.half + 0.35), 0, 0);
        c.rotation.z = -end * Math.PI / 2;
        g.add(c);
      }
      if (ob.type === 'spinner') {
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 2.2, 14), lambert(0xffffff));
        hub.position.y = -0.4;
        g.add(hub);
      }
      g.position.y = 0.8;
      scene.add(g);
      return { ob, g };
    });

    // Checkpoint + finish arches.
    const arch = (s, text, bg) => {
      const p = sampleAt(tr, s);
      const g = new THREE.Group();
      const postMat = lambert(0xd9a441);
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 8, 10), postMat);
        post.position.set(side * (half + 0.8), 4, 0);
        post.castShadow = true;
        g.add(post);
      }
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(tr.width + 2.4, 2.4, 0.4),
        [postMat, postMat, postMat, postMat,
          new THREE.MeshBasicMaterial({ map: signTexture(text, bg) }),
          new THREE.MeshBasicMaterial({ map: signTexture(text, bg) })],
      );
      sign.position.y = 7.5;
      g.add(sign);
      g.position.set(p.x, 0, p.y);
      g.rotation.y = rotY(Math.atan2(p.ny, p.nx));
      scene.add(g);
    };
    tr.checkpoints.slice(1).forEach((s) => arch(s, 'CHECK POINT', '#f08a3c'));
    arch(tr.finishS, 'FINISH', '#e45bb5');

    // Scenery: trees and rocks on the plateaus.
    const rnd = mulberry(42);
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.6, 6);
    const leafGeo = new THREE.IcosahedronGeometry(1.3, 0);
    const rockGeo = new THREE.DodecahedronGeometry(0.9, 0);
    const trunkMat = lambert(0x9a6a3c), leafMat = lambert(0x5fb24a, { flatShading: true }), rockMat = lambert(0xc9a98a, { flatShading: true });
    for (let s = 4; s < tr.length; s += 5) {
      const p = sampleAt(tr, s);
      for (const side of [-1, 1]) {
        if (rnd() < 0.45) continue;
        const o = half + 3 + rnd() * 5;
        const x = p.x + p.nx * o * side, z = p.y + p.ny * o * side;
        // Skip spots that would poke into another stretch of river.
        const tooClose = tr.samples.some((q) => Math.abs(q.s - s) > 20 && (q.x - x) ** 2 + (q.y - z) ** 2 < (half + 2) ** 2);
        if (tooClose) continue;
        if (rnd() < 0.65) {
          const t = new THREE.Mesh(trunkGeo, trunkMat);
          t.position.set(x, 2.2, z);
          const l = new THREE.Mesh(leafGeo, leafMat);
          l.position.set(x, 3.6, z);
          l.scale.setScalar(0.8 + rnd() * 0.6);
          t.castShadow = l.castShadow = true;
          scene.add(t, l);
        } else {
          const r = new THREE.Mesh(rockGeo, rockMat);
          r.position.set(x, 1.8, z);
          r.scale.set(1 + rnd(), 0.6 + rnd() * 0.6, 1 + rnd());
          r.rotation.y = rnd() * 6;
          scene.add(r);
        }
      }
    }
  }

  buildRaft() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(RAFT_R - 0.35, 0.42, 14, 36), lambert(COLORS.raftRing));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.25;
    ring.castShadow = true;
    g.add(ring);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(RAFT_R - 0.4, RAFT_R - 0.4, 0.25, 32), lambert(COLORS.raftFloor));
    floor.position.y = 0.2;
    floor.receiveShadow = true;
    g.add(floor);
    for (let i = 0; i < 6; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, (RAFT_R - 0.5) * 2), lambert(0x6f9e44));
      plank.position.set(-1.6 + i * 0.64, 0.335, 0);
      g.add(plank);
    }
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.5), lambert(COLORS.bumper));
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      b.position.set(Math.cos(a) * (RAFT_R - 0.3), 0.35, Math.sin(a) * (RAFT_R - 0.3));
      b.rotation.y = -a;
      g.add(b);
    }
    this.raft = g;
    this.scene.add(g);
  }

  syncCharacters(players) {
    const seen = new Set();
    for (const p of players) {
      seen.add(p.slot);
      let c = this.charMeshes.get(p.slot);
      if (c && (c.char !== p.char || c.name !== p.name)) {
        this.raft.remove(c.group);
        c = null;
      }
      if (!c) {
        const group = makeCharacter(p.char);
        const label = textSprite(p.name);
        label.position.y = 2.6;
        group.add(label);
        this.raft.add(group);
        c = { group, char: p.char, name: p.name };
        this.charMeshes.set(p.slot, c);
      }
      c.group.position.set(Math.cos(p.seat) * p.seatR, 0.3, Math.sin(p.seat) * p.seatR);
      c.group.rotation.y = rotY(p.f);
      c.player = p;
    }
    for (const [slot, c] of this.charMeshes) {
      if (!seen.has(slot)) { this.raft.remove(c.group); this.charMeshes.delete(slot); }
    }
  }

  // Called for sim events; state is the current interpolated snapshot.
  onEvent(ev, state) {
    const r = state.raft;
    if (ev.type === 'fart') {
      const p = state.players.find((q) => q.slot === ev.slot);
      if (!p) return;
      const fa = r.a + p.f;
      const sx = r.x + Math.cos(r.a + p.seat) * p.seatR - Math.cos(fa) * 0.7;
      const sz = r.y + Math.sin(r.a + p.seat) * p.seatR - Math.sin(fa) * 0.7;
      const pos = new THREE.Vector3(sx, 0.8, sz);
      for (let i = 0; i < 14; i++) {
        const sp = 4 + Math.random() * 5;
        const ang = fa + Math.PI + (Math.random() - 0.5) * 0.9;
        const vel = new THREE.Vector3(Math.cos(ang) * sp, 0.6 + Math.random() * 1.6, Math.sin(ang) * sp);
        this.puffs.spawn(pos, vel, Math.random() < 0.5 ? 0xa8e22c : 0xc6f04a, 1.1 + Math.random() * 0.5, 1.4 + Math.random());
      }
    } else if (ev.type === 'pop') {
      const pos = new THREE.Vector3(ev.x, 0.5, ev.y);
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 6;
        const vel = new THREE.Vector3(Math.cos(a) * sp, 3 + Math.random() * 5, Math.sin(a) * sp);
        this.puffs.spawn(pos, vel, i % 3 ? 0xffffff : 0xf8dcb4, 0.9 + Math.random() * 0.4, 0.6);
      }
    }
  }

  render(state, dt) {
    const tr = this.track, r = state.raft;
    this.syncCharacters(state.players);

    // Raft pose with a little bob.
    this.raft.visible = !r.dead;
    this.raft.position.set(r.x, Math.sin(state.t * 2.4) * 0.06, r.y);
    this.raft.rotation.y = rotY(r.a);
    this.raft.rotation.x = Math.sin(state.t * 1.7) * 0.03;
    // Blink while the respawn shield is up.
    if (r.shield > 0 && r.shield < 10 && !r.dead) this.raft.visible = Math.floor(state.t * 10) % 2 === 0;

    // Characters wobble; squash when they just farted.
    for (const c of this.charMeshes.values()) {
      const p = c.player;
      const kick = p.cd > 0.35 ? (p.cd - 0.35) / 0.2 : 0;
      c.group.scale.set(1 + kick * 0.15, 1 - kick * 0.18, 1 + kick * 0.15);
      c.group.position.y = 0.3 + Math.abs(Math.sin(state.t * 3 + p.slot)) * 0.05;
    }

    for (const { ob, g } of this.obstacleMeshes) {
      const o = obstaclePose(tr, ob, state.t);
      g.position.x = o.cx;
      g.position.z = o.cy;
      g.rotation.y = rotY(Math.atan2(o.dy, o.dx));
    }

    this.waterTex.offset.y = -state.t * 0.3;
    this.puffs.update(dt);

    // Camera follows the river direction behind the raft (not the raft's spin).
    const sm = sampleAt(tr, r.si);
    const ahead = sampleAt(tr, r.si + 8);
    const fx = ahead.x - sm.x, fz = ahead.y - sm.y;
    const fl = Math.hypot(fx, fz) || 1;
    const dir = new THREE.Vector3(fx / fl, 0, fz / fl);
    const portrait = this.camera.aspect < 1;
    const back = portrait ? 15 : 13, up = portrait ? 15 : 10;
    const target = new THREE.Vector3(r.x, 0, r.y);
    const want = target.clone().addScaledVector(dir, -back).setY(up);
    const look = target.clone().addScaledVector(dir, 6);
    const k = 1 - Math.exp(-4 * dt);
    if (!this.camPos) { this.camPos = want.clone(); this.camLook.copy(look); }
    this.camPos.lerp(want, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    this.sun.position.set(r.x + 15, 30, r.y + 10);
    this.sun.target.position.set(r.x, 0, r.y);

    this.renderer.render(this.scene, this.camera);
  }
}
