import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CATALOG, BUILD, TOP_T, BACK_T, seatTop } from './catalog.js';
import { clampToRooms, snapToWalls, snapOpeningToWall, footprintsOverlap, pointInFootprint, backStrip } from './layout-math.js';
import { offsetPolygon, bounds, rectPts, asRect, signedArea, interiorPoint, pointInPolygon, normalizePolygon, polygonsOverlap } from './polygon.js';
import { pruneLocks, parseLocks, relocateLocks } from './locks.js';
import { createPlan } from './plan.js';
import { wallPieces } from './walls.js';
import { attachColorPickers } from './color-picker.js';

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

attachColorPickers(store);

// ---------- State (all lengths in cm) ----------
// View/drawing preferences, not part of undo history. innerWallT = the gap
// left between rooms when snapping one to another (the wall between them).
const settings = { light: 'day', snap: 5, innerWallT: 10 };
// Room: { id, name, pts: [[x, z], ...] inside outline (see polygon.js), h, floor, wall }
let rooms = [];
let nextRoomId = 1;
const WALL_T = 12; // outer wall thickness; walls sit outside the outline
const newRoom = (props) => ({ id: nextRoomId++, name: 'Room', pts: rectPts(500, 400), h: 260, floor: '#c9b79c', wall: '#f2efe9', locked: [], roomLock: false, ...props });
function nextRoomName() {
  let k = rooms.length + 1;
  while (rooms.some((r) => r.name === `Room ${k}`)) k++;
  return `Room ${k}`;
}
// The room the Room tab edits and Eye level stands in (UI state, not saved).
let selectedRoomId = null;
const currentRoom = () => rooms.find((r) => r.id === selectedRoomId) || rooms[0];
function selectRoom(id) {
  selectedRoomId = id;
  syncRoomInputs();
  plan.refresh();
}
// Would this outline overlap any room other than `exceptId`?
const overlapsOthers = (pts, exceptId) => rooms.some((r) => r.id !== exceptId && polygonsOverlap(pts, r.pts));
// Item: { id, type, w, d, h, y (lift), x, z, rot (deg), color, obj }
let items = [];
let selected = null;
let nextId = 1;

// ---------- Renderer, scene, camera, lights ----------
const view = $('#view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
// PCF (not PCFSoft) because only it honours shadow.radius: soft edges.
renderer.shadowMap.type = THREE.PCFShadowMap;
// Filmic tone mapping: highlights roll off instead of clipping.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
view.prepend(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 10, 6000);

// Soft studio-room environment: bounced light and gentle reflections on every
// standard material. Its strength per preset is set via envMapIntensity in
// applyLighting (three 0.160 has no scene.environmentIntensity).
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
pmrem.dispose();

const hemi = new THREE.HemisphereLight(0xffffff, 0xb8a98f, 1);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff6e5, 1.8);
sun.position.set(300, 700, 250);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.radius = 8; // texels of blur at the edges
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 2500;
scene.add(sun, sun.target);

const roomGroup = new THREE.Group();
scene.add(roomGroup);
let walls = []; // { m: Mesh, a: [x, z], nx, nz } — a point on the wall's inside face, and its outward normal

// ---------- Pointer: drag furniture on the floor ----------
// Registered (capture phase) before OrbitControls so it can disable
// orbiting before the controls see the same pointerdown.
let drag = null; // { it, ox, oz, moved, riders: [{ r, dx, dz }] }
let press = null; // { x, y, hit } — to tell a tap on empty space from an orbit
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

// Plan mode swaps in its own top-down orthographic camera and pan/zoom controls.
const activeCamera = () => (plan.active ? plan.camera : camera);
const activeControls = () => (plan.active ? plan.controls : controls);

function setRayFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  pointerNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, activeCamera());
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
    // Plan mode: corners, walls, length labels and drawing come first.
    if (plan.active && plan.pointerDown(e)) {
      press = null;
      return;
    }
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
      // A `top` piece carries what rests on it.
      const riders = restingOn(it).map((r) => ({ r, dx: r.x - it.x, dz: r.z - it.z }));
      drag = { it, ox: hitPoint.x - it.x, oz: hitPoint.z - it.z, moved: false, riders };
      activeControls().enabled = false;
    }
  },
  true,
);

