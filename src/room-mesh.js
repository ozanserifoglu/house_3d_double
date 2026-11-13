// three.js meshes for the rooms: floors, skirting, walls (pieces from walls.js).
import * as THREE from 'three';
import { offsetPolygon } from './polygon.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { wallPieces, pieceHoles } from './walls.js';
import { surface } from './textures.js';

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

// Dispose and remove everything in `group`.
function clearGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (o.material.map && !o.material.map.userData.shared) o.material.map.dispose(); // floor maps are shared (textures.js)
      o.material.dispose();
    }
  });
  group.clear();
}

// Replace everything in `group` with the floors and skirting of `rooms`.
export function buildRoomMeshes(group, rooms) {
  clearGroup(group);
  rooms.forEach((r) => {
    // Floor UVs are the shape's coordinates, i.e. cm, as textures.js expects.
    const floorGeo = new THREE.ShapeGeometry(toShape(r.pts));
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: r.floor, ...surface(r.floorTex || 'plain') }));
    floor.receiveShadow = true;
    group.add(floor);

    // Skirting boards (6 cm high, 3 cm deep) along every edge; they stay
    // visible when walls auto-hide.
    const inner = offsetPolygon(r.pts, -3);
    const skirtMat = new THREE.MeshStandardMaterial({ color: '#d9d4ca', roughness: 0.9 });
    const n = r.pts.length;
    r.pts.forEach((p, i) => {
      const j = (i + 1) % n;
      group.add(new THREE.Mesh(prismGeometry([r.pts[i], r.pts[j], inner[j], inner[i]], 0, 6), skirtMat));
    });
  });
}

// Part of convex polygon `pts` where sign·(t(p) − b) ≥ 0 (Sutherland–Hodgman, one plane).
function clipHalf(pts, tOf, b, sign) {
  const out = [], f = (p) => sign * (tOf(p) - b);
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length], fp = f(p), fq = f(q);
    if (fp >= 0) out.push(p);
    if ((fp >= 0) !== (fq >= 0)) {
      const k = fp / (fp - fq);
      out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]);
    }
  });
  return out;
}

// One wall piece, 0..H high, with rectangular holes ({t0,t1,y0,y1}, see
// pieceHoles). The piece's (mitred, convex) quad is cut across at every hole
// side; each slice is built only where no hole covers it, so the slices'
// side faces form the reveals and the mitres stay intact.
function wallGeometry(piece, H, holes) {
  if (!holes.length) return prismGeometry(piece.quad, 0, H);
  const ux = -piece.nz, uz = piece.nx;
  const tOf = (p) => (p[0] - piece.a[0]) * ux + (p[1] - piece.a[1]) * uz;
  const cuts = [...new Set(holes.flatMap((h) => [h.t0, h.t1]))].sort((p, q) => p - q);
  const bounds = [-Infinity, ...cuts, Infinity];
  const parts = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const lo = bounds[i], hi = bounds[i + 1];
    let poly = piece.quad;
    if (lo > -Infinity) poly = clipHalf(poly, tOf, lo, 1);
    if (hi < Infinity) poly = clipHalf(poly, tOf, hi, -1);
    if (poly.length < 3) continue;
    // Solid heights: 0..H minus the holes covering this slice.
    const mid = lo === -Infinity ? hi - 1 : hi === Infinity ? lo + 1 : (lo + hi) / 2;
    const gaps = holes.filter((h) => h.t0 <= mid && mid <= h.t1).sort((p, q) => p.y0 - q.y0);
    let y = 0;
    for (const g of gaps) {
      if (g.y0 - y > 0.1) parts.push(prismGeometry(poly, y, g.y0 - y));
      y = Math.max(y, g.y1);
    }
    if (H - y > 0.1) parts.push(prismGeometry(poly, y, H - y));
  }
  if (!parts.length) return new THREE.BufferGeometry(); // the hole covers the whole piece
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}

// A mesh that only casts shadows: it writes neither colour nor depth, so the
// camera never sees it, but the shadow pass (which uses its own depth
// material) still draws it. Tagged so main.js keeps it out of the ambient
// occlusion pass, which renders every visible mesh with its own material.
function shadowCaster(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.userData.shadowOnly = true;
  return m;
}

// Replace everything in `group` with the walls of `rooms`: outer walls wallT
// thick, one shared wall where rooms face each other (see walls.js), with
// holes where `openings` (door/window items) sit. A shared wall takes its
// owning room's colour/height. Returns [{ m: Mesh, a: [x, z], nx, nz, shared }]
// — a point on the wall's inside face and its outward normal, for
// updateWallVisibility.
//
// The sun's shadows don't depend on what the camera sees: each wall has a
// shadow-only twin that stays when the wall itself auto-hides, and an
// invisible ceiling over each room (walls included) keeps the sun out except
// through the door/window holes.
export function buildWallMeshes(group, rooms, wallT, openings) {
  clearGroup(group);
  const walls = [];
  const wallMats = new Map(rooms.map((r) => [r.id, new THREE.MeshStandardMaterial({ color: r.wall, roughness: 0.95 })]));
  const casterMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const heights = new Map(rooms.map((r) => [r.id, r.h]));
  wallPieces(rooms, wallT).forEach((p) => {
    const geo = wallGeometry(p, heights.get(p.roomId), pieceHoles(p, openings));
    const m = new THREE.Mesh(geo, wallMats.get(p.roomId));
    m.receiveShadow = true;
    group.add(m, shadowCaster(geo, casterMat));
    walls.push({ m, a: p.a, nx: p.nx, nz: p.nz, shared: p.shared });
  });
  rooms.forEach((r) => group.add(shadowCaster(prismGeometry(offsetPolygon(r.pts, wallT), r.h, CEILING_T), casterMat)));
  return walls;
}

const CEILING_T = 10; // shadow-only ceiling slab, cm

// Hide walls whose outside faces the camera, and all walls when looking
// (near) straight down. Shared walls are inside the apartment: they only
// hide from above.
export function updateWallVisibility(walls, cam, topDown) {
  walls.forEach((wall) => {
    const camOutside = !wall.shared && (cam.x - wall.a[0]) * wall.nx + (cam.z - wall.a[1]) * wall.nz > 0;
    wall.m.visible = !camOutside && !topDown;
  });
}
