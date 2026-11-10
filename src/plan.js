// Plan mode: a top-down orthographic view for drawing and editing room
// outlines, with a grid, wall-length labels and snapping. All lengths in cm.
//
// The 3D scene is rendered through this module's camera while active; the
// outline, walls, labels and handles are an SVG overlay redrawn when the
// view or the outline changes. main.js forwards pointer/key events here
// first (see createPlan's callers) and gets `true` back when they were used.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { edges, offsetPolygon, isSimple, closestOnSegment, normalizePolygon, interiorPoint, bounds, signedArea, dist, pointInPolygon, polygonsOverlap } from './polygon.js';
import { wallPieces } from './walls.js';
import { isWallLocked, isCornerPinned, toggleWallLock } from './locks.js';

const FRUSTUM = 1000; // cm visible top to bottom at zoom 1
const HIT = 10; // pick radius, px
const copyPts = (pts) => pts.map((p) => [p[0], p[1]]);
const fmtLen = (cm) => {
  const r = Math.round(cm * 10) / 10;
  return `${r % 1 ? r.toFixed(1) : r} cm`;
};

const HINT_EDIT = 'Plan: drag a corner or wall · click a length to type it · double-click a wall to add a corner · select a wall + Lock wall to keep it fixed · right-drag to pan, wheel to zoom';
const HINT_DRAW = 'Draw: click to place corners (they snap one wall away from other rooms) · type a length + Enter · Shift = any angle · click the first corner or press Enter to finish · Esc cancels';

/**
 * ctx: { canvas, view, scene, wallT, getRooms(), getSnap(),
 *        getGap() — wall thickness to leave between rooms when snapping,
 *        getSelectedRoomId(), onSelectRoom(id),
 *        onLive() — outline changed mid-drag (rebuild 3D only),
 *        onDone() — outline edit finished (rebuild, clamp furniture, undo step),
 *        onDrawn(pts, targetId) — outline drawn for room targetId, or null =
 *          a new room, setHint(text|null) }
 */
