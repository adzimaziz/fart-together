// Tiny synthesized sound effects (no audio files needed).
let ctx = null;
let noiseBuf = null;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

const PITCH = [1, 0.8, 0.65, 1.2];

export function playFart(slot = 0) {
  if (!ctx) return;
  const now = ctx.currentTime;
  const dur = 0.28 + Math.random() * 0.25;
  const base = 75 * (PITCH[slot] || 1) * (0.85 + Math.random() * 0.3);

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(base * 1.3, now);
  osc.frequency.exponentialRampToValueAtTime(base * 0.7, now + dur);

  // Rapid flutter is what makes it sound like a fart.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 22 + Math.random() * 18;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = base * 0.5;
  lfo.connect(lfoGain).connect(osc.frequency);

  const flutter = ctx.createGain();
  const flutterLfo = ctx.createOscillator();
  flutterLfo.type = 'square';
  flutterLfo.frequency.value = lfo.frequency.value;
  const flutterDepth = ctx.createGain();
  flutterDepth.gain.value = 0.35;
  flutterLfo.connect(flutterDepth).connect(flutter.gain);
  flutter.gain.value = 0.65;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  lp.Q.value = 4;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(0.5, now + 0.02);
  env.gain.setValueAtTime(0.5, now + dur * 0.6);
  env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  const ng = ctx.createGain();
  ng.gain.value = 0.25;
  const nlp = ctx.createBiquadFilter();
  nlp.type = 'lowpass';
  nlp.frequency.value = 400;

  osc.connect(flutter).connect(lp).connect(env);
  noise.connect(nlp).connect(ng).connect(env);
  env.connect(ctx.destination);

  for (const n of [osc, lfo, flutterLfo, noise]) { n.start(now); n.stop(now + dur + 0.05); }
}

function blip(freq, dur, type = 'square', vol = 0.15, slideTo = null) {
  if (!ctx) return;
  const now = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, now);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g).connect(ctx.destination);
  o.start(now);
  o.stop(now + dur);
}

export function playPop() {
  blip(500, 0.35, 'triangle', 0.3, 60);
  if (!ctx) return;
  const now = ctx.currentTime;
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.4, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
  n.connect(g).connect(ctx.destination);
  n.start(now);
  n.stop(now + 0.4);
}

export function playBeep(high = false) { blip(high ? 880 : 440, 0.18, 'square', 0.12); }
export function playCheckpoint() { blip(660, 0.12); setTimeout(() => blip(990, 0.2), 120); }
export function playFinish() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.25, 'square', 0.14), i * 140)); }