canvas.addEventListener('pointermove', (e) => {
  if (plan.active && plan.pointerMove(e)) return;
  if (!drag) return;
  setRayFromEvent(e);
  if (!raycaster.ray.intersectPlane(floorPlane, hitPoint)) return;
  const it = drag.it;
  let x = hitPoint.x - drag.ox, z = hitPoint.z - drag.oz;
  const s = settings.snap;
  if (s > 0) {
    x = Math.round(x / s) * s;
    z = Math.round(z / s) * s;
  }
  it.x = x;
  it.z = z;
  if (CATALOG[it.type].opening) snapOpeningToWall(it, rooms);
  else snapToWalls(it, rooms);
  clampToRooms(it, rooms);
  settleOnTop(it);
  applyTransform(it);
  for (const { r, dx, dz } of drag.riders) {
    r.x = it.x + dx;
    r.z = it.z + dz;
    clampToRooms(r, rooms);
    applyTransform(r);
  }
  drag.moved = true;
  computeOverlaps();
  refreshOutlines();
  refreshItemPanel();
});

window.addEventListener('pointerup', (e) => {
  if (plan.active && plan.pointerUp(e)) {
    press = null;
    return;
  }
  if (drag) {
    if (drag.moved) {
      scheduleAutosave();
      checkpoint();
    }
    drag = null;
    activeControls().enabled = true;
  } else if (press && !press.hit && e && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5) {
    select(null); // tap on empty space deselects
  }
  press = null;
});

window.addEventListener('pointercancel', () => {
  if (plan.active) plan.pointerCancel();
  if (drag) {
    drag = null;
    activeControls().enabled = true;
  }
  press = null;
});

canvas.addEventListener('dblclick', (e) => {
  if (plan.active) plan.dblClick(e);
});

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.minDistance = 40;

const defaultHint = $('#hint').textContent;
const plan = createPlan({
  canvas,
  view,
  scene,
  wallT: WALL_T,
  getRooms: () => rooms,
  getSnap: () => settings.snap,
  getGap: () => settings.innerWallT,
  getSelectedRoomId: () => currentRoom().id,
  onSelectRoom: (id) => selectRoom(id),
  onLive: () => buildRooms(), // outline changing mid-drag
  onDone: () => {
    onRoomsChanged();
    checkpoint();
  },
  // A drawn outline replaces room `targetId`'s, or (null) becomes a new room.
  onDrawn: (pts, targetId) => {
    const target = rooms.find((r) => r.id === targetId);
    if (target) target.pts = pts;
    else {
      const from = currentRoom();
      const room = newRoom({ pts, name: nextRoomName(), h: from.h, floor: from.floor, wall: from.wall });
      rooms.push(room);
      selectedRoomId = room.id;
    }
    onRoomsChanged();
    checkpoint();
  },
  setHint: (text) => ($('#hint').textContent = text || defaultHint),
});

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

// ---------- Stacking (see the flags in catalog.js) ----------
// The `onTop` pieces resting on `top` piece s (centre over it, base on its top).
function restingOn(s) {
  if (!CATALOG[s.type].top) return [];
  return items.filter((r) => CATALOG[r.type].onTop && Math.abs(r.y - (s.y + s.h)) < 0.5 && pointInFootprint(r.x, r.z, s));
}

// An `onTop` piece rests on the highest `top` piece under its centre, else the floor.
function settleOnTop(it) {
  if (!CATALOG[it.type].onTop) return;
  it.y = 0;
  for (const s of items) {
    if (s !== it && CATALOG[s.type].top && pointInFootprint(it.x, it.z, s)) it.y = Math.max(it.y, s.y + s.h);
  }
}