export function createPlan(ctx) {
  const { canvas, view, scene, wallT } = ctx;
  const rooms = () => ctx.getRooms();
  const roomById = (id) => rooms().find((r) => r.id === id);
  const overlapsOther = (pts, id) => rooms().some((r) => r.id !== id && polygonsOverlap(pts, r.pts));
  // Other rooms' outlines pushed out by the wall-between-rooms gap: where a
  // neighbouring room's outline should go. Corners: each corner pushed out
  // across each of its two walls (so a room placed alongside lines up with
  // it, e.g. (right + gap, top)); edges: the pushed-out outline.
  const gapCorners = (exceptId) =>
    rooms()
      .filter((r) => r.id !== exceptId)
      .flatMap((r) => {
        const E = edges(r.pts), n = r.pts.length, g = ctx.getGap();
        return r.pts.flatMap((v, i) => [E[(i - 1 + n) % n], E[i]].map((e) => [v[0] + e.nx * g, v[1] + e.nz * g]));
      });
  const gapEdges = (exceptId) => rooms().filter((r) => r.id !== exceptId).flatMap((r) => edges(offsetPolygon(r.pts, ctx.getGap())));
  let W = 1, H = 1;

  // ---------- Camera + pan/zoom ----------
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 10000);
  const controls = new OrbitControls(camera, canvas);
  controls.enabled = false;
  controls.enableRotate = false;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  controls.minZoom = 0.1;
  controls.maxZoom = 30;
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };

  const pxPerCm = () => (H * camera.zoom) / FRUSTUM;

  // Grids every 10 / 50 / 100 cm; finer ones fade out when zoomed out.
  const grids = [[10, 0.1], [50, 0.18], [100, 0.32]].map(([step, opacity], i) => {
    const size = 8000;
    const g = new THREE.GridHelper(size, size / step, 0x334455, 0x334455);
    g.material.transparent = true;
    g.material.opacity = opacity;
    g.material.depthWrite = false;
    g.position.y = 0.4 + i * 0.05;
    g.visible = false;
    g.userData.step = step;
    scene.add(g);
    return g;
  });

  // ---------- Overlay DOM ----------
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'plan-svg';
  view.appendChild(svg);

  const bar = document.createElement('div');
  bar.id = 'planbar';
  bar.innerHTML = `
    <div data-mode="edit">
      <button class="btn" data-a="add">Add room</button>
      <button class="btn" data-a="draw">Redraw room</button>
      <button class="btn" data-a="split">Add corner</button>
      <button class="btn" data-a="del">Delete corner</button>
      <button class="btn" data-a="lock">Lock wall</button>
      <button class="btn" data-a="fit">Fit</button>
    </div>
    <div data-mode="draw">
      <span class="what"></span>
      <label>Length cm <input id="plan-len" type="number" inputmode="decimal" min="0" step="1"></label>
      <button class="btn" data-a="undo-pt">Undo corner</button>
      <button class="btn pri" data-a="close">Finish room</button>
      <button class="btn" data-a="cancel">Cancel</button>
    </div>
    <span class="msg"></span>`;
  view.appendChild(bar);
  const lenInput = bar.querySelector('#plan-len');
  const msgEl = bar.querySelector('.msg');

  const editBox = document.createElement('input');
  editBox.id = 'plan-edit';
  editBox.type = 'number';
  editBox.inputMode = 'decimal';
  view.appendChild(editBox);

  // ---------- State ----------
  let active = false;
  let mode = 'edit'; // 'edit' | 'draw'
  let draft = []; // corners placed so far while drawing
  let drawTarget = null; // room id being redrawn, or null = drawing a new room
  let cursor = null; // { p, close?, guide?, typed? } snapped preview point while drawing
  let sel = null; // { roomId, kind: 'corner'|'wall', i }
  let hover = null;
  let drag = null; // { kind, roomId, i, startS, start, orig, work, moved, valid, ... }
  let press = null; // a tap in progress: { s } while drawing, { label } on a length label
  let editing = null; // { roomId, i } length label being typed into
  let labels = []; // screen boxes of length labels, for hit tests
  let pointerP = [0, 0], shiftHeld = false;
  let dirty = true, lastKey = '', msgTimer = null;

  function flash(text) {
    msgEl.textContent = text;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => (msgEl.textContent = ''), 2500);
  }

  // ---------- Coordinates ----------
  const v3 = new THREE.Vector3();
  function toScreen(p) {
    v3.set(p[0], 0, p[1]).project(camera);
    return [((v3.x + 1) / 2) * W, ((1 - v3.y) / 2) * H];
  }
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), hitV = new THREE.Vector3();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function eventInfo(e) {
    const r = canvas.getBoundingClientRect();
    const s = [e.clientX - r.left, e.clientY - r.top];
    ndc.set((s[0] / r.width) * 2 - 1, -(s[1] / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    raycaster.ray.intersectPlane(floorPlane, hitV);
    return { s, p: [hitV.x, hitV.z] };
  }

  // Snap-to-grid using the Snap setting; "Off" still rounds to 1 mm.
  function roundTo(v) {
    const step = ctx.getSnap();
    return step > 0 ? Math.round(v / step) * step : Math.round(v * 10) / 10;
  }

  // ---------- Hit testing ----------
  function hitTest(s, p) {
    for (const L of labels) {
      const dx = s[0] - L.x, dy = s[1] - L.y, c = Math.cos(L.a), sn = Math.sin(L.a);
      if (Math.abs(dx * c + dy * sn) <= L.w / 2 && Math.abs(-dx * sn + dy * c) <= 10) return { kind: 'label', roomId: L.roomId, i: L.i };
    }
    const tol = HIT / pxPerCm();
    let best = null;
    for (const r of rooms()) {
      r.pts.forEach((q, i) => {
        const d = dist(p, q);
        if (d < tol && (!best || d < best.d)) best = { kind: 'corner', roomId: r.id, i, d };
      });
    }
    if (best) return best;
    // A wall: on its band (outline → outline + thickness), or just inside it.
    for (const r of rooms()) {
      edges(r.pts).forEach((e, i) => {
        const along = (p[0] - e.a[0]) * e.ux + (p[1] - e.a[1]) * e.uz;
        const side = (p[0] - e.a[0]) * e.nx + (p[1] - e.a[1]) * e.nz;
        const d = Math.abs(side);
        if (along > 0 && along < e.len && side > -tol && side < wallT + tol && (!best || d < best.d)) best = { kind: 'wall', roomId: r.id, i, d };
      });
    }
    return best;
  }

  // ---------- Snapping ----------
  // Onto the nearest "gap line" (another room's outline pushed out by the
  // wall-between-rooms thickness) within tol, the position along it rounded
  // to the snap step. Null if none is close.
  function snapToGapEdge(p, exceptId, tol) {
    let best = null;
    for (const e of gapEdges(exceptId)) {
      const c = closestOnSegment(p, e.a, e.b);
      if (c.d < tol && (!best || c.d < best.d)) best = { ...c, e };
    }
    if (!best) return null;
    const t = Math.max(0, Math.min(best.e.len, roundTo(best.t)));
    return [best.e.a[0] + best.e.ux * t, best.e.a[1] + best.e.uz * t];
  }

  // A dragged corner: onto another room's gap corner or gap line, else grid,
  // lined up with its neighbours (so walls stay straight) or with other
  // rooms' gap corners.
  function snapCorner(p, room, work, i, free) {
    if (free) return [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
    const tol = HIT / pxPerCm();
    const others = gapCorners(room.id);
    for (const q of others) if (dist(p, q) < tol) return [q[0], q[1]];
    const onGap = snapToGapEdge(p, room.id, tol);
    if (onGap) return onGap;
    let x = roundTo(p[0]), z = roundTo(p[1]);
    const n = work.length;
    for (const q of [work[(i - 1 + n) % n], work[(i + 1) % n], ...others]) {
      if (Math.abs(p[0] - q[0]) < tol) x = q[0];
      if (Math.abs(p[1] - q[1]) < tol) z = q[1];
    }
    return [x, z];
  }

  // The next corner while drawing. From the last corner the direction locks
  // to 45° steps (Shift: free) and the length rounds to the snap step, or is
  // the typed length. Axis-aligned segments also stop level with existing
  // corners (e.g. the first one) so the outline can be closed square.
  // Other rooms count through their gap corners/lines (one wall away), the
  // room being redrawn through its own corners (to trace it).
  function snapDraft(p, free) {
    const tol = HIT / pxPerCm();
    const typed = parseFloat(lenInput.value);
    const own = drawTarget !== null && roomById(drawTarget) ? roomById(drawTarget).pts : [];
    const anchors = [...draft.slice(0, -1), ...own, ...gapCorners(drawTarget)];
    if (!(typed > 0) && draft.length >= 3 && dist(p, draft[0]) < tol) return { p: draft[0], close: true };
    if (!draft.length || (free && !(typed > 0))) {
      for (const q of anchors) if (dist(p, q) < tol) return { p: [q[0], q[1]] };
      const onGap = snapToGapEdge(p, drawTarget, tol);
      if (onGap) return { p: onGap };
      return { p: free ? [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10] : [roundTo(p[0]), roundTo(p[1])] };
    }
    const last = draft[draft.length - 1];
    let ang = Math.atan2(p[1] - last[1], p[0] - last[0]);
    if (!free) ang = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
    let ux = Math.cos(ang), uz = Math.sin(ang);
    if (Math.abs(ux) < 1e-9) ux = 0;
    if (Math.abs(uz) < 1e-9) uz = 0;
    const end = (len) => [last[0] + ux * len, last[1] + uz * len];
    if (typed > 0) return { p: end(typed), typed: true };
    const raw = Math.max(0, (p[0] - last[0]) * ux + (p[1] - last[1]) * uz);
    let len = roundTo(raw), guide = null;
    if (ux === 0 || uz === 0) {
      let bestD = tol;
      for (const q of anchors) {
        const L = ux ? (q[0] - last[0]) / ux : (q[1] - last[1]) / uz;
        if (L > 0 && Math.abs(L - raw) < bestD) {
          bestD = Math.abs(L - raw);
          len = L;
          guide = q;
        }
      }
    }
    const e = end(len);
    return { p: e, guide, close: draft.length >= 3 && dist(e, draft[0]) < 0.5 };
  }

  // ---------- Drawing ----------
  // targetId: the room to redraw, or null to draw a new room.
  function startDraw(targetId = null) {
    mode = 'draw';
    drawTarget = targetId;
    const t = roomById(targetId);
    bar.querySelector('.what').textContent = t ? `Redraw ${t.name}:` : 'New room:';
    draft = [];
    cursor = null;
    sel = null;
    lenInput.value = '';
    closeEditor();
    ctx.setHint(HINT_DRAW);
    renderBar();
    dirty = true;
  }

  function cancelDraw() {
    mode = 'edit';
    draft = [];
    cursor = null;
    lenInput.value = '';
    lenInput.blur();
    if (active) ctx.setHint(HINT_EDIT);
    renderBar();
    dirty = true;
  }

  function addDraftPoint(res) {
    if (res.close) return finishDraw();
    const last = draft[draft.length - 1];
    if (last && dist(last, res.p) < 0.5) return;
    draft.push(res.p);
    lenInput.value = '';
    cursor = snapDraft(pointerP, shiftHeld);
    renderBar();
    dirty = true;
  }

  function undoPoint() {
    if (lenInput.value) lenInput.value = '';
    else draft.pop();
    cursor = snapDraft(pointerP, shiftHeld);
    renderBar();
    dirty = true;
  }

  function finishDraw() {
    const pts = normalizePolygon(draft);
    if (pts.length < 3) return flash('A room needs at least 3 corners');
    if (!isSimple(pts)) return flash("The outline can't cross itself");
    if (overlapsOther(pts, drawTarget)) return flash("Rooms can't overlap: leave a wall between them");
    const target = drawTarget;
    cancelDraw();
    ctx.onDrawn(pts, target);
  }

  // Enter: place the typed length, or finish the room.
  function drawEnter() {
    if (parseFloat(lenInput.value) > 0 && draft.length) addDraftPoint(snapDraft(pointerP, shiftHeld));
    else if (draft.length >= 3) finishDraw();
  }

  lenInput.addEventListener('input', () => {
    if (draft.length) cursor = snapDraft(pointerP, shiftHeld);
    dirty = true;
  });
  lenInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') drawEnter();
    else if (e.key === 'Escape') cancelDraw();
    else if (e.key === 'Backspace' && !lenInput.value) undoPoint();
    else return;
    e.preventDefault();
  });

  // ---------- Editing ----------
  function select(s) {
    sel = s;
    renderBar();
    dirty = true;
  }

  // Commit an edited outline if it is valid, else explain and keep the old one.
  function applyOutline(room, pts, failMsg) {
    pts = normalizePolygon(pts);
    if (pts.length < 3 || !isSimple(pts)) {
      flash(failMsg);
      return false;
    }
    if (overlapsOther(pts, room.id)) {
      flash("Rooms can't overlap: leave a wall between them");
      return false;
    }
    room.pts = pts;
    ctx.onDone();
    return true;
  }

  // Wall drag setup. The polygon is rotated so the wall is edge 0 (corners 0
  // and 1). A neighbouring wall that carries straight on gets a new corner,
  // so it stays put and a jog appears instead (that's how notches are made:
  // add two corners on a wall, drag the piece between them). Otherwise each
  // end slides along its neighbouring wall, which keeps that wall's angle.
  function prepareWallDrag() {
    const room = roomById(drag.roomId), n = room.pts.length, i = drag.i;
    const E = edges(room.pts), e = E[i], prev = E[(i - 1 + n) % n], next = E[(i + 1) % n];
    const nearlyParallel = (f) => Math.abs(f.ux * e.uz - f.uz * e.ux) < 0.2;
    const work = [];
    for (let k = 0; k < n; k++) work.push([...room.pts[(i + k) % n]]);
    drag.dirA = nearlyParallel(prev) ? null : [prev.ux, prev.uz];
    drag.dirB = nearlyParallel(next) ? null : [next.ux, next.uz];
    if (!drag.dirB) work.splice(2, 0, [...work[1]]);
    if (!drag.dirA) work.push([...work[0]]);
    drag.base = copyPts(work);
    drag.work = work;
    drag.e = e;
  }

  // A dragged wall within reach of a facing wall of another room: the shift
  // that leaves exactly the wall-between-rooms gap. Null if none is close.
  function snapWallToNeighbour(dn) {
    const { e, base } = drag, tol = HIT / pxPerCm(), gap = ctx.getGap();
    const len = dist(base[0], base[1]);
    let best = null;
    for (const r of rooms()) {
      if (r.id === drag.roomId) continue;
      for (const f of edges(r.pts)) {
        if (e.nx * f.nx + e.nz * f.nz > -0.999) continue; // not facing
        const ta = (f.a[0] - base[0][0]) * e.ux + (f.a[1] - base[0][1]) * e.uz;
        const tb = (f.b[0] - base[0][0]) * e.ux + (f.b[1] - base[0][1]) * e.uz;
        if (Math.max(ta, tb) <= 0 || Math.min(ta, tb) >= len) continue; // side by side, not facing
        const want = (f.a[0] - base[0][0]) * e.nx + (f.a[1] - base[0][1]) * e.nz - gap;
        if (Math.abs(want - dn) < tol && (best === null || Math.abs(want - dn) < Math.abs(best - dn))) best = want;
      }
    }
    return best;
  }

  function moveWall(p, free) {
    const { e, base, dirA, dirB, start } = drag;
    let dn = (p[0] - start[0]) * e.nx + (p[1] - start[1]) * e.nz;
    if (!free) dn = snapWallToNeighbour(dn) ?? roundTo(dn);
    const shift = (q, dir) => {
      if (!dir) return [q[0] + e.nx * dn, q[1] + e.nz * dn];
      const k = dn / (dir[0] * e.nx + dir[1] * e.nz);
      return [q[0] + dir[0] * k, q[1] + dir[1] * k];
    };
    drag.work[0] = shift(base[0], dirA);
    drag.work[1] = shift(base[1], dirB);
  }

  function endDrag() {
    const room = roomById(drag.roomId);
    if (!room || !drag.moved) return;
    if (drag.kind === 'wall') {
      const a = drag.work[0], b = drag.work[1];
      if (applyOutline(room, drag.work, "Walls can't cross each other")) {
        const n = room.pts.length;
        const k = room.pts.findIndex((q, j) => dist(q, a) < 0.01 && dist(room.pts[(j + 1) % n], b) < 0.01);
        select(k >= 0 ? { roomId: room.id, kind: 'wall', i: k } : null);
        return;
      }
    } else if (applyOutline(room, drag.work, "Walls can't cross each other")) {
      const p = drag.work[drag.i];
      const k = room.pts.findIndex((q) => dist(q, p) < 0.01);
      select(k >= 0 ? { roomId: room.id, kind: 'corner', i: k } : null);
      return;
    }
    room.pts = drag.orig;
    select(null);
    ctx.onLive();
  }

  // Typing a wall's length moves its end corner along the wall. If the next
  // wall is square to it, that whole next wall moves too, so it stays square.
  // If that would move a locked wall, the start end moves instead (and the
  // previous wall if square); if both ends are held, nothing changes.
  function setWallLength(room, i, L) {
    if (isWallLocked(room, i)) return flash('This wall is locked: unlock it to change its length');
    const n = room.pts.length, E = edges(room.pts), e = E[i];
    const square = (f) => n > 3 && Math.abs(e.ux * f.ux + e.uz * f.uz) < 1e-3;
    const fwd = [(i + 1) % n], back = [i];
    if (square(E[(i + 1) % n])) fwd.push((i + 2) % n);
    if (square(E[(i - 1 + n) % n])) back.push((i - 1 + n) % n);
    const free = (ks) => ks.every((k) => !isCornerPinned(room, k));
    const sign = free(fwd) ? 1 : free(back) ? -1 : 0;
    if (!sign) return flash('Both ends of this wall are held by locked walls');
    const delta = (L - e.len) * sign, pts = copyPts(room.pts);
    for (const k of sign > 0 ? fwd : back) pts[k] = [pts[k][0] + e.ux * delta, pts[k][1] + e.uz * delta];
    applyOutline(room, pts, "That length would make walls cross");
  }

  function splitWall(room, i, p) {
    if (isWallLocked(room, i)) return flash('This wall is locked: unlock it to add a corner');
    const e = edges(room.pts)[i];
    let t = p ? closestOnSegment(p, e.a, e.b).t : e.len / 2;
    t = Math.max(0.5, Math.min(e.len - 0.5, roundTo(t)));
    const pts = copyPts(room.pts);
    pts.splice(i + 1, 0, [e.a[0] + e.ux * t, e.a[1] + e.uz * t]);
    if (applyOutline(room, pts, "Can't add a corner there")) select({ roomId: room.id, kind: 'corner', i: i + 1 });
  }

  function deleteCorner() {
    const room = sel && roomById(sel.roomId);
    if (!room || sel.kind !== 'corner') return;
    if (room.pts.length <= 3) return flash('A room needs at least 3 corners');
    if (isCornerPinned(room, sel.i)) return flash('This corner belongs to a locked wall');
    const pts = copyPts(room.pts);
    pts.splice(sel.i, 1);
    if (applyOutline(room, pts, 'Removing that corner would make walls cross')) select(null);
  }

  function openEditor(roomId, i) {
    const room = roomById(roomId);
    if (!room) return;
    editing = { roomId, i };
    editBox.value = Math.round(edges(room.pts)[i].len * 10) / 10;
    editBox.style.display = 'block';
    positionEditor();
    editBox.focus();
    editBox.select();
    select({ roomId, kind: 'wall', i });
  }
  function closeEditor() {
    editing = null;
    editBox.style.display = 'none';
  }
  function positionEditor() {
    const L = editing && labels.find((l) => l.roomId === editing.roomId && l.i === editing.i);
    if (!L) return;
    editBox.style.left = `${L.x}px`;
    editBox.style.top = `${L.y}px`;
  }
  editBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const v = parseFloat(editBox.value), room = editing && roomById(editing.roomId);
      const i = editing && editing.i;
      closeEditor();
      if (room && v >= 1) setWallLength(room, i, v);
    } else if (e.key === 'Escape') closeEditor();
    else return;
    e.preventDefault();
  });
  editBox.addEventListener('blur', () => setTimeout(closeEditor, 0));

  // ---------- Toolbar ----------
  function renderBar() {
    bar.querySelector('[data-mode="edit"]').style.display = mode === 'edit' ? '' : 'none';
    bar.querySelector('[data-mode="draw"]').style.display = mode === 'draw' ? '' : 'none';
    const room = sel && roomById(sel.roomId);
    bar.querySelector('[data-a="split"]').disabled = !(room && sel.kind === 'wall');
    bar.querySelector('[data-a="del"]').disabled = !(room && sel.kind === 'corner' && room.pts.length > 3);
    const lockBtn = bar.querySelector('[data-a="lock"]');
    lockBtn.disabled = !(room && sel.kind === 'wall');
    lockBtn.textContent = room && sel.kind === 'wall' && isWallLocked(room, sel.i) ? 'Unlock wall' : 'Lock wall';
    bar.querySelector('[data-a="close"]').disabled = draft.length < 3;
    bar.querySelector('[data-a="undo-pt"]').disabled = !draft.length;
  }
  bar.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    const room = sel && roomById(sel.roomId);
    if (a === 'add') startDraw(null);
    else if (a === 'draw') startDraw(ctx.getSelectedRoomId());
    else if (a === 'split' && room && sel.kind === 'wall') splitWall(room, sel.i, null);
    else if (a === 'del') deleteCorner();
    else if (a === 'lock' && room && sel.kind === 'wall') {
      toggleWallLock(room, sel.i);
      ctx.onDone(); // saved + undo step
      renderBar();
    } else if (a === 'fit') fit();
    else if (a === 'undo-pt') undoPoint();
    else if (a === 'close') finishDraw();
    else if (a === 'cancel') cancelDraw();
  });

  // ---------- Pointer + keys (forwarded from main.js) ----------
  function pointerDown(e) {
    if (e.button !== 0) return false; // right/middle button: pan/zoom
    const { s, p } = eventInfo(e);
    pointerP = p;
    shiftHeld = e.shiftKey;
    closeEditor();
    if (mode === 'draw') {
      press = { s };
      controls.enabled = false;
      return true;
    }
    const h = hitTest(s, p);
    if (!h) {
      if (sel) select(null);
      // Pressing on a room's floor selects that room (furniture still gets the event).
      const r = rooms().find((q) => pointInPolygon(p, q.pts));
      if (r && r.id !== ctx.getSelectedRoomId()) ctx.onSelectRoom(r.id);
      return false; // furniture, or pan
    }
    controls.enabled = false;
    if (h.roomId !== ctx.getSelectedRoomId()) ctx.onSelectRoom(h.roomId);
    if (h.kind === 'label') {
      press = { label: h };
      return true;
    }
    select({ roomId: h.roomId, kind: h.kind, i: h.i });
    const room = roomById(h.roomId);
    drag = { kind: h.kind, roomId: h.roomId, i: h.i, startS: s, start: p, orig: copyPts(room.pts), moved: false, valid: true };
    // Selecting still works; moving is refused once the pointer actually moves.
    if (h.kind === 'corner' && isCornerPinned(room, h.i)) drag.blocked = 'This corner belongs to a locked wall';
    if (h.kind === 'wall' && isWallLocked(room, h.i)) drag.blocked = 'This wall is locked';
    return true;
  }

  function pointerMove(e) {
    const { s, p } = eventInfo(e);
    pointerP = p;
    shiftHeld = e.shiftKey;
    if (drag) {
      if (drag.dead) return true;
      const room = roomById(drag.roomId);
      if (!drag.moved) {
        if (Math.hypot(s[0] - drag.startS[0], s[1] - drag.startS[1]) < 3) return true;
        if (!drag.blocked && drag.kind === 'wall') {
          // An end that slides along a locked neighbour would change that wall.
          // (A straight-on neighbour gets a jog instead and keeps its corners.)
          prepareWallDrag();
          const n = room.pts.length;
          if ((drag.dirA && isWallLocked(room, (drag.i - 1 + n) % n)) || (drag.dirB && isWallLocked(room, (drag.i + 1) % n))) {
            drag.blocked = 'A wall next to it is locked: unlock it to move this one';
          }
        }
        if (drag.blocked) {
          flash(drag.blocked);
          drag.dead = true; // ignore the rest of this press (no pan either)
          return true;
        }
        drag.moved = true;
        if (drag.kind !== 'wall') drag.work = copyPts(drag.orig);
      }
      if (drag.kind === 'corner') drag.work[drag.i] = snapCorner(p, room, drag.work, drag.i, e.shiftKey);
      else moveWall(p, e.shiftKey);
      room.pts = normalizePolygon(drag.work);
      drag.valid = room.pts.length >= 3 && isSimple(room.pts) && !overlapsOther(room.pts, room.id);
      ctx.onLive();
      dirty = true;
      return true;
    }
    if (mode === 'draw') {
      cursor = snapDraft(p, e.shiftKey);
      dirty = true;
      return false;
    }
    const h = hitTest(s, p);
    if ((h && h.kind + h.roomId + h.i) !== (hover && hover.kind + hover.roomId + hover.i)) dirty = true;
    hover = h;
    canvas.style.cursor = !h ? '' : h.kind === 'label' ? 'text' : h.kind === 'corner' ? 'move' : 'grab';
    return false;
  }

  function pointerUp(e) {
    if (drag) {
      endDrag();
      drag = null;
      controls.enabled = true;
      dirty = true;
      return true;
    }
    if (press) {
      const pr = press;
      press = null;
      controls.enabled = true;
      if (pr.label) {
        const r = roomById(pr.label.roomId);
        if (r && isWallLocked(r, pr.label.i)) {
          select({ roomId: r.id, kind: 'wall', i: pr.label.i }); // so Unlock is one tap away
          flash('This wall is locked: unlock it to change its length');
        } else openEditor(pr.label.roomId, pr.label.i);
      }
      else {
        const { s, p } = eventInfo(e);
        if (Math.hypot(s[0] - pr.s[0], s[1] - pr.s[1]) < 6) addDraftPoint(snapDraft(p, e.shiftKey));
      }
      return true;
    }
    return false;
  }

  function pointerCancel() {
    if (drag && drag.moved) {
      const room = roomById(drag.roomId);
      if (room) room.pts = drag.orig;
      ctx.onLive();
    }
    drag = null;
    press = null;
    controls.enabled = true;
    dirty = true;
  }

  function dblClick(e) {
    if (mode !== 'edit') return;
    const { s, p } = eventInfo(e);
    const h = hitTest(s, p);
    const room = h && h.kind === 'wall' && roomById(h.roomId);
    if (room) splitWall(room, h.i, p);
  }

  // Keys while focus is not in a text field. Returns true when used.
  function keyDown(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (mode === 'draw') {
      if (/^[0-9.]$/.test(e.key) && !mod) {
        lenInput.focus();
        lenInput.value += e.key;
        lenInput.dispatchEvent(new Event('input'));
        return true;
      }
      if (e.key === 'Enter') drawEnter();
      else if (e.key === 'Escape') cancelDraw();
      else if (e.key === 'Backspace' || (mod && e.key.toLowerCase() === 'z')) undoPoint();
      else return false;
      return true;
    }
    if (e.key === 'Escape' && sel) {
      select(null);
      return true;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel && sel.kind === 'corner') {
      deleteCorner();
      return true;
    }
    return false;
  }

  // ---------- Overlay rendering ----------
  const f1 = (v) => v.toFixed(1);
  const pathOf = (arr) => 'M' + arr.map((q) => `${f1(q[0])},${f1(q[1])}`).join('L') + 'Z';

  function render() {
    labels = [];
    const out = [];
    const badId = drag && drag.moved && !drag.valid ? drag.roomId : null;
    // Walls as in 3D: outer walls and one shared wall between facing rooms.
    for (const pc of wallPieces(rooms(), wallT)) {
      out.push(`<path class="pw${pc.shared ? ' sh' : ''}${pc.roomId === badId ? ' bad' : ''}" d="${pathOf(pc.quad.map(toScreen))}"/>`);
    }
    const selId = ctx.getSelectedRoomId();
    for (const r of rooms()) {
      const pts = r.pts, n = pts.length;
      if (n < 3) continue;
      const scr = pts.map(toScreen);
      const bad = r.id === badId ? ' bad' : '';
      out.push(`<path class="po${bad}${r.id === selId && rooms().length > 1 ? ' on' : ''}" d="${pathOf(scr)}"/>`);
      edges(pts).forEach((e, i) => {
        const a = scr[i], b = scr[(i + 1) % n];
        const on = sel && sel.roomId === r.id && sel.kind === 'wall' && sel.i === i;
        const locked = isWallLocked(r, i);
        if (locked) out.push(`<line class="plk" x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}"/>`);
        if (on) out.push(`<line class="psel" x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}"/>`);
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 34) return; // too short on screen for a label
        let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        if (ang > Math.PI / 2 + 1e-6) ang -= Math.PI;
        if (ang <= -Math.PI / 2 + 1e-6) ang += Math.PI;
        // Screen x/y follow world x/z here, so the inward normal is (-nx, -nz).
        const x = (a[0] + b[0]) / 2 - e.nx * 16, y = (a[1] + b[1]) / 2 - e.nz * 16;
        const text = (locked ? '🔒 ' : '') + fmtLen(e.len), w = text.length * 7 + 12;
        labels.push({ roomId: r.id, i, x, y, a: ang, w });
        const hov = (hover && hover.kind === 'label' && hover.roomId === r.id && hover.i === i) || on ? ' hov' : '';
        out.push(`<g class="pl${hov}${locked ? ' lk' : ''}" transform="translate(${f1(x)},${f1(y)}) rotate(${(ang * 180 / Math.PI).toFixed(2)})"><rect x="${-w / 2}" y="-9" width="${w}" height="18" rx="4"/><text y="4">${text}</text></g>`);
      });
      scr.forEach((q, i) => {
        const on = sel && sel.roomId === r.id && sel.kind === 'corner' && sel.i === i;
        out.push(`<circle class="pc${on ? ' on' : ''}${isCornerPinned(r, i) ? ' lk' : ''}" cx="${f1(q[0])}" cy="${f1(q[1])}" r="${on ? 6 : 4.5}"/>`);
      });
      const c = toScreen(interiorPoint(pts));
      const name = String(r.name).replace(/[&<>]/g, (ch) => `&#${ch.charCodeAt(0)};`);
      out.push(`<text class="pa" x="${f1(c[0])}" y="${f1(c[1])}">${name} · ${(Math.abs(signedArea(pts)) / 10000).toFixed(1)} m²</text>`);
    }

    if (mode === 'draw') {
      const scr = draft.map(toScreen);
      if (scr.length > 1) out.push(`<polyline class="pd" points="${scr.map((q) => q.map(f1).join(',')).join(' ')}"/>`);
      for (let k = 1; k < scr.length; k++) {
        const a = scr[k - 1], b = scr[k];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 34) continue;
        const text = fmtLen(dist(draft[k - 1], draft[k])), w = text.length * 7 + 12;
        out.push(`<g class="pl" transform="translate(${f1((a[0] + b[0]) / 2)},${f1((a[1] + b[1]) / 2 - 14)})"><rect x="${-w / 2}" y="-9" width="${w}" height="18" rx="4"/><text y="4">${text}</text></g>`);
      }
      if (cursor) {
        const c = toScreen(cursor.p);
        if (cursor.guide) {
          const g = toScreen(cursor.guide);
          out.push(`<line class="pg" x1="${f1(g[0])}" y1="${f1(g[1])}" x2="${f1(c[0])}" y2="${f1(c[1])}"/>`);
        }
        if (scr.length) {
          const l = scr[scr.length - 1];
          out.push(`<line class="pr" x1="${f1(l[0])}" y1="${f1(l[1])}" x2="${f1(c[0])}" y2="${f1(c[1])}"/>`);
          const len = dist(draft[draft.length - 1], cursor.p);
          if (len > 0) {
            const text = fmtLen(len), w = text.length * 7 + 12;
            const mx = (l[0] + c[0]) / 2, my = (l[1] + c[1]) / 2 - 18;
            out.push(`<g class="pl live${cursor.typed ? ' hov' : ''}" transform="translate(${f1(mx)},${f1(my)})"><rect x="${-w / 2}" y="-9" width="${w}" height="18" rx="4"/><text y="4">${text}</text></g>`);
          }
        }
        out.push(`<circle class="pcur" cx="${f1(c[0])}" cy="${f1(c[1])}" r="4"/>`);
        if (cursor.close && scr.length) out.push(`<circle class="pclose" cx="${f1(scr[0][0])}" cy="${f1(scr[0][1])}" r="10"/>`);
      }
      scr.forEach((q) => out.push(`<circle class="pc" cx="${f1(q[0])}" cy="${f1(q[1])}" r="4.5"/>`));
    }
    svg.innerHTML = out.join('');
    if (editing) positionEditor();
  }

  // ---------- Lifecycle ----------
  // Zoom to the rooms, leaving room for the view buttons (top) and the
  // toolbar + hint (bottom).
  function fit() {
    const b = bounds(rooms().map((r) => r.pts));
    const top = 56, bottom = 96, side = 24;
    const availH = Math.max(80, H - top - bottom), availW = Math.max(80, W - side * 2);
    const ppc = Math.min(availH / (b.d + wallT * 2), availW / (b.w + wallT * 2));
    camera.zoom = (ppc * FRUSTUM) / H;
    const cz = b.cz + (bottom - top) / 2 / ppc; // centre the rooms in the free band
    camera.position.set(b.cx, 3000, cz + 0.01);
    controls.target.set(b.cx, 0, cz);
    camera.updateProjectionMatrix();
    controls.update();
    dirty = true;
  }

  function setVisible(on) {
    grids.forEach((g) => (g.visible = on));
    svg.style.display = on ? 'block' : 'none';
    bar.style.display = on ? 'flex' : 'none';
  }

  function enter() {
    if (active) return;
    active = true;
    mode = 'edit';
    setVisible(true);
    controls.enabled = true;
    fit();
    ctx.setHint(HINT_EDIT);
    renderBar();
  }

  function exit() {
    if (!active) return;
    if (mode === 'draw') cancelDraw();
    pointerCancel();
    closeEditor();
    active = false;
    sel = hover = null;
    setVisible(false);
    controls.enabled = false;
    canvas.style.cursor = '';
    ctx.setHint(null);
  }

  // Layout replaced (load, undo): drop anything that points into the old one.
  function reset() {
    if (mode === 'draw') cancelDraw();
    drawTarget = null;
    drag = press = sel = hover = null;
    closeEditor();
    if (active) controls.enabled = true;
    renderBar();
    dirty = true;
  }

  function resize(w, h) {
    W = w;
    H = h;
    const a = w / h;
    camera.left = (-FRUSTUM * a) / 2;
    camera.right = (FRUSTUM * a) / 2;
    camera.top = FRUSTUM / 2;
    camera.bottom = -FRUSTUM / 2;
    camera.updateProjectionMatrix();
    dirty = true;
  }

  // Per frame while active: grid density, and redraw the overlay if needed.
  function update() {
    const ppc = pxPerCm();
    grids.forEach((g) => (g.visible = g.userData.step * ppc >= 8 || g.userData.step === 100));
    const key = `${camera.position.x},${camera.position.z},${camera.zoom},${W},${H}`;
    if (key !== lastKey || dirty) {
      lastKey = key;
      dirty = false;
      render();
    }
  }

  setVisible(false);
  editBox.style.display = 'none';

  return {
    camera,
    controls,
    get active() {
      return active;
    },
    busy: () => !!drag || mode === 'draw',
    enter,
    exit,
    reset,
    resize,
    update,
    fit,
    startDraw,
    refresh: () => (dirty = true),
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel,
    dblClick,
    keyDown,
  };
}
