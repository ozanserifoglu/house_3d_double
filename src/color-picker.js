// In-page colour picker for every <input type="color">.
//
// The browser's own picker (on Windows: the system colour dialog) shows a
// fixed palette and doesn't open on the current colour, so small tweaks are
// awkward. This one opens on the input's current colour, offers the recently
// picked colours, and drives the original input: `input` events while
// picking (live preview), one `change` event on close if the colour changed
// (so the global change listener records a single undo step).

const RECENT_KEY = 'rp3d_recent_colors';
const RECENT_MAX = 12;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = ((h * 60) + 360) % 360;
  }
  return [h, max ? d / max : 0, max];
}
function hsvToRgb(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return 255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)));
  };
  return [f(5), f(3), f(1)];
}

export function attachColorPickers(store) {
  let recent = [];
  try {
    recent = JSON.parse(store.get(RECENT_KEY) || '[]').filter((c) => hexToRgb(c));
  } catch {}

  const pop = document.createElement('div');
  pop.className = 'cp';
  pop.innerHTML = `
    <div class="cp-sv"><div class="cp-sv-dot"></div></div>
    <div class="cp-hue"><div class="cp-hue-dot"></div></div>
    <div class="cp-row"><span class="cp-now"></span><input class="cp-hex" type="text" maxlength="7" spellcheck="false"><button class="btn cp-done" type="button">Done</button></div>
    <div class="cp-label">Recent</div>
    <div class="cp-recent"></div>`;
  pop.hidden = true;
  document.body.appendChild(pop);

  const sv = pop.querySelector('.cp-sv'), svDot = pop.querySelector('.cp-sv-dot');
  const hue = pop.querySelector('.cp-hue'), hueDot = pop.querySelector('.cp-hue-dot');
  const hexIn = pop.querySelector('.cp-hex'), now = pop.querySelector('.cp-now');
  const recentEl = pop.querySelector('.cp-recent');

  let target = null; // the <input type="color"> being edited
  let startValue = '';
  let hsv = [0, 0, 0];

  function render(skipHex) {
    const hex = rgbToHex(...hsvToRgb(...hsv));
    sv.style.background = `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${hsv[0]} 100% 50%))`;
    svDot.style.left = `${hsv[1] * 100}%`;
    svDot.style.top = `${(1 - hsv[2]) * 100}%`;
    hueDot.style.left = `${(hsv[0] / 360) * 100}%`;
    now.style.background = hex;
    if (!skipHex) hexIn.value = hex;
    return hex;
  }

  function renderRecent() {
    recentEl.innerHTML = recent.length
      ? recent.map((c) => `<button type="button" class="cp-sw" data-c="${c}" title="${c}" style="background:${c}"></button>`).join('')
      : '<span class="muted">Colours you pick show up here.</span>';
  }

  // Push the picker's colour into the input and let the app react live.
  function emit(skipHex) {
    const hex = render(skipHex);
    if (target.value === hex) return;
    target.value = hex;
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function setFromHex(hex, skipHex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return false;
    const [h, s, v] = rgbToHsv(...rgb);
    // Keep the current hue when the colour is grey (hue is undefined there).
    hsv = [s && v ? h : hsv[0], s, v];
    return true;
  }

  function open(input) {
    if (target) close();
    target = input;
    startValue = input.value;
    setFromHex(input.value);
    render();
    renderRecent();
    pop.hidden = false;
    // Above the input (the panel sits at the bottom), kept on screen.
    const r = input.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    const left = Math.max(8, Math.min(r.left, innerWidth - pw - 8));
    const top = r.top - ph - 6 >= 8 ? r.top - ph - 6 : Math.min(r.bottom + 6, innerHeight - ph - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }

  function close() {
    if (!target) return;
    const input = target, value = input.value;
    target = null;
    pop.hidden = true;
    if (value === startValue) return;
    recent = [value, ...recent.filter((c) => c !== value)].slice(0, RECENT_MAX);
    store.set(RECENT_KEY, JSON.stringify(recent));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Drag inside a box; `fn(fx, fy)` gets 0..1 fractions.
  function dragArea(el, fn) {
    const at = (e) => {
      const r = el.getBoundingClientRect();
      fn(clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height));
    };
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      at(e);
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (el.hasPointerCapture(e.pointerId)) at(e);
    });
  }
  dragArea(sv, (fx, fy) => {
    hsv = [hsv[0], fx, 1 - fy];
    emit();
  });
  dragArea(hue, (fx) => {
    hsv = [Math.min(fx * 360, 359.9), hsv[1], hsv[2]];
    emit();
  });

  hexIn.addEventListener('input', () => {
    const v = hexIn.value.startsWith('#') ? hexIn.value : '#' + hexIn.value;
    if (setFromHex(v)) emit(true);
  });
  hexIn.addEventListener('blur', () => target && render());
  // The hex field's own `change` must not reach the app's undo listener.
  hexIn.addEventListener('change', (e) => e.stopPropagation());

  recentEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (b && setFromHex(b.dataset.c)) emit();
  });
  pop.querySelector('.cp-done').addEventListener('click', close);

  // Replace the native picker on every colour input.
  document.addEventListener('click', (e) => {
    const input = e.target.closest?.('input[type=color]');
    if (!input) return;
    e.preventDefault();
    if (target === input) close();
    else open(input);
  });
  // Tapping anywhere else (scene, panel, tabs) closes and commits.
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (target && !pop.contains(e.target) && e.target !== target) close();
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (e) => {
      if (!target) return;
      if (e.key === 'Escape') {
        // Esc = cancel: back to the colour it opened with.
        setFromHex(startValue);
        emit();
        close();
        e.stopPropagation();
      } else if (e.key === 'Enter') {
        close();
        e.stopPropagation();
      }
    },
    true,
  );
}