// Chair `c` slid partly under table `t`: its seat clears the underside of
// the top and its backrest stays outside the table's footprint.
function tuckedUnder(c, t) {
  if (!CATALOG[c.type].tuck || !CATALOG[t.type].under) return false;
  return c.y + seatTop(c.h) <= t.y + t.h - TOP_T + 0.5 && !footprintsOverlap(backStrip(c, BACK_T), t);
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
      if (verticalOverlap && footprintsOverlap(a, b) && !tuckedUnder(a, b) && !tuckedUnder(b, a)) {
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
// env = environment (bounced light) strength, exposure = tone-mapping exposure.
const LIGHTING = {
  day: { bg: '#dbe6f0', hemi: 0.15, hemiSky: '#ffffff', hemiGnd: '#b8a98f', sun: 2.6, sunCol: '#fff3dc', lamp: 0, env: 0.3, exposure: 0.75 },
  evening: { bg: '#2c2740', hemi: 0.2, hemiSky: '#ffcfa0', hemiGnd: '#4a3a46', sun: 1.2, sunCol: '#ff9f5a', lamp: 260, env: 0.12, exposure: 0.8 },
  night: { bg: '#0c0f1d', hemi: 0.1, hemiSky: '#6f86ff', hemiGnd: '#1a1a28', sun: 0.15, sunCol: '#7f94ff', lamp: 320, env: 0.03, exposure: 0.9 },
};

// Also called after (re)building items or rooms: new materials need their
// environment strength, new lamps their intensity.
function applyLighting() {
  const p = LIGHTING[settings.light];
  scene.background = new THREE.Color(p.bg);
  renderer.toneMappingExposure = p.exposure;
  hemi.intensity = p.hemi;
  hemi.color.set(p.hemiSky);
  hemi.groundColor.set(p.hemiGnd);
  sun.intensity = p.sun;
  sun.color.set(p.sunCol);
  scene.traverse((o) => {
    if (o.userData.lampLight) o.intensity = p.lamp;
    if (o.material && o.material.isMeshStandardMaterial) o.material.envMapIntensity = p.env;
  });
}

// ---------- Room ----------
// 50 cm floor tiles drawn on a canvas. Floor UVs are in cm.
function makeFloorTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / 50, 1 / 50);
  tex.anisotropy = 4;
  return tex;
}

// Floor-plane polygon [[x, z], ...] → THREE.Shape. Shapes live in the xy
// plane, so z is stored as -y and the geometry is turned flat afterwards.
const toShape = (pts) => new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));

// Vertical prism over a floor-plane polygon, from y0 up `height` cm.
function prismGeometry(pts, y0, height) {
  const g = new THREE.ExtrudeGeometry(toShape(pts), { depth: height, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

function buildRooms() {
  roomGroup.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (o.material.map) o.material.map.dispose();
      o.material.dispose();
    }
  });
  roomGroup.clear();
  walls = [];

  rooms.forEach((r) => {
    const floorGeo = new THREE.ShapeGeometry(toShape(r.pts));
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ map: makeFloorTexture(r.floor), roughness: 0.9 }));
    floor.receiveShadow = true;
    roomGroup.add(floor);

    // Skirting boards (6 cm high, 3 cm deep) along every edge; they stay
    // visible when walls auto-hide.
    const inner = offsetPolygon(r.pts, -3);
    const skirtMat = new THREE.MeshStandardMaterial({ color: '#d9d4ca', roughness: 0.9 });
    const n = r.pts.length;
    r.pts.forEach((p, i) => {
      const j = (i + 1) % n;
      roomGroup.add(new THREE.Mesh(prismGeometry([r.pts[i], r.pts[j], inner[j], inner[i]], 0, 6), skirtMat));
    });
  });

  // Walls: outer walls WALL_T thick, one shared wall where rooms face each
  // other (see walls.js). A shared wall takes its owning room's colour/height.
  const wallMats = new Map(rooms.map((r) => [r.id, new THREE.MeshStandardMaterial({ color: r.wall, roughness: 0.95 })]));
  const heights = new Map(rooms.map((r) => [r.id, r.h]));
  wallPieces(rooms, WALL_T).forEach((p) => {
    const m = new THREE.Mesh(prismGeometry(p.quad, 0, heights.get(p.roomId)), wallMats.get(p.roomId));
    m.receiveShadow = true;
    roomGroup.add(m);
    walls.push({ m, a: p.a, nx: p.nx, nz: p.nz, shared: p.shared });
  });

  // Fit the sun's shadow frustum to the rooms.
  const b = bounds(rooms.map((r) => r.pts));
  sun.position.set(b.cx + 300, 700, b.cz + 250);
  sun.target.position.set(b.cx, 0, b.cz);
  const ext = Math.max(b.w, b.d) * 0.75 + WALL_T;
  const sc = sun.shadow.camera;
  sc.left = -ext;
  sc.right = ext;
  sc.top = ext;
  sc.bottom = -ext;
  sc.updateProjectionMatrix();
  applyLighting(); // new room materials need their environment strength
  plan.refresh();
}

