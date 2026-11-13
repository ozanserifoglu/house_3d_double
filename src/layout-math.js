// Pure 2D footprint math on the floor plane (x, z), all in cm.
// An item is { x, z, w, d, rot } where rot is degrees and maps to
// group.rotation.y = rot * PI / 180. A room is { pts } (see polygon.js).

import { edges, offsetPolygon, pointInPolygon, closestOnSegment, interiorPoint, bounds } from './polygon.js';

const DEG = Math.PI / 180;

// Footprint corners, same rotation convention as three.js rotation.y.
export function corners(it) {
  const a = it.rot * DEG, c = Math.cos(a), s = Math.sin(a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
    const lx = (sx * it.w) / 2, lz = (sz * it.d) / 2;
    return [it.x + lx * c + lz * s, it.z - lx * s + lz * c];
  });
}

// Is the floor point (x, z) inside the item's footprint?
export function pointInFootprint(x, z, it) {
  const a = it.rot * DEG, c = Math.cos(a), s = Math.sin(a);
  const dx = x - it.x, dz = z - it.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c; // inverse of corners()
  return Math.abs(lx) <= it.w / 2 && Math.abs(lz) <= it.d / 2;
}

// The item's rear `depth` cm (its local -z side) as a footprint of its own.
export function backStrip(it, depth) {
  const a = it.rot * DEG, lz = -(it.d - depth) / 2;
  return { x: it.x + lz * Math.sin(a), z: it.z + lz * Math.cos(a), w: it.w, d: depth, rot: it.rot };
}

// The room containing (x, z), or null.
export function roomAt(x, z, rooms) {
  return rooms.find((r) => pointInPolygon([x, z], r.pts)) || null;
}

// The part of polygon `poly` lying across edge e's length, as signed
// distances from the edge line (+ = outside the room). The ends are
// trimmed by 0.01 cm so merely touching an edge's end doesn't count.
function distancesAcrossEdge(poly, e) {
  const along = (p) => (p[0] - e.a[0]) * e.ux + (p[1] - e.a[1]) * e.uz;
  const clip = (pts, keep, cut) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length], kp = keep(p), kq = keep(q);
      if (kp) out.push(p);
      if (kp !== kq) out.push(cut(p, q));
    }
    return out;
  };
  const cutAt = (v) => (p, q) => {
    const s = (v - along(p)) / (along(q) - along(p));
    return [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s];
  };
  const eps = 0.01;
  let pts = clip(poly, (p) => along(p) >= eps, cutAt(eps));
  pts = clip(pts, (p) => along(p) <= e.len - eps, cutAt(e.len - eps));
  return pts.map((p) => (p[0] - e.a[0]) * e.nx + (p[1] - e.a[1]) * e.nz);
}

// For each wall the item crosses: the two pushes along the wall's normal
// that would clear it (inward, outward), and the smaller one's size.
function crossings(it, E) {
  const out = [];
  for (const e of E) {
    const ds = distancesAcrossEdge(corners(it), e);
    if (!ds.length) continue;
    const min = Math.min(...ds), max = Math.max(...ds);
    if (max > 0.01 && min < -0.01) out.push({ e, pushes: [max, min], depth: Math.min(max, -min) });
  }
  return out;
}

