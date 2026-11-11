// Locked walls keep their LENGTH (and angle), not their place: an edit next
// to a locked wall may slide it along, but never stretch or turn it.
//
// room.locked = [[[x, z], [x, z]], ...]: each locked wall's end corners
// (start → end in outline order) where it was last placed. After an edit a
// lock is found again as the wall with the same start → end vector nearest
// to where it was (relocateLocks). That survives corners being added,
// removed or renumbered elsewhere; an edit after which some locked wall has
// no such match changed that wall, and Plan view refuses it.

import { dist } from './polygon.js';

const near = (p, q) => dist(p, q) < 0.05;
const matches = (seg, a, b) => (near(seg[0], a) && near(seg[1], b)) || (near(seg[0], b) && near(seg[1], a));
const wallEnds = (pts, i) => [pts[i], pts[(i + 1) % pts.length]];

export function isWallLocked(room, i) {
  const [a, b] = wallEnds(room.pts, i);
  return (room.locked || []).some((s) => matches(s, a, b));
}

// Which walls of outline `pts` (wall k = pts[k] → pts[k+1]) carry one of `locks`.
export function lockedWalls(pts, locks) {
  return pts.map((_, i) => {
    const [a, b] = wallEnds(pts, i);
    return (locks || []).some((s) => matches(s, a, b));
  });
}

// Corner k ends a locked wall (deleting it would remove that wall).
export function endsLockedWall(room, k) {
  const n = room.pts.length;
  return isWallLocked(room, k) || isWallLocked(room, (k - 1 + n) % n);
}

export function toggleWallLock(room, i) {
  const [a, b] = wallEnds(room.pts, i);
  const list = room.locked || [];
  room.locked = isWallLocked(room, i) ? list.filter((s) => !matches(s, a, b)) : [...list, [[...a], [...b]]];
}

// The locks after the outline became `pts`: each one moved onto the wall with
// the same vector nearest to its old place. Null if a locked wall changed
// length or angle (no wall left with its vector).
export function relocateLocks(locks, pts) {
  const n = pts.length, used = new Set(), out = [];
  for (const s of locks || []) {
    // A wall still exactly in place keeps its lock (either way round)...
    let best = pts.findIndex((_, i) => !used.has(i) && matches(s, ...wallEnds(pts, i)));
    if (best < 0) {
      // ...else the nearest wall with the same start → end vector.
      const vx = s[1][0] - s[0][0], vz = s[1][1] - s[0][1];
      const mx = (s[0][0] + s[1][0]) / 2, mz = (s[0][1] + s[1][1]) / 2;
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const [a, b] = wallEnds(pts, i);
        if (used.has(i) || Math.abs(b[0] - a[0] - vx) > 0.05 || Math.abs(b[1] - a[1] - vz) > 0.05) continue;
        const d = Math.hypot((a[0] + b[0]) / 2 - mx, (a[1] + b[1]) / 2 - mz);
        if (d < bestD) (best = i), (bestD = d);
      }
    }
    if (best < 0) return null;
    used.add(best);
    const [a, b] = wallEnds(pts, best);
    out.push([[a[0], a[1]], [b[0], b[1]]]);
  }
  return out;
}

// Carry locked walls along with an edit. `moved` maps the corners the edit
// places itself to their [dx, dz] ([0, 0] = held where it is). A locked wall
// with one corner moved moves whole, so it keeps its length. From a corner
// moved that way, a wall square to the motion moves whole too, so it stays
// square (that is how a rectangle's far side follows a locked wall). The
// edit's own corners don't apply that square rule, so edits away from locked
// walls behave exactly as without locks. Returns the new corner list.
export function carryLocked(base, locked, moved) {
  const n = base.length, out = new Map(moved);
  const queue = [...moved.keys()].map((k) => [k, true]);
  while (queue.length) {
    const [k, own] = queue.shift();
    const v = out.get(k), vl = Math.hypot(v[0], v[1]);
    if (vl < 1e-9) continue;
    for (const [j, w] of [[(k + 1) % n, k], [(k - 1 + n) % n, (k - 1 + n) % n]]) {
      if (out.has(j)) continue;
      const dx = base[j][0] - base[k][0], dz = base[j][1] - base[k][1], len = Math.hypot(dx, dz);
      const square = !own && len > 1e-6 && Math.abs(dx * v[0] + dz * v[1]) < 1e-3 * len * vl;
      if (locked[w] || square) {
        out.set(j, v);
        queue.push([j, false]);
      }
    }
  }
  return base.map((p, k) => {
    const v = out.get(k);
    return v ? [p[0] + v[0], p[1] + v[1]] : [p[0], p[1]];
  });
}

// Drop locks whose wall is no longer in the outline (outline redrawn).
export function pruneLocks(room) {
  const n = room.pts.length;
  room.locked = (room.locked || []).filter((s) => room.pts.some((a, i) => matches(s, a, room.pts[(i + 1) % n])));
}

// Locks from a saved layout: keep only well-formed [[x, z], [x, z]] entries.
export function parseLocks(list) {
  const pt = (p) => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]);
  return Array.isArray(list) ? list.filter((s) => Array.isArray(s) && pt(s[0]) && pt(s[1])).map((s) => [[+s[0][0], +s[0][1]], [+s[1][0], +s[1][1]]]) : [];
}