// ---------- Camera presets ----------
function setView(kind) {
  $$('#views [data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === kind));
  // Both controls listen on the canvas; only the active one may react.
  controls.enabled = kind !== 'plan';
  if (kind === 'plan') {
    plan.enter();
    return;
  }
  if (plan.active) plan.exit();
  const { w, d, cx, cz } = bounds(rooms.map((r) => r.pts));
  const maxSide = Math.max(w, d);
  controls.minPolarAngle = 0;
  if (kind === 'top') {
    camera.fov = 40;
    camera.updateProjectionMatrix();
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(d / 2 / tan, w / 2 / (tan * camera.aspect)) * 1.12 + 40;
    camera.position.set(cx, dist, cz + 0.01);
    controls.target.set(cx, 0, cz);
  } else if (kind === 'eye') {
    // Stand near the front of the current room, looking towards its back.
    camera.fov = 70;
    camera.updateProjectionMatrix();
    const r = currentRoom(), rb = bounds([r.pts]);
    let eye = [rb.cx, rb.maxZ - 25];
    if (!pointInPolygon(eye, r.pts)) eye = interiorPoint(r.pts);
    camera.position.set(eye[0], 165, eye[1]);
    controls.target.set(eye[0], 125, rb.minZ);
  } else {
    camera.fov = 45;
    camera.updateProjectionMatrix();
    const pullBack = 1 + Math.max(0, 1.15 - camera.aspect) * 1.3; // more room on narrow screens
    camera.position.set(cx + w * 0.55 * pullBack, maxSide * 0.95 * pullBack, cz + d * 0.95 * pullBack);
    controls.target.set(cx, 40, cz);
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
  clampToRooms(selected, rooms);
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
  const r = currentRoom(), [cx, cz] = interiorPoint(r.pts);
  const it = addItem(btn.dataset.add, { x: cx + (k - 2) * 20, z: cz + (k - 2) * 20 });
  if (CATALOG[it.type].opening) {
    // Onto the back wall of the room.
    it.x = cx;
    it.z = bounds([r.pts]).minZ;
    snapOpeningToWall(it, [r]);
  }
  clampToRooms(it, rooms);
  settleOnTop(it);
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
    clampToRooms(selected, rooms);
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
  clampToRooms(selected, rooms);
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
  clampToRooms(copy, rooms);
  settleOnTop(copy);
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
  // Plan mode gets first go: typed lengths, Esc, deleting a selected corner…
  if (plan.active && plan.keyDown(e)) {
    e.preventDefault();
    return;
  }
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

// Room tab. Width/depth inputs resize live while the room is a plain
// rectangle; any other outline is edited in Plan view.
function syncRoomInputs() {
  const r = currentRoom(), rect = asRect(r.pts);
  $('#r-rect').style.display = rect ? 'contents' : 'none';
  $('#r-shape').style.display = rect ? 'none' : '';
  if (rect) {
    setIfNotFocused($('#r-w'), Math.round(rect.w * 10) / 10);
    setIfNotFocused($('#r-d'), Math.round(rect.d * 10) / 10);
  } else {
    const m2 = Math.abs(signedArea(r.pts)) / 10000;
    $('#r-shape-info').textContent = `${r.pts.length} corners · ${m2.toFixed(1)} m²`;
  }
  setIfNotFocused($('#r-h'), r.h);
  setIfNotFocused($('#r-name'), r.name);
  setIfNotFocused($('#r-gap'), settings.innerWallT);
  $('#r-floor').value = r.floor;
  $('#r-wall').value = r.wall;
  $('#r-light').value = settings.light;
  $('#r-snap').value = settings.snap;
  // A locked room ("done") keeps its outline and ceiling; name/colours stay editable.
  const lk = !!r.roomLock;
  ['#r-w', '#r-d', '#r-h', '#b-rect', '#b-draw'].forEach((s) => ($(s).disabled = lk));
  $('#b-lock-room').textContent = lk ? 'Unlock room' : 'Lock room';
  $('#b-del-room').disabled = rooms.length < 2 || lk;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  $('#room-list').innerHTML =
    rooms
      .map((q) => `<button class="chip${q === r ? ' on' : ''}" data-room="${q.id}"><span>${q.roomLock ? '🔒 ' : ''}${esc(q.name)}</span><small>${(Math.abs(signedArea(q.pts)) / 10000).toFixed(1)} m²</small></button>`)
      .join('') + '<button class="chip add" id="b-add-room"><span>+ Add room</span><small>draw it in Plan</small></button>';
}

// Short-lived note under the room fields (e.g. a refused size change).
let roomMsgTimer = null;
function roomMessage(text) {
  $('#r-msg').textContent = text;
  clearTimeout(roomMsgTimer);
  roomMsgTimer = setTimeout(() => ($('#r-msg').textContent = ''), 3000);
}

// Call after changing any room outline: rebuild walls, keep furniture inside.
function onRoomsChanged() {
  rooms.forEach(pruneLocks); // an outline redrawn or reset loses its old walls' locks
  buildRooms();
  items.forEach((it) => {
    clampToRooms(it, rooms);
    applyTransform(it);
  });
  syncRoomInputs();
  commit();
}

[
  ['#r-w', 'w', 150, 2000],
  ['#r-d', 'd', 150, 2000],
].forEach(([sel, key, min, max]) => {
  $(sel).addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    const r = currentRoom(), rect = asRect(r.pts);
    if (!rect || !isFinite(v) || v < min || v > max) return; // ignore while typing out-of-range values
    if (r.roomLock) return roomMessage('This room is locked: unlock it to resize it.');
    rect[key] = v;
    const pts = rectPts(rect.w, rect.d, rect.cx, rect.cz);
    if (overlapsOthers(pts, r.id)) return roomMessage('That size would overlap another room.');
    const locks = relocateLocks(r.locked, pts);
    if (!locks) return roomMessage("That size would change a locked wall's length: unlock it in Plan view first.");
    r.pts = pts;
    r.locked = locks;
    onRoomsChanged();
  });
});
$('#r-h').addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  if (!isFinite(v) || v < 200 || v > 500 || currentRoom().roomLock) return;
  currentRoom().h = v;
  onRoomsChanged();
});
$('#b-rect').addEventListener('click', () => {
  const r = currentRoom(), b = bounds([r.pts]);
  if (r.roomLock) return roomMessage('This room is locked: unlock it first.');
  const pts = rectPts(b.w, b.d, b.cx, b.cz);
  if (overlapsOthers(pts, r.id)) return roomMessage('The rectangle would overlap another room.');
  const locks = relocateLocks(r.locked, pts);
  if (!locks) return roomMessage("The rectangle would change a locked wall's length: unlock it in Plan view first.");
  r.pts = pts;
  r.locked = locks;
  onRoomsChanged();
  checkpoint();
});
$('#b-plan').addEventListener('click', () => setView('plan'));
$('#b-lock-room').addEventListener('click', () => {
  const r = currentRoom();
  r.roomLock = !r.roomLock;
  syncRoomInputs();
  plan.refresh();
  scheduleAutosave();
  checkpoint();
});
$('#b-draw').addEventListener('click', () => {
  setView('plan');
  plan.startDraw(currentRoom().id);
});

