// Keyboard, gamepad and touch input.
// Local mode: player i uses KEYMAPS[i] and gamepad i.
// Online mode: the single local player can use any of the keymaps, any gamepad and touch.

export const KEYMAPS = [
  { l: ['KeyA'], r: ['KeyD'], f: ['KeyW', 'KeyS'], label: 'A / D putar, W kentut' },
  { l: ['ArrowLeft'], r: ['ArrowRight'], f: ['ArrowUp', 'ArrowDown'], label: '← / → putar, ↑ kentut' },
  { l: ['KeyJ'], r: ['KeyL'], f: ['KeyI', 'KeyK'], label: 'J / L putar, I kentut' },
  { l: ['Numpad4', 'KeyF'], r: ['Numpad6', 'KeyH'], f: ['Numpad8', 'KeyT', 'KeyG'], label: 'F / H putar, T kentut (atau numpad 4/6/8)' },
];

const down = new Set();
const touch = { l: false, r: false, f: false };

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  down.add(e.code);
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
});
window.addEventListener('keyup', (e) => down.delete(e.code));
window.addEventListener('blur', () => down.clear());

const any = (codes) => codes.some((c) => down.has(c));

function pad(i) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const p = pads[i];
  if (!p || !p.connected) return null;
  const ax = p.axes[0] || 0;
  const b = (n) => !!p.buttons[n]?.pressed;
  return {
    l: ax < -0.4 || b(14) || b(4),
    r: ax > 0.4 || b(15) || b(5),
    f: b(0) || b(1) || b(7) || b(6),
  };
}

const merge = (a, b) => (b ? { l: a.l || b.l, r: a.r || b.r, f: a.f || b.f } : a);

export function localInput(i) {
  const m = KEYMAPS[i];
  return merge({ l: any(m.l), r: any(m.r), f: any(m.f) }, pad(i));
}

export function onlineInput() {
  let s = { l: false, r: false, f: down.has('Space') };
  for (const m of KEYMAPS) s = merge(s, { l: any(m.l), r: any(m.r), f: any(m.f) });
  for (let i = 0; i < 4; i++) s = merge(s, pad(i));
  return merge(s, touch);
}

export function bindTouch(root) {
  for (const btn of root.querySelectorAll('[data-k]')) {
    const k = btn.dataset.k;
    const on = (e) => { e.preventDefault(); touch[k] = true; btn.classList.add('down'); };
    const off = (e) => { e.preventDefault(); touch[k] = false; btn.classList.remove('down'); };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('pointerleave', off);
  }
}

export const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;
