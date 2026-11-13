// Wall pieces for a set of rooms, on the floor plane (cm). Pure: used by the
// 3D walls (main.js) and the 2D plan overlay (plan.js).
//
// Each room edge gets an outer wall of thickness T, outside its outline.
// Where two rooms' edges face each other (antiparallel) 0.5–MAX_SHARED cm
// apart, that stretch is a shared wall instead: one piece exactly filling
// the gap, built by the room with the lower id; the other room builds
// nothing there. Corners are mitred using each side's real thickness, so a
// wall ending at a shared stretch stops at the far face of that shared wall
// instead of poking into the neighbouring room.

import { edges } from './polygon.js';

export const MAX_SHARED = 60;

// Stretches of each edge facing another room: cover[ri][i] = [{ t0, t1, d, owner }].
function coverage(rooms, E) {
  return rooms.map((r, ri) =>
    E[ri].map((e) => {
      const list = [];
      rooms.forEach((o, oi) => {
        if (oi === ri) return;
        for (const f of E[oi]) {
          if (e.nx * f.nx + e.nz * f.nz > -0.999) continue; // not facing
          const d = (f.a[0] - e.a[0]) * e.nx + (f.a[1] - e.a[1]) * e.nz;
          if (d < 0.5 || d > MAX_SHARED) continue;
          const ta = (f.a[0] - e.a[0]) * e.ux + (f.a[1] - e.a[1]) * e.uz;
          const tb = (f.b[0] - e.a[0]) * e.ux + (f.b[1] - e.a[1]) * e.uz;
          const t0 = Math.max(0, Math.min(ta, tb)), t1 = Math.min(e.len, Math.max(ta, tb));
          if (t1 - t0 > 1) list.push({ t0, t1, d, owner: r.id < o.id });
        }
      });
      list.sort((p, q) => p.t0 - q.t0);
      // Keep stretches from overlapping each other (first one wins).
      const out = [];
      for (const c of list) {
        const prev = out[out.length - 1];
        if (prev && c.t0 < prev.t1) c.t0 = prev.t1;
        if (c.t1 - c.t0 > 1) out.push(c);
      }
      return out;
    }),
  );
}

// Point outside corner v where the line of edge ep pushed out tp meets the
// line of edge eq pushed out tq. Null when the edges are parallel.
function cornerPoint(v, ep, tp, eq, tq, cap) {
  const det = ep.nx * eq.nz - ep.nz * eq.nx;
  if (Math.abs(det) < 1e-6) return null;
  let x = (tp * eq.nz - ep.nz * tq) / det, z = (ep.nx * tq - eq.nx * tp) / det;
  const len = Math.hypot(x, z);
  if (len > cap) {
    x *= cap / len;
    z *= cap / len;
  }
  return [v[0] + x, v[1] + z];
}

/**
 * → [{ quad: [[x,z] ×4], roomId, edge, shared, d, a, nx, nz }]
 * quad runs inner start, inner end, outer end, outer start. a/nx/nz: a point
 * on the owning room's outline and that edge's outward normal.
 */
export function wallPieces(rooms, T) {
  const E = rooms.map((r) => edges(r.pts));
  const cover = coverage(rooms, E);
  const pieces = [];
  rooms.forEach((r, ri) => {
    const n = r.pts.length, Er = E[ri], C = cover[ri];
    const thickStart = (i) => (C[i].length && C[i][0].t0 < 0.5 ? C[i][0].d : T);
    const thickEnd = (i) => {
      const c = C[i][C[i].length - 1];
      return c && c.t1 > Er[i].len - 0.5 ? c.d : T;
    };
    Er.forEach((e, i) => {
      const prev = (i - 1 + n) % n, next = (i + 1) % n;
      const at = (t, th) => [e.a[0] + e.ux * t + e.nx * th, e.a[1] + e.uz * t + e.nz * th];
      const startOuter = (th) => cornerPoint(e.a, Er[prev], thickEnd(prev), e, th, Math.max(T, th) * 4) || at(0, th);
      const endOuter = (th) => cornerPoint(e.b, e, th, Er[next], thickStart(next), Math.max(T, th) * 4) || at(e.len, th);
      const piece = (t0, t1, th, shared) => {
        const a0 = at(t0, 0), a1 = at(t1, 0);
        const o0 = t0 < 0.5 ? startOuter(th) : at(t0, th);
        const o1 = t1 > e.len - 0.5 ? endOuter(th) : at(t1, th);
        pieces.push({ quad: [a0, a1, o1, o0], roomId: r.id, edge: i, shared, d: th, a: e.a, nx: e.nx, nz: e.nz });
      };
      let t = 0;
      for (const c of C[i]) {
        if (c.t0 - t > 0.5) piece(t, c.t0, T, false);
        if (c.owner) piece(c.t0, c.t1, c.d, true);
        t = c.t1;
      }
      if (e.len - t > 0.5) piece(t, e.len, T, false);
    });
  });
  return pieces;
}

const DEG = Math.PI / 180;

/**
 * Holes the openings (doors/windows) cut in one wall piece →
 * [{ t0, t1, y0, y1 }]: t along the piece's edge from its room corner `a`
 * (unit u = (-nz, nx)), y in cm above the floor. An opening is on the piece
 * when its face is (nearly) parallel to the wall and its centre lies within
 * the wall's thickness plus the plate's depth on either side, so a plate on
 * the far side of a shared wall cuts it too. Openings = items
 * { x, z, rot, w, d, h, y }; the hole is the plate's w × h, clipped to the
 * piece (an opening across two pieces cuts both).
 */
export function pieceHoles(piece, openings) {
  const { a, nx, nz } = piece, ux = -nz, uz = nx;
  const tOf = (p) => (p[0] - a[0]) * ux + (p[1] - a[1]) * uz;
  const pt0 = Math.min(tOf(piece.quad[0]), tOf(piece.quad[1]));
  const pt1 = Math.max(tOf(piece.quad[0]), tOf(piece.quad[1]));
  const holes = [];
  for (const o of openings) {
    const r = o.rot * DEG;
    if (Math.abs(Math.sin(r) * nx + Math.cos(r) * nz) < 0.95) continue; // face not parallel to the wall
    const s = (o.x - a[0]) * nx + (o.z - a[1]) * nz; // outward from the room's face
    if (s < -o.d - 2 || s > piece.d + o.d + 2) continue;
    const tc = tOf([o.x, o.z]);
    const t0 = Math.max(pt0, tc - o.w / 2), t1 = Math.min(pt1, tc + o.w / 2);
    const y0 = Math.max(0, o.y || 0), y1 = (o.y || 0) + o.h;
    if (t1 - t0 > 0.5 && y1 - y0 > 0.5) holes.push({ t0, t1, y0, y1 });
  }
  return holes;
}
