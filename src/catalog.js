// Furniture catalog (default sizes, cm) and procedural builders.
// Every builder: BUILD[type](group, w, d, h, color).
// Origin is at the floor centre of the piece; its front faces +z.
import * as THREE from 'three';

// Stacking flags (all optional):
//   top:   has a flat top at its height that `onTop` pieces can rest on.
//   under: leaves knee room below its top (TOP_T thick) for `tuck` pieces.
//   tuck:  may slide partly under an `under` piece: its seat (seatTop) must
//          clear the underside and its backrest (rear BACK_T cm) stay outside.
//   onTop: dragged/added onto a `top` piece, it is lifted onto it; dragged
//          off, it drops to the floor. A `top` piece carries what rests on it.
export const TOP_T = 4; // table/desk top thickness
export const BACK_T = 4; // chair backrest depth
export const seatTop = (h) => h * 0.5 + 4; // chair seat height (top face)

export const CATALOG = {
  bed: { label: 'Bed', w: 160, d: 200, h: 100, color: '#8fa3b8' },
  sofa: { label: 'Sofa', w: 200, d: 90, h: 85, color: '#6f8f7a' },
  armchair: { label: 'Armchair', w: 85, d: 85, h: 85, color: '#c58b5b' },
  table: { label: 'Dining table', w: 140, d: 80, h: 75, color: '#a9784f', top: true, under: true },
  chair: { label: 'Chair', w: 45, d: 45, h: 90, color: '#d9c7a8', tuck: true },
  desk: { label: 'Desk', w: 140, d: 65, h: 75, color: '#e6e0d4', top: true, under: true },
  coffee: { label: 'Coffee table', w: 100, d: 55, h: 42, color: '#8a6a4a', top: true, under: true },
  wardrobe: { label: 'Wardrobe', w: 120, d: 55, h: 220, color: '#efece6' },
  shelf: { label: 'Bookshelf', w: 80, d: 30, h: 180, color: '#b58d62' },
  tvunit: { label: 'TV unit', w: 160, d: 40, h: 50, color: '#5b4a3d', top: true },
  tv: { label: 'TV', w: 120, d: 20, h: 70, color: '#1c1c1e', y: 50 },
  // noCol: excluded from overlap checks. opening: snaps to the nearest wall.
  rug: { label: 'Rug', w: 200, d: 140, h: 1, color: '#b9575b', noCol: true },
  lamp: { label: 'Floor lamp', w: 35, d: 35, h: 160, color: '#f1d9a0' },
  tablelamp: { label: 'Table lamp', w: 25, d: 25, h: 50, color: '#f1d9a0', onTop: true },
  plant: { label: 'Plant', w: 40, d: 40, h: 110, color: '#4f8a4f', onTop: true },
  door: { label: 'Door', w: 90, d: 8, h: 205, color: '#8b6b4a', noCol: true, opening: true },
  window: { label: 'Window', w: 120, d: 8, h: 120, color: '#9cc6e6', y: 90, noCol: true, opening: true },
  box: { label: 'Custom box', w: 60, d: 60, h: 60, color: '#999999', top: true },
};

const lighten = (c, t) => '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), t).getHexString();
const darken = (c, t) => '#' + new THREE.Color(c).multiplyScalar(t).getHexString();

function material(color, opts) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
}

// Box of size w×h×d whose bottom sits at y.
function box(g, w, h, d, x, y, z, color, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color, opts));
  m.position.set(x, y + h / 2, z);
  g.add(m);
  return m;
}

// Cylinder whose bottom sits at y.
function cyl(g, rTop, rBottom, h, x, y, z, color, opts) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 24), material(color, opts));
  m.position.set(x, y + h / 2, z);
  g.add(m);
  return m;
}

const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

