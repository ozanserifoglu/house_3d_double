// Pure 2D footprint math on the floor plane (x, z), all in cm.
// An item is { x, z, w, d, rot } where rot is degrees and maps to
// group.rotation.y = rot * PI / 180.

const DEG = Math.PI / 180;

// Half extents of the item's axis-aligned bounding box after rotation.
export function halfExtents(it) {
  const a = it.rot * DEG, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  return { hx: (c * it.w) / 2 + (s * it.d) / 2, hz: (s * it.w) / 2 + (c * it.d) / 2 };
}

// Keep the item's bounding box inside the room (centre it if it doesn't fit).
export function clampToRoom(it, room) {
  const { hx, hz } = halfExtents(it);
  const mx = room.w / 2 - hx, mz = room.d / 2 - hz;
  it.x = mx < 0 ? 0 : Math.max(-mx, Math.min(mx, it.x));
  it.z = mz < 0 ? 0 : Math.max(-mz, Math.min(mz, it.z));
}

// Pull the item flush against a wall when it is within 8 cm of it.
export function snapToWalls(it, room) {
  const { hx, hz } = halfExtents(it);
  const mx = room.w / 2 - hx, mz = room.d / 2 - hz, range = 8;
  if (mx > 0 && Math.abs(Math.abs(it.x) - mx) < range) it.x = Math.sign(it.x) * mx;
  if (mz > 0 && Math.abs(Math.abs(it.z) - mz) < range) it.z = Math.sign(it.z) * mz;
}

// Doors/windows: within 60 cm of a wall, stick to it and face into the room.
export function snapOpeningToWall(it, room) {
  const { w, d } = room;
  const dist = { l: it.x + w / 2, r: w / 2 - it.x, b: it.z + d / 2, f: d / 2 - it.z };
  const wall = Object.keys(dist).reduce((a, b) => (dist[a] < dist[b] ? a : b));
  if (dist[wall] > 60) return;
  const half = it.d / 2;
  if (wall === 'b') { it.z = -d / 2 + half; it.rot = 0; }
  else if (wall === 'f') { it.z = d / 2 - half; it.rot = 180; }
  else if (wall === 'l') { it.x = -w / 2 + half; it.rot = 90; }
  else { it.x = w / 2 - half; it.rot = 270; }
}

// Footprint corners, same rotation convention as three.js rotation.y.
function corners(it) {
  const a = it.rot * DEG, c = Math.cos(a), s = Math.sin(a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
    const lx = (sx * it.w) / 2, lz = (sz * it.d) / 2;
    return [it.x + lx * c + lz * s, it.z - lx * s + lz * c];
  });
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