// Room list: pick a room, or draw a new one.
$('#room-list').addEventListener('click', (e) => {
  if (e.target.closest('#b-add-room')) {
    setView('plan');
    plan.startDraw(null);
    return;
  }
  const b = e.target.closest('[data-room]');
  if (b) selectRoom(+b.dataset.room);
});
$('#r-name').addEventListener('input', (e) => {
  currentRoom().name = e.target.value.trim() || 'Room';
  syncRoomInputs();
  plan.refresh();
  scheduleAutosave();
});
// Deleting a room takes the furniture standing in it along (undo restores both).
$('#b-del-room').addEventListener('click', () => {
  const r = currentRoom();
  if (rooms.length < 2 || r.roomLock) return;
  const inside = items.filter((it) => pointInPolygon([it.x, it.z], r.pts));
  const what = inside.length ? ` and the ${inside.length} piece${inside.length > 1 ? 's' : ''} in it` : '';
  if (!confirm(`Delete ${r.name}${what}? (Undo brings it back.)`)) return;
  inside.forEach(removeItem);
  if (selected && inside.includes(selected)) selected = null;
  rooms = rooms.filter((q) => q !== r);
  selectedRoomId = null;
  plan.reset();
  onRoomsChanged();
  checkpoint();
});
$('#r-gap').addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  if (!isFinite(v) || v < 1 || v > 60) return;
  settings.innerWallT = v;
  scheduleAutosave();
});