// Keep the item's footprint inside a room. The room is the one holding the
// item's centre; if none does, the centre is pulled into the nearest room
// first. Then, one wall at a time, a push that clears a crossed wall is
// applied: of the pushes that keep the centre in the room, the one leaving
// the least overlap overall, then the shortest. (Judging each wall alone
// makes a piece on a column bounce between its two side faces.)
// Pieces too big for the room end up centred in it.
export function clampToRooms(it, rooms) {
  if (!rooms.length) return;
  let room = roomAt(it.x, it.z, rooms);
  if (!room) {
    // Nearest point on the outline shrunk 1 cm inward (so it is inside even
    // at a corner, where a nudge along one wall lands on the other).
    let best = null;
    for (const r of rooms) {
      const inner = offsetPolygon(r.pts, -1);
      for (const e of edges(inner)) {
        const c = closestOnSegment([it.x, it.z], e.a, e.b);
        if (!best || c.d < best.c.d) best = { c, r };
      }
    }
    room = best.r;
    it.x = best.c.x;
    it.z = best.c.z;
    if (!pointInPolygon([it.x, it.z], room.pts)) [it.x, it.z] = interiorPoint(room.pts);
  }
  const E = edges(room.pts);
  for (let pass = 0; pass < 30; pass++) {
    const cross = crossings(it, E);
    if (!cross.length) return;
    let best = null;
    for (const { e, pushes } of cross) {
      for (const push of pushes) {
        const x = it.x - e.nx * push, z = it.z - e.nz * push;
        if (!pointInPolygon([x, z], room.pts)) continue;
        const left = crossings({ ...it, x, z }, E).reduce((s, c) => s + c.depth, 0);
        if (!best || left < best.left - 0.01 || (left < best.left + 0.01 && Math.abs(push) < Math.abs(best.push))) best = { x, z, push, left };
      }
    }
    if (!best) break;
    it.x = best.x;
    it.z = best.z;
  }
  // Pushing got stuck (e.g. the piece only fits past an inside corner):
  // take the nearest spot on a 10 cm grid where it fits.
  const b = bounds([room.pts]), spots = [];
  for (let x = Math.ceil(b.minX / 10) * 10; x <= b.maxX; x += 10) {
    for (let z = Math.ceil(b.minZ / 10) * 10; z <= b.maxZ; z += 10) spots.push([x, z, (x - it.x) ** 2 + (z - it.z) ** 2]);
  }
  spots.sort((p, q) => p[2] - q[2]);
  for (const [x, z] of spots) {
    if (pointInPolygon([x, z], room.pts) && !crossings({ ...it, x, z }, E).length) {
      it.x = x;
      it.z = z;
      return;
    }
  }
  [it.x, it.z] = interiorPoint(room.pts); // doesn't fit anywhere
}

// Pull the item flush against a wall of its room when within 8 cm of it.
export function snapToWalls(it, rooms) {
  const room = roomAt(it.x, it.z, rooms);
  if (!room) return;
  for (const e of edges(room.pts)) {
    const ds = distancesAcrossEdge(corners(it), e);
    if (!ds.length) continue;
    const gap = -Math.max(...ds); // cm between the item and this wall
    if (gap > 0 && gap < 8) {
      it.x += e.nx * gap;
      it.z += e.nz * gap;
    }
  }
}

// Doors/windows: within 60 cm of a wall, stick to it, face into the room,
// and stay within the wall's length.
export function snapOpeningToWall(it, rooms) {
  let best = null;
  for (const r of rooms) {
    for (const e of edges(r.pts)) {
      const c = closestOnSegment([it.x, it.z], e.a, e.b);
      if (!best || c.d < best.c.d) best = { c, e };
    }
  }
  if (!best || best.c.d > 60) return;
  const { c, e } = best;
  const t = e.len <= it.w ? e.len / 2 : Math.max(it.w / 2, Math.min(e.len - it.w / 2, c.t));
  it.x = e.a[0] + e.ux * t - (e.nx * it.d) / 2;
  it.z = e.a[1] + e.uz * t - (e.nz * it.d) / 2;
  const rot = Math.atan2(-e.nx, -e.nz) / DEG; // local +z (front) → into the room
  it.rot = ((Math.round(rot * 100) / 100) % 360 + 360) % 360;
}

// Does the opening's front (local +z) face into the room? Judged against the
// nearest wall roughly parallel to it (within 60°) in the room holding its
// centre: snapOpeningToWall turns the front inward, a typed/R rotation can
// turn it away. (Perpendicular walls are skipped: near a corner they can be
// as close as the wall the opening is on, and say nothing about its facing.)
export function frontFacesRoom(it, rooms) {
  const a = it.rot * DEG, fx = Math.sin(a), fz = Math.cos(a); // front direction
  const room = roomAt(it.x, it.z, rooms);
  let best = null;
  for (const r of room ? [room] : rooms) {
    for (const e of edges(r.pts)) {
      if (Math.abs(fx * e.nx + fz * e.nz) < 0.5) continue;
      const c = closestOnSegment([it.x, it.z], e.a, e.b);
      if (!best || c.d < best.c.d) best = { c, e };
    }
  }
  return !best || fx * best.e.nx + fz * best.e.nz < 0; // front · outward < 0 → inward
}

