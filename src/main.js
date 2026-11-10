import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CATALOG, BUILD } from './catalog.js';
import { clampToRoom, snapToWalls, snapOpeningToWall, footprintsOverlap } from './layout-math.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const DEG = Math.PI / 180;

// ---------- Storage: localStorage with in-memory fallback ----------
const memoryStore = {};
const store = {
  get(key) {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) return v;
    } catch {}
    return memoryStore[key] ?? null;
  },
  set(key, value) {
    memoryStore[key] = value;
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
};

// ---------- State (all lengths in cm) ----------
const room = { w: 500, d: 400, h: 260, floor: '#c9b79c', wall: '#f2efe9', light: 'day', snap: 5 };
// Item: { id, type, w, d, h, y (lift), x, z, rot (deg), color, obj }
let items = [];
let selected = null;
let nextId = 1;

// ---------- Renderer, scene, camera, lights ----------
const view = $('#view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.prepend(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 10, 6000);

const hemi = new THREE.HemisphereLight(0xffffff, 0xb8a98f, 1);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff6e5, 1.8);
sun.position.set(300, 700, 250);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 2500;
scene.add(sun, sun.target);

const roomGroup = new THREE.Group();
scene.add(roomGroup);
let walls = []; // { m: Mesh, nx, nz } — nx/nz is the wall's outward side

// ---------- Pointer: drag furniture on the floor ----------
// Registered (capture phase) before OrbitControls so it can disable
// orbiting before the controls see the same pointerdown.
let drag = null; // { it, ox, oz, moved }
let press = null; // { x, y, hit } — to tell a tap on empty space from an orbit
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

function setRayFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  pointerNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
}

function itemIdFromObject(o) {
  for (; o; o = o.parent) {
    if (o.userData && o.userData.itemId) return o.userData.itemId;
  }
  return null;
}

canvas.addEventListener(
  'pointerdown',
  (e) => {
    setRayFromEvent(e);
    const hits = raycaster.intersectObjects(items.map((it) => it.obj), true);
    press = { x: e.clientX, y: e.clientY, hit: false };
    if (!hits.length) return;
    const id = itemIdFromObject(hits[0].object);
    const it = items.find((i) => i.id === id);
    if (!it) return;
    press.hit = true;
    select(it, true);
    if (raycaster.ray.intersectPlane(floorPlane, hitPoint)) {
      drag = { it, ox: hitPoint.x - it.x, oz: hitPoint.z - it.z, moved: false };
      controls.enabled = false;
    }
  },
  true,
);

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  setRayFromEvent(e);
  if (!raycaster.ray.intersectPlane(floorPlane, hitPoint)) return;
  const it = drag.it;
  let x = hitPoint.x - drag.ox, z = hitPoint.z - drag.oz;
  const s = room.snap;
  if (s > 0) {
    x = Math.round(x / s) * s;
    z = Math.round(z / s) * s;
  }
  it.x = x;
  it.z = z;
  if (CATALOG[it.type].opening) snapOpeningToWall(it, room);
  else snapToWalls(it, room);
  clampToRoom(it, room);
  applyTransform(it);
  drag.moved = true;
  computeOverlaps();
  refreshOutlines();
  refreshItemPanel();
});

window.addEventListener('pointerup', (e) => {
  if (drag) {
    if (drag.moved) {
      scheduleAutosave();
      checkpoint();
    }
    drag = null;
    controls.enabled = true;
  } else if (press && !press.hit && e && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5) {
    select(null); // tap on empty space deselects
  }
  press = null;
});

window.addEventListener('pointercancel', () => {
  if (drag) {
    drag = null;
    controls.enabled = true;
  }
  press = null;
});

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.minDistance = 40;

// ---------- Items ----------
function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
}