$('#r-floor').addEventListener('input', (e) => {
  currentRoom().floor = e.target.value;
  buildRooms();
  scheduleAutosave();
});
$('#r-wall').addEventListener('input', (e) => {
  currentRoom().wall = e.target.value;
  buildRooms();
  scheduleAutosave();
});
$('#r-light').addEventListener('change', (e) => {
  settings.light = e.target.value;
  applyLighting();
  scheduleAutosave();
});
$('#r-snap').addEventListener('change', (e) => {
  settings.snap = parseFloat(e.target.value);
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

const roomData = () => rooms.map(({ id, name, pts, h, floor, wall, locked, roomLock }) => ({ id, name, pts, h, floor, wall, locked, roomLock }));

// Layout JSON v2: { version, settings, rooms, items }.
// v1 had a single rectangle: { room: { w, d, h, floor, wall, light, snap }, items }.
function serialize() {
  return JSON.stringify({ version: 2, settings, rooms: roomData(), items: itemData() });
}

// Rooms from either layout version. Outlines with < 3 corners are dropped.
function parseRooms(parsed) {
  if (Array.isArray(parsed.rooms)) {
    const list = parsed.rooms
      .filter((r) => Array.isArray(r.pts))
      .map((r) => ({ ...r, pts: normalizePolygon(r.pts.filter((p) => isFinite(p[0]) && isFinite(p[1]))), locked: parseLocks(r.locked), roomLock: r.roomLock === true }))
      .filter((r) => r.pts.length >= 3)
      .map(({ id, ...r }) => newRoom({ ...r, ...(Number.isInteger(id) ? { id } : {}) }));
    if (list.length) return list;
  }
  const old = parsed.room || {};
  const pick = (k) => (old[k] !== undefined ? { [k]: old[k] } : {});
  return [newRoom({ pts: rectPts(old.w || 500, old.d || 400), ...pick('h'), ...pick('floor'), ...pick('wall') })];
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
  // Undo snapshots carry no settings, so the current light/snap stay.
  const s = parsed.settings || parsed.room || {};
  if (s.light) settings.light = s.light;
  if (s.snap !== undefined) settings.snap = s.snap;
  if (s.innerWallT > 0) settings.innerWallT = s.innerWallT;
  rooms = parseRooms(parsed);
  rooms.forEach(pruneLocks);
  rooms.forEach((r) => (nextRoomId = Math.max(nextRoomId, r.id + 1)));
  plan.reset();
  buildRooms();
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
  const keep = rooms[0] ? { floor: rooms[0].floor, wall: rooms[0].wall } : {}; // colours survive, as before
  rooms = [newRoom({ pts: rectPts(500, 400), h: 260, ...keep })];
  plan.reset();
  buildRooms();
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
    clampToRooms(it, rooms);
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
  return JSON.stringify({ rooms: roomData(), items: itemData() });
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
  loadLayout(state); // `state` has no settings, so light/snap stay as they are
  lastState = historyState();
  select(items.find((i) => i.id === keepId) || null);
  scheduleAutosave();
  refreshUndoButtons();
}

function undo() {
  if (drag || plan.busy()) return;
  checkpoint(); // record an edit that hasn't hit a checkpoint yet
  if (!undoStack.length) return;
  redoStack.push(lastState);
  restoreState(undoStack.pop());
}

function redo() {
  if (drag || plan.busy()) return;
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
  plan.resize(w, h);
}
new ResizeObserver(resize).observe(view);

function animate() {
  activeControls().update();
  // Hide walls whose outside faces the camera, and all walls from (near) top
  // view and in Plan view (which draws them as a 2D band instead).
  const cam = camera.position;
  const topDown = plan.active || controls.getPolarAngle() < 0.35;
  walls.forEach((wall) => {
    // Shared walls are inside the apartment: they only hide from above.
    const camOutside = !wall.shared && (cam.x - wall.a[0]) * wall.nx + (cam.z - wall.a[1]) * wall.nz > 0;
    wall.m.visible = !camOutside && !topDown;
  });
  if (plan.active) plan.update();
  renderer.render(scene, activeCamera());
  requestAnimationFrame(animate);
}

// ---------- Boot ----------
rooms = [newRoom()];
buildRooms();
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
