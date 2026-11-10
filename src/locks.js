// Locked walls. room.locked = [[[x, z], [x, z]], ...]: the two end corners
// of each locked wall. A locked wall's corners never move (Plan view refuses
// any edit that would move them), so a lock is found again by its end points.
// That survives corners being added, removed or renumbered elsewhere.

import { dist } from './polygon.js';

const near = (p, q) => dist(p, q) < 0.05;
const matches = (seg, a, b) => (near(seg[0], a) && near(seg[1], b)) || (near(seg[0], b) && near(seg[1], a));
const wallEnds = (room, i) => [room.pts[i], room.pts[(i + 1) % room.pts.length]];

export function isWallLocked(room, i) {
  const [a, b] = wallEnds(room, i);
  return (room.locked || []).some((s) => matches(s, a, b));
}

// A corner of a locked wall can't move.
export function isCornerPinned(room, k) {
  const n = room.pts.length;
  return isWallLocked(room, k) || isWallLocked(room, (k - 1 + n) % n);
}

export function toggleWallLock(room, i) {
  const [a, b] = wallEnds(room, i);
  const list = room.locked || [];
  room.locked = isWallLocked(room, i) ? list.filter((s) => !matches(s, a, b)) : [...list, [[...a], [...b]]];
}

// Drop locks whose wall is no longer in the outline (outline redrawn or reset).
export function pruneLocks(room) {
  const n = room.pts.length;
  room.locked = (room.locked || []).filter((s) => room.pts.some((a, i) => matches(s, a, room.pts[(i + 1) % n])));
}

// Locks from a saved layout: keep only well-formed [[x, z], [x, z]] entries.
export function parseLocks(list) {
  const pt = (p) => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]);
  return Array.isArray(list) ? list.filter((s) => Array.isArray(s) && pt(s[0]) && pt(s[1])).map((s) => [[+s[0][0], +s[0][1]], [+s[1][0], +s[1][1]]]) : [];
}