// (Re)build the item's three.js group from its type/size/color.
function rebuildItem(it) {
  if (it.obj) {
    scene.remove(it.obj);
    disposeObject(it.obj);
  }
  const g = new THREE.Group();
  BUILD[it.type](g, it.w, it.d, it.h, it.color);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = !CATALOG[it.type].noCol || it.type === 'door';
      o.receiveShadow = true;
    }
  });
  g.userData.itemId = it.id;
  it.obj = g;
  scene.add(g);
  applyTransform(it);
  applyLighting(); // new lamps need their intensity set
}

function applyTransform(it) {
  it.obj.position.set(it.x, it.y || 0, it.z);
  it.obj.rotation.y = it.rot * DEG;
}

function addItem(type, props) {
  const def = CATALOG[type];
  const it = {
    id: nextId++,
    type,
    w: def.w,
    d: def.d,
    h: def.h,
    y: def.y || 0,
    x: 0,
    z: 0,
    rot: 0,
    color: def.color,
    ...(props || {}),
  };
  items.push(it);
  rebuildItem(it);
  return it;
}

function removeItem(it) {
  scene.remove(it.obj);
  disposeObject(it.obj);
  items = items.filter((i) => i !== it);
}

// ---------- Overlap detection + outlines ----------
let overlapping = new Set();

function computeOverlaps() {
  overlapping = new Set();
  const solid = items.filter((it) => !CATALOG[it.type].noCol);
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i], b = solid[j];
      const verticalOverlap = a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
      if (verticalOverlap && footprintsOverlap(a, b)) {
        overlapping.add(a.id);
        overlapping.add(b.id);
      }
    }
  }
}

let outlines = [];

function refreshOutlines() {
  outlines.forEach((o) => {
    scene.remove(o);
    o.geometry.dispose();
    o.material.dispose();
  });
  outlines = [];
  const outline = (it, color) => {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(it.w + 2, it.h + 2, it.d + 2));
    const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }));
    line.position.set(it.x, (it.y || 0) + it.h / 2, it.z);
    line.rotation.y = it.rot * DEG;
    line.renderOrder = 10;
    scene.add(line);
    outlines.push(line);
  };
  items.forEach((it) => {
    if (overlapping.has(it.id)) outline(it, 0xff5a4d);
  });
  if (selected) outline(selected, 0xffd24a);
}

// ---------- Lighting presets ----------
const LIGHTING = {
  day: { bg: '#dbe6f0', hemi: 1, hemiSky: '#ffffff', hemiGnd: '#b8a98f', sun: 1.8, sunCol: '#fff6e5', lamp: 0 },
  evening: { bg: '#2c2740', hemi: 0.5, hemiSky: '#ffcfa0', hemiGnd: '#4a3a46', sun: 0.7, sunCol: '#ff9f5a', lamp: 140 },
  night: { bg: '#0c0f1d', hemi: 0.16, hemiSky: '#6f86ff', hemiGnd: '#1a1a28', sun: 0.12, sunCol: '#7f94ff', lamp: 240 },
};

function applyLighting() {
  const p = LIGHTING[room.light];
  scene.background = new THREE.Color(p.bg);
  hemi.intensity = p.hemi;
  hemi.color.set(p.hemiSky);
  hemi.groundColor.set(p.hemiGnd);
  sun.intensity = p.sun;
  sun.color.set(p.sunCol);
  items.forEach((it) => {
    if (!it.obj) return;
    it.obj.traverse((o) => {
      if (o.userData.lampLight) o.intensity = p.lamp;
    });
  });
}

// ---------- Room ----------
// 50 cm floor tiles drawn on a canvas.
function makeFloorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = room.floor;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(room.w / 50, room.d / 50);
  tex.anisotropy = 4;
  return tex;
}