export const BUILD = {
  bed(g, w, d, h, c) {
    box(g, w, 30, d, 0, 0, 0, darken(c, 0.6)); // frame
    box(g, w - 6, 22, d - 8, 0, 30, 4, '#f4f1ea'); // mattress
    box(g, w - 4, 26, d * 0.55, 0, 30, d / 2 - d * 0.275 - 4, c); // duvet
    box(g, w, h, 8, 0, 0, -d / 2 + 4, darken(c, 0.6)); // headboard
    [-1, 1].forEach((s) => box(g, w / 2 - 12, 10, 34, (s * w) / 4, 52, -d / 2 + 30, '#ffffff')); // pillows
  },
  sofa(g, w, d, h, c) {
    const arm = Math.min(w * 0.14, 16);
    box(g, w, h * 0.42, d, 0, 0, 0, darken(c, 0.85)); // base
    box(g, w - arm * 2, h * 0.14, d * 0.72, 0, h * 0.42, d * 0.12, lighten(c, 0.12)); // cushion
    box(g, w, h * 0.58, d * 0.25, 0, h * 0.42, -d / 2 + d * 0.125, c); // back
    [-1, 1].forEach((s) => box(g, arm, h * 0.62, d * 0.82, s * (w / 2 - arm / 2), 0, d * 0.09, c)); // arms
  },
  table(g, w, d, h, c) {
    box(g, w, TOP_T, d, 0, h - TOP_T, 0, c);
    const lx = w / 2 - 6, lz = d / 2 - 6, leg = Math.max(3, Math.min(6, w / 14));
    CORNERS.forEach(([sx, sz]) => box(g, leg, h - TOP_T, leg, sx * lx, 0, sz * lz, darken(c, 0.8)));
  },
  chair(g, w, d, h, c) {
    box(g, w, 4, d, 0, seatTop(h) - 4, 0, c); // seat
    CORNERS.forEach(([sx, sz]) => box(g, 3, h * 0.5, 3, sx * (w / 2 - 3), 0, sz * (d / 2 - 3), darken(c, 0.7)));
    box(g, w, h * 0.5, BACK_T, 0, h * 0.5, -d / 2 + BACK_T / 2, c); // back
  },
  desk(g, w, d, h, c) {
    box(g, w, TOP_T, d, 0, h - TOP_T, 0, c);
    [-1, 1].forEach((s) => box(g, 4, h - TOP_T, d - 4, s * (w / 2 - 2), 0, 0, darken(c, 0.88)));
    box(g, w - 8, h * 0.5, 2, 0, h * 0.45, -d / 2 + 3, darken(c, 0.88)); // modesty panel
  },
  wardrobe(g, w, d, h, c) {
    box(g, w, h, d, 0, 0, 0, c);
    [-1, 1].forEach((s) => {
      box(g, w / 2 - 3, h - 10, 1.5, (s * w) / 4, 5, d / 2 + 0.5, darken(c, 0.93)); // door
      box(g, 2, 28, 2.5, s * 4, h * 0.45, d / 2 + 1.5, '#555'); // handle
    });
  },
  shelf(g, w, d, h, c) {
    [-1, 1].forEach((s) => box(g, 3, h, d, s * (w / 2 - 1.5), 0, 0, c)); // sides
    box(g, w, h, 2, 0, 0, -d / 2 + 1, darken(c, 0.85)); // back
    const shelves = 5;
    const bookColors = ['#c0504d', '#4f81bd', '#9bbb59', '#8064a2', '#f79646'];
    for (let i = 0; i < shelves; i++) {
      const y = (i * (h - 3)) / (shelves - 1);
      box(g, w - 6, 3, d - 2, 0, y, 1, c);
      if (i < shelves - 1 && w > 40) {
        let x = -w / 2 + 7;
        for (let b = 0; b < 6 && x < w / 2 - 12; b++) {
          const bw = 3 + ((i * 7 + b * 5) % 4);
          const bh = ((h - 3) / (shelves - 1)) * (0.55 + ((i + b) % 3) * 0.12);
          box(g, bw, bh, d * 0.7, x + bw / 2, y + 3, 1, bookColors[(i + b) % 5]);
          x += bw + 1;
        }
      }
    }
  },
  tvunit(g, w, d, h, c) {
    box(g, w, h, d, 0, 0, 0, c);
    [-1, 1].forEach((s) => box(g, w / 2 - 3, h - 8, 1, (s * w) / 4, 4, d / 2 + 0.5, darken(c, 0.85)));
  },
  tv(g, w, d, h, c) {
    box(g, w * 0.3, 2, d, 0, 0, 0, '#222'); // foot
    box(g, 6, h * 0.14, 3, 0, 2, 0, '#222'); // neck
    box(g, w, h * 0.84, 4, 0, h * 0.16, 0, c); // bezel
    box(g, w - 3, h * 0.84 - 3, 1, 0, h * 0.16 + 1.5, 2.2, '#0b1d33', { emissive: '#10304f', emissiveIntensity: 0.5 });
  },
  rug(g, w, d, h, c) {
    box(g, w, h, d, 0, 0, 0, c);
    box(g, w - 16, h + 0.4, d - 16, 0, 0, 0, lighten(c, 0.25));
  },
  lamp(g, w, d, h, c) {
    cyl(g, w * 0.3, w * 0.3, 2, 0, 0, 0, '#333'); // base
    cyl(g, 1.2, 1.2, h * 0.76, 0, 2, 0, '#444'); // pole
    cyl(g, w * 0.28, w * 0.5, h * 0.22, 0, h * 0.78, 0, c, { emissive: c, emissiveIntensity: 0.35 }); // shade
    // Intensity is driven by the lighting preset (applyLighting).
    const light = new THREE.PointLight(0xffd8a0, 0, 380, 1);
    light.position.set(0, h * 0.8, 0);
    light.userData.lampLight = true;
    g.add(light);
  },
  plant(g, w, d, h, c) {
    cyl(g, w * 0.32, w * 0.22, h * 0.28, 0, 0, 0, '#a0623f'); // pot
    [
      [0, 0.52, 0, 0.34],
      [w * 0.14, 0.7, w * 0.06, 0.26],
      [-w * 0.12, 0.64, -w * 0.08, 0.28],
      [0, 0.86, 0, 0.22],
    ].forEach(([x, yf, z, r]) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(w * r * 1.1, 16, 12), material(c));
      m.position.set(x, h * yf, z);
      g.add(m);
    });
  },
  door(g, w, d, h, c) {
    box(g, w, h, d, 0, 0, 0, c);
    box(g, 3, 3, 5, w / 2 - 8, h * 0.48, d / 2 + 1, '#cfcfcf'); // handle
    box(g, w - 14, h - 18, 1, 0, 9, d / 2 + 0.2, darken(c, 0.9)); // panel
  },
  window(g, w, d, h, c) {
    const frame = '#ffffff';
    box(g, w, 5, d, 0, 0, 0, frame);
    box(g, w, 5, d, 0, h - 5, 0, frame);
    box(g, 5, h - 10, d, -w / 2 + 2.5, 5, 0, frame);
    box(g, 5, h - 10, d, w / 2 - 2.5, 5, 0, frame);
    box(g, 3, h - 10, d * 0.6, 0, 5, 0, frame); // mullion
    box(g, w - 10, h - 10, 2, 0, 5, 0, c, { transparent: true, opacity: 0.45, roughness: 0.1 }); // glass
  },
  box(g, w, d, h, c) {
    box(g, w, h, d, 0, 0, 0, c);
  },
};

// Aliases: these share a builder with a different default size.
BUILD.coffee = BUILD.table;
BUILD.tablelamp = BUILD.lamp;
BUILD.armchair = BUILD.sofa;

for (const type of Object.keys(CATALOG)) {
  if (!BUILD[type]) console.warn('missing builder', type);
}