// ---------- Doors: a fixed frame and a leaf swinging on a hinge ----------
// Door item fields (all optional; missing = closed, left, in):
//   open:  leaf angle in degrees, 0 = closed, up to 180.
//   hinge: 'left' | 'right', seen from the door's front (local +z).
//   swing: 'in' = the leaf swings towards the front (into the room the door
//          was snapped to); 'out' = towards the back, through the wall.
// In the door's local frame (front +z, plate depth d centred on z = 0):
//   sx = +1 when the leaf extends +x from its hinge (left hinge), else -1;
//   sz = +1 when it swings to +z (in), else -1.
// The hinge axis sits on the jamb's inner edge, on the face the leaf swings
// towards; a positive local rotation.y turns +x towards -z, hence openSign.
export const DOOR_DEFAULTS = { open: 0, hinge: 'left', swing: 'in' };
export const DOOR_SWEEP_MIN = 90; // the swing area always covers at least a quarter turn

export function doorParts(it) {
  const jamb = Math.max(2, Math.min(5, it.w / 6));
  const sx = it.hinge === 'right' ? -1 : 1, sz = it.swing === 'out' ? -1 : 1;
  return {
    jamb,
    leafW: Math.max(1, it.w - 2 * jamb - 0.6), // 0.3 cm gap at each jamb
    leafT: Math.max(1, Math.min(4, it.d)),
    sx,
    sz,
    hingeX: -sx * (it.w / 2 - jamb),
    hingeZ: (sz * it.d) / 2,
    openSign: -sx * sz,
  };
}

// The floor area the door's leaf sweeps, as a world polygon (hinge + arc), and
// the leaf's free edge at its current angle (for drawing the leaf in Plan).
export function doorSwing(it) {
  const p = doorParts(it);
  const a = it.rot * DEG, c = Math.cos(a), s = Math.sin(a);
  const world = (lx, lz) => [it.x + lx * c + lz * s, it.z - lx * s + lz * c];
  const r = p.leafW + 0.3;
  // The free edge with the leaf turned by phi degrees, in the door's frame.
  const tip = (phi) => {
    const t = p.openSign * phi * DEG;
    return world(p.hingeX + p.sx * r * Math.cos(t), p.hingeZ - p.sx * r * Math.sin(t));
  };
  const open = Math.max(0, Math.min(180, it.open || 0));
  const sweep = Math.max(DOOR_SWEEP_MIN, open);
  const steps = Math.ceil(sweep / 10);
  const poly = [world(p.hingeX, p.hingeZ)];
  for (let i = 0; i <= steps; i++) poly.push(tip((sweep * i) / steps));
  return { hinge: poly[0], tip: tip(open), poly };
}

// Separating-axis test for two rotated rectangles. Touching (≤0.5 cm) is not overlap.
export function footprintsOverlap(a, b) {
  const pa = corners(a), pb = corners(b);
  const project = (pts, nx, nz) => {
    let min = 1e9, max = -1e9;
    for (const p of pts) {
      const v = p[0] * nx + p[1] * nz;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return [min, max];
  };
  for (const poly of [pa, pb]) {
    for (let i = 0; i < 4; i++) {
      const p = poly[i], q = poly[(i + 1) % 4];
      const nx = -(q[1] - p[1]), nz = q[0] - p[0];
      const ra = project(pa, nx, nz), rb = project(pb, nx, nz);
      if (ra[1] <= rb[0] + 0.5 || rb[1] <= ra[0] + 0.5) return false;
    }
  }
  return true;
}