function buildRoom() {
  roomGroup.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (o.material.map) o.material.map.dispose();
      o.material.dispose();
    }
  });
  roomGroup.clear();
  walls = [];

  const { w, d, h } = room;
  const t = 12; // wall thickness; walls sit outside the room bounds

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: makeFloorTexture(), roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  roomGroup.add(floor);

  [
    { nx: 0, nz: -1, size: [w + t * 2, h, t], pos: [0, h / 2, -d / 2 - t / 2] },
    { nx: 0, nz: 1, size: [w + t * 2, h, t], pos: [0, h / 2, d / 2 + t / 2] },
    { nx: -1, nz: 0, size: [t, h, d], pos: [-w / 2 - t / 2, h / 2, 0] },
    { nx: 1, nz: 0, size: [t, h, d], pos: [w / 2 + t / 2, h / 2, 0] },
  ].forEach((spec) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...spec.size), new THREE.MeshStandardMaterial({ color: room.wall, roughness: 0.95 }));
    m.position.set(...spec.pos);
    m.receiveShadow = true;
    roomGroup.add(m);
    walls.push({ m, nx: spec.nx, nz: spec.nz });
  });

  // Skirting boards: stay visible when walls auto-hide.
  const skirting = '#d9d4ca';
  [
    [w, 6, 3, 0, 3, -d / 2 + 1.5],
    [w, 6, 3, 0, 3, d / 2 - 1.5],
    [3, 6, d, -w / 2 + 1.5, 3, 0],
    [3, 6, d, w / 2 - 1.5, 3, 0],
  ].forEach(([sw, sh, sd, x, y, z]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), new THREE.MeshStandardMaterial({ color: skirting, roughness: 0.9 }));
    m.position.set(x, y, z);
    roomGroup.add(m);
  });

  // Fit the sun's shadow frustum to the room.
  const ext = Math.max(w, d) * 0.75;
  const sc = sun.shadow.camera;
  sc.left = -ext;
  sc.right = ext;
  sc.top = ext;
  sc.bottom = -ext;
  sc.updateProjectionMatrix();
}

// ---------- Camera presets ----------
function setView(kind) {
  const { w, d } = room;
  const maxSide = Math.max(w, d);
  controls.minPolarAngle = 0;
  if (kind === 'top') {
    camera.fov = 40;
    camera.updateProjectionMatrix();
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(d / 2 / tan, w / 2 / (tan * camera.aspect)) * 1.12 + 40;
    camera.position.set(0, dist, 0.01);
    controls.target.set(0, 0, 0);
  } else if (kind === 'eye') {
    camera.fov = 70;
    camera.updateProjectionMatrix();
    camera.position.set(0, 165, d / 2 - 25);
    controls.target.set(0, 125, -d / 2);
  } else {
    camera.fov = 45;
    camera.updateProjectionMatrix();
    const pullBack = 1 + Math.max(0, 1.15 - camera.aspect) * 1.3; // more room on narrow screens
    camera.position.set(w * 0.55 * pullBack, maxSide * 0.95 * pullBack, d * 0.95 * pullBack);
    controls.target.set(0, 40, 0);
  }
  controls.update();
}

// ---------- UI ----------
function showTab(name) {
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $$('.tab').forEach((t) => t.classList.toggle('on', t.id === 'tab-' + name));
}

function select(it, openItemTab) {
  selected = it;
  refreshOutlines();
  refreshItemPanel();
  if (it && openItemTab) showTab('item');
}

// Don't overwrite a field the user is typing in.
function setIfNotFocused(input, value) {
  if (document.activeElement !== input) input.value = value;
}

function refreshItemPanel() {
  const has = !!selected;
  $('#item-empty').style.display = has ? 'none' : 'block';
  $('#item-form').style.display = has ? 'block' : 'none';
  if (!has) return;
  $('#item-name').textContent = CATALOG[selected.type].label;
  $('#item-warn').textContent = overlapping.has(selected.id) ? 'overlapping something' : '';
  setIfNotFocused($('#f-w'), Math.round(selected.w));
  setIfNotFocused($('#f-d'), Math.round(selected.d));
  setIfNotFocused($('#f-h'), Math.round(selected.h));
  setIfNotFocused($('#f-y'), Math.round(selected.y || 0));
  setIfNotFocused($('#f-rot'), Math.round(selected.rot));
  setIfNotFocused($('#f-color'), selected.color);
}

