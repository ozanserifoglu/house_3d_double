// three.js meshes for the rooms: floors, skirting, walls (pieces from walls.js).
import * as THREE from 'three';
import { offsetPolygon } from './polygon.js';
import { wallPieces } from './walls.js';
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

// Replace everything in `group` with meshes for `rooms`. Returns the walls:
// [{ m: Mesh, a: [x, z], nx, nz, shared }] — a point on the wall's inside
// face and its outward normal, for updateWallVisibility.
export function buildRoomMeshes(group, rooms, wallT) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (o.material.map && !o.material.map.userData.shared) o.material.map.dispose(); // floor maps are shared (textures.js)
      o.material.dispose();
    }
  });
  group.clear();
  const walls = [];

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

  // Walls: outer walls wallT thick, one shared wall where rooms face each
  // other (see walls.js). A shared wall takes its owning room's colour/height.
  const wallMats = new Map(rooms.map((r) => [r.id, new THREE.MeshStandardMaterial({ color: r.wall, roughness: 0.95 })]));
  const heights = new Map(rooms.map((r) => [r.id, r.h]));
  wallPieces(rooms, wallT).forEach((p) => {
    const m = new THREE.Mesh(prismGeometry(p.quad, 0, heights.get(p.roomId)), wallMats.get(p.roomId));
    m.receiveShadow = true;
    group.add(m);
    walls.push({ m, a: p.a, nx: p.nx, nz: p.nz, shared: p.shared });
  });
  return walls;
}

// Hide walls whose outside faces the camera, and all walls when looking
// (near) straight down. Shared walls are inside the apartment: they only
// hide from above.
export function updateWallVisibility(walls, cam, topDown) {
  walls.forEach((wall) => {
    const camOutside = !wall.shared && (cam.x - wall.a[0]) * wall.nx + (cam.z - wall.a[1]) * wall.nz > 0;
    wall.m.visible = !camOutside && !topDown;
  });
}
