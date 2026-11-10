// Pure polygon helpers on the floor plane, all in cm.
// A polygon is [[x, z], ...], closed implicitly, wound so signedArea() > 0.
// With that winding the outward normal of edge a→b is (uz, -ux).

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function signedArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

// Drop repeated points (≤ 0.5 cm apart) and fix the winding.
export function normalizePolygon(pts) {
  const out = [];
  for (const p of pts) {
    if (!out.length || dist(p, out[out.length - 1]) > 0.5) out.push([p[0], p[1]]);
  }
  while (out.length > 1 && dist(out[0], out[out.length - 1]) <= 0.5) out.pop();
  if (signedArea(out) < 0) out.reverse();
  return out;
}

export function edges(pts) {
  const n = pts.length;
  return pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1e-9;
    const ux = dx / len, uz = dz / len;
    return { a, b, dx, dz, len, ux, uz, nx: uz, nz: -ux };
  });
}

// Each vertex moved t cm outward (t < 0: inward), corners mitred.
// Very sharp corners are capped at maxMiter·|t| so they don't spike.
export function offsetPolygon(pts, t, maxMiter = 4) {
  const E = edges(pts), n = pts.length;
  return pts.map((p, i) => {
    const e0 = E[(i - 1 + n) % n], e1 = E[i];
    let mx = e0.nx + e1.nx, mz = e0.nz + e1.nz;
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) return [p[0] + e1.nx * t, p[1] + e1.nz * t]; // edge folds back on itself
    const k = t / (1 + e0.nx * e1.nx + e0.nz * e1.nz);
    let ox = mx * k, oz = mz * k;
    const len = Math.hypot(ox, oz), cap = Math.abs(t) * maxMiter;
    if (len > cap) {
      ox *= cap / len;
      oz *= cap / len;
    }
    return [p[0] + ox, p[1] + oz];
  });
}

export function pointInPolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

// Closest point on segment a-b. t = distance from a along the segment (cm).
export function closestOnSegment(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const s = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  const x = a[0] + dx * s, z = a[1] + dz * s;
  return { x, z, t: s * Math.sqrt(l2), d: Math.hypot(p[0] - x, p[1] - z) };
}

function orient(a, b, c) {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return Math.abs(v) < 1e-9 ? 0 : Math.sign(v);
}
const onSeg = (a, b, c) =>
  Math.min(a[0], b[0]) - 1e-9 <= c[0] && c[0] <= Math.max(a[0], b[0]) + 1e-9 &&
  Math.min(a[1], b[1]) - 1e-9 <= c[1] && c[1] <= Math.max(a[1], b[1]) + 1e-9;

// Touching counts as intersecting.
function segmentsIntersect(p1, p2, p3, p4) {
  const o1 = orient(p1, p2, p3), o2 = orient(p1, p2, p4), o3 = orient(p3, p4, p1), o4 = orient(p3, p4, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && onSeg(p1, p2, p3)) || (o2 === 0 && onSeg(p1, p2, p4)) ||
    (o3 === 0 && onSeg(p3, p4, p1)) || (o4 === 0 && onSeg(p3, p4, p2));
}

// A usable room outline: ≥ 3 corners, some area, no edge crossing or
// touching another, no edge folding straight back onto the previous one.
export function isSimple(pts) {
  const n = pts.length;
  if (n < 3 || Math.abs(signedArea(pts)) < 1) return false;
  const E = edges(pts);
  for (let i = 0; i < n; i++) {
    const e0 = E[i], e1 = E[(i + 1) % n];
    if (e0.ux * e1.ux + e0.uz * e1.uz < -0.9999) return false;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the closing edge
      if (segmentsIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false;
    }
  }
  return true;
}

// Two outlines overlap, touch, or one contains the other.
export function polygonsOverlap(a, b) {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segmentsIntersect(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
    }
  }
  return pointInPolygon(a[0], b) || pointInPolygon(b[0], a);
}

// A point guaranteed inside: the centroid if it is inside, otherwise the
// middle of the widest inside span on a horizontal line through it.
export function interiorPoint(pts) {
  const A = signedArea(pts);
  let cx = 0, cz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], f = a[0] * b[1] - b[0] * a[1];
    cx += (a[0] + b[0]) * f;
    cz += (a[1] + b[1]) * f;
  }
  const c = A ? [cx / (6 * A), cz / (6 * A)] : [pts[0][0], pts[0][1]];
  if (pointInPolygon(c, pts)) return c;
  const xs = [];
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if (a[1] > c[1] !== b[1] > c[1]) xs.push(((b[0] - a[0]) * (c[1] - a[1])) / (b[1] - a[1]) + a[0]);
  }
  xs.sort((p, q) => p - q);
  let best = null;
  for (let k = 0; k + 1 < xs.length; k += 2) {
    if (!best || xs[k + 1] - xs[k] > best[1] - best[0]) best = [xs[k], xs[k + 1]];
  }
  return best ? [(best[0] + best[1]) / 2, c[1]] : [pts[0][0], pts[0][1]];
}

export function bounds(polys) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const pts of polys) {
    for (const [x, z] of pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  if (minX === Infinity) minX = maxX = minZ = maxZ = 0;
  return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ };
}

export const rectPts = (w, d, cx = 0, cz = 0) => [
  [cx - w / 2, cz - d / 2],
  [cx + w / 2, cz - d / 2],
  [cx + w / 2, cz + d / 2],
  [cx - w / 2, cz + d / 2],
];

// { w, d, cx, cz } if the outline is an axis-aligned rectangle, else null.
export function asRect(pts) {
  if (pts.length !== 4) return null;
  if (!edges(pts).every((e) => Math.abs(e.dx) < 0.01 || Math.abs(e.dz) < 0.01)) return null;
  const b = bounds([pts]);
  return { w: b.w, d: b.d, cx: b.cx, cz: b.cz };
}