// Call after any change to items: recheck overlaps, redraw, save.
function commit() {
  computeOverlaps();
  refreshOutlines();
  refreshItemPanel();
  scheduleAutosave();
}

const normDeg = (a) => ((a % 360) + 360) % 360;

function rotateSelected(delta) {
  selected.rot = normDeg(selected.rot + delta);
  clampToRoom(selected, room);
  applyTransform(selected);
  commit();
  checkpoint();
}

$('#catalog').innerHTML = Object.entries(CATALOG)
  .map(([type, def]) => `<button class="chip" data-add="${type}"><span>${def.label}</span><small>${def.w}×${def.d}×${def.h}</small></button>`)
  .join('');

$('#catalog').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-add]');
  if (!btn) return;
  const k = items.length % 5; // stagger new pieces so they don't stack exactly
  const it = addItem(btn.dataset.add, { x: (k - 2) * 20, z: (k - 2) * 20 });
  if (CATALOG[it.type].opening) {
    it.x = 0;
    it.z = -room.d / 2 + it.d / 2;
  }
  clampToRoom(it, room);
  applyTransform(it);
  select(it, true);
  commit();
  checkpoint();
});

function bindItemField(sel, key, min, max, rebuild) {
  $(sel).addEventListener('input', (e) => {
    if (!selected) return;
    let v = parseFloat(e.target.value);
    if (!isFinite(v)) return;
    v = Math.max(min, Math.min(max, v));
    selected[key] = v;
    if (rebuild) rebuildItem(selected);
    clampToRoom(selected, room);
    applyTransform(selected);
    commit();
  });
}
bindItemField('#f-w', 'w', 5, 1000, true);
bindItemField('#f-d', 'd', 3, 1000, true);
bindItemField('#f-h', 'h', 1, 500, true);
bindItemField('#f-y', 'y', 0, 400, false);

$('#f-rot').addEventListener('input', (e) => {
  if (!selected) return;
  const v = parseFloat(e.target.value);
  if (!isFinite(v)) return;
  selected.rot = normDeg(v);
  clampToRoom(selected, room);
  applyTransform(selected);
  commit();
});

$('#f-color').addEventListener('input', (e) => {
  if (!selected) return;
  selected.color = e.target.value;
  rebuildItem(selected);
  commit();
});

$$('[data-rot]').forEach((b) =>
  b.addEventListener('click', () => {
    if (selected) rotateSelected(parseFloat(b.dataset.rot));
  }),
);

$('#b-dup').addEventListener('click', () => {
  if (!selected) return;
  const s = selected;
  const copy = addItem(s.type, { w: s.w, d: s.d, h: s.h, y: s.y, x: s.x + 30, z: s.z + 30, rot: s.rot, color: s.color });
  clampToRoom(copy, room);
  applyTransform(copy);
  select(copy);
  commit();
  checkpoint();
});

$('#b-del').addEventListener('click', () => {
  if (!selected) return;
  removeItem(selected);
  selected = null;
  commit();
  checkpoint();
});

window.addEventListener('keydown', (e) => {
  // Inside text fields, leave Ctrl+Z etc. to the browser's own field undo.
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if (mod && key === 'y') {
    e.preventDefault();
    redo();
    return;
  }
  if (!selected) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    removeItem(selected);
    selected = null;
    commit();
    checkpoint();
  } else if (e.key === 'r' || e.key === 'R') {
    rotateSelected(e.shiftKey ? -15 : 15);
  }
});

function syncRoomInputs() {
  $('#r-w').value = room.w;
  $('#r-d').value = room.d;
  $('#r-h').value = room.h;
  $('#r-floor').value = room.floor;
  $('#r-wall').value = room.wall;
  $('#r-light').value = room.light;
  $('#r-snap').value = room.snap;
}

function onRoomSizeChanged() {
  buildRoom();
  items.forEach((it) => {
    clampToRoom(it, room);
    applyTransform(it);
  });
  commit();
}

[
  ['#r-w', 'w', 150, 2000],
  ['#r-d', 'd', 150, 2000],
  ['#r-h', 'h', 200, 500],
].forEach(([sel, key, min, max]) => {
  $(sel).addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!isFinite(v) || v < min || v > max) return; // ignore while typing out-of-range values
    room[key] = v;
    onRoomSizeChanged();
  });
});

$('#r-floor').addEventListener('input', (e) => {
  room.floor = e.target.value;
  buildRoom();
  scheduleAutosave();
});
$('#r-wall').addEventListener('input', (e) => {
  room.wall = e.target.value;
  buildRoom();
  scheduleAutosave();
});
$('#r-light').addEventListener('change', (e) => {
  room.light = e.target.value;
  applyLighting();
  scheduleAutosave();
});
$('#r-snap').addEventListener('change', (e) => {
  room.snap = parseFloat(e.target.value);
  scheduleAutosave();
});
$('#b-clear').addEventListener('click', () => {
  clearItems();
  commit();
  checkpoint();
});
$('#b-sample').addEventListener('click', () => {
  loadSample();
  commit();
  checkpoint();
});
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) showTab(b.dataset.tab);
});
$$('#views [data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

// ---------- Save / load ----------
const itemData = () => items.map(({ id, type, w, d, h, y, x, z, rot, color }) => ({ id, type, w, d, h, y, x, z, rot, color }));

function serialize() {
  return JSON.stringify({ room, items: itemData() });
}

function clearItems() {
  items.forEach((it) => {
    scene.remove(it.obj);
    disposeObject(it.obj);
  });
  items = [];
  selected = null;
}

function loadLayout(data) {
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;
  clearItems();
  Object.assign(room, parsed.room || {});
  buildRoom();
  syncRoomInputs();
  applyLighting();
  (parsed.items || []).forEach((src) => {
    if (!CATALOG[src.type]) return; // unknown type: skip
    const it = addItem(src.type, src);
    nextId = Math.max(nextId, (src.id || 0) + 1);
    it.id = src.id || it.id;
    it.obj.userData.itemId = it.id;
  });
  computeOverlaps();
  refreshOutlines();
  refreshItemPanel();
}

let autosaveTimer = null;
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => store.set('rp3d_auto', serialize()), 300);
}

function renderSlots() {
  $('#slots').innerHTML = ['A', 'B', 'C']
    .map((k) => {
      const saved = store.get('rp3d_slot_' + k);
      return `<div class="slot"><b>Layout ${k}</b><span class="tag">${saved ? 'saved' : ''}</span>
      <button class="btn" data-save="${k}">Save</button>
      <button class="btn pri" data-load="${k}" ${saved ? '' : 'disabled style="opacity:.4"'}>Load</button></div>`;
    })
    .join('');
}

$('#slots').addEventListener('click', (e) => {
  const save = e.target.closest('[data-save]');
  const load = e.target.closest('[data-load]');
  if (save) {
    store.set('rp3d_slot_' + save.dataset.save, serialize());
    renderSlots();
  }
  if (load) {
    const data = store.get('rp3d_slot_' + load.dataset.load);
    if (data) {
      loadLayout(data);
      scheduleAutosave();
      checkpoint();
    }
  }
});

$('#b-export').addEventListener('click', () => {
  $('#io').value = serialize();
  $('#io').select();
});
$('#b-import').addEventListener('click', () => {
  try {
    loadLayout($('#io').value);
    scheduleAutosave();
    checkpoint();
  } catch {
    $('#io').value = 'Could not read that text.';
  }
});
$('#b-copy').addEventListener('click', async () => {
  $('#io').value = $('#io').value || serialize();
  try {
    await navigator.clipboard.writeText($('#io').value);
  } catch {
    $('#io').select();
  }
});

function loadSample() {
  clearItems();
  room.w = 500;
  room.d = 400;
  room.h = 260;
  buildRoom();
  syncRoomInputs();
  const put = (type, x, z, rot, extra) => addItem(type, { x, z, rot, ...(extra || {}) });
  put('bed', -150, -110, 90, { color: '#8fa3b8' });
  put('wardrobe', 100, -172, 0);
  put('desk', 217, -60, 270);
  put('chair', 160, -60, 90);
  put('rug', -30, 80, 0);
  put('sofa', -30, 155, 180);
  put('coffee', -30, 70, 0);
  put('lamp', 160, 165, 0);
  put('plant', 220, 160, 0);
  put('window', -40, -196, 0);
  put('door', -200, 196, 180);
  items.forEach((it) => {
    clampToRoom(it, room);
    applyTransform(it);
  });
}

// ---------- Undo / redo: whole-layout snapshots ----------
// Each step is the layout JSON before a change. Lighting and snap are view
// preferences, so they are left out: undo keeps whatever is set now.
// Steps are recorded by checkpoint(): right after discrete actions, and on
// the 'change' event for typed/picked values (blur, Enter, picker closed),
// so typing "120" in a field is one step, not three.
const HISTORY_MAX = 100;
let undoStack = [];
let redoStack = [];
let lastState = null; // layout the stacks are relative to

function historyState() {
  const { light, snap, ...layoutRoom } = room;
  return JSON.stringify({ room: layoutRoom, items: itemData() });
}

function refreshUndoButtons() {
  $('#b-undo').disabled = !undoStack.length;
  $('#b-redo').disabled = !redoStack.length;
}

function checkpoint() {
  const now = historyState();
  if (lastState !== null && now !== lastState) {
    undoStack.push(lastState);
    if (undoStack.length > HISTORY_MAX) undoStack.shift();
    redoStack = [];
  }
  lastState = now;
  refreshUndoButtons();
}

function restoreState(state) {
  const keepId = selected && selected.id;
  loadLayout(state); // room in `state` has no light/snap, so those stay as they are
  lastState = historyState();
  select(items.find((i) => i.id === keepId) || null);
  scheduleAutosave();
  refreshUndoButtons();
}

function undo() {
  if (drag) return;
  checkpoint(); // record an edit that hasn't hit a checkpoint yet
  if (!undoStack.length) return;
  redoStack.push(lastState);
  restoreState(undoStack.pop());
}

function redo() {
  if (drag) return;
  checkpoint(); // a new edit since the last undo clears the redo stack
  if (!redoStack.length) return;
  undoStack.push(lastState);
  restoreState(redoStack.pop());
}

$('#b-undo').addEventListener('click', undo);
$('#b-redo').addEventListener('click', redo);
document.addEventListener('change', checkpoint);

// ---------- Resize + render loop ----------
function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);

function animate() {
  controls.update();
  // Hide walls between the camera and the room; hide all walls from (near) top view.
  const cam = camera.position, hw = room.w / 2, hd = room.d / 2;
  const topDown = controls.getPolarAngle() < 0.35;
  walls.forEach((wall) => {
    const camOutside =
      (wall.nz === -1 && cam.z < -hd) || (wall.nz === 1 && cam.z > hd) || (wall.nx === -1 && cam.x < -hw) || (wall.nx === 1 && cam.x > hw);
    wall.m.visible = !camOutside && !topDown;
  });
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// ---------- Boot ----------
buildRoom();
applyLighting();
const autosaved = store.get('rp3d_auto');
let restored = false;
if (autosaved) {
  try {
    loadLayout(autosaved);
    restored = true;
  } catch {}
}
if (!restored) loadSample();
syncRoomInputs();
renderSlots();
computeOverlaps();
refreshOutlines();
refreshItemPanel();
checkpoint(); // starting point for undo
resize();
setView('3d');
animate();
