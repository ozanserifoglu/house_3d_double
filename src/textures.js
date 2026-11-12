// Procedural surface textures, drawn on canvas in code (no image files).
// Each kind is drawn once on first use and shared by every material that
// uses it. Albedo maps are near-white grey detail: material.color tints
// them, so a picked colour still reads as that colour.
// Scale is real-world: UVs are in cm (floors: ShapeGeometry's shape coords;
// furniture: boxUVsCm below) and each texture's repeat = 1 / the cm it spans,
// so a plank or weave is the same size on a stool and on a wardrobe.
import * as THREE from 'three';

let anisotropy = 4;
// Call once the renderer exists (before the first texture is drawn).
export function setTextureAnisotropy(n) {
  anisotropy = n;
}

// ---------- Helpers ----------
// Seeded RNG: the same textures on every load.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise on a gx × gy lattice that wraps, so the texture tiles.
// Sample with u, v in [0, 1) (no general wrap: these run per pixel).
function tileNoise(gx, gy, seed) {
  const r = rng(seed), lat = new Float32Array(gx * gy).map(() => r());
  const s = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * gx, y = v * gy;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = s(x - x0), fy = s(y - y0);
    const at = (i, j) => lat[(j >= gy ? j - gy : j) * gx + (i >= gx ? i - gx : i)];
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return a + (b - a) * fy; // 0..1
  };
}

function canvas(W, H) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  return c;
}

// Fill a W × H canvas from shade(x, y) → brightness 0..1 (grey).
function paint(W, H, shade) {
  const c = canvas(W, H), ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let y = 0, i = 0; y < H; y++) {
    for (let x = 0; x < W; x++, i += 4) {
      const v = Math.max(0, Math.min(255, shade(x, y) * 255));
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Wood grain running along x on a W × H tile: many fine, faint lines at
// random heights plus a few soft darker bundles, drifting gently along the
// grain, and short pore streaks. Returns grain(x, y) → about 0.82..1,
// periodic in both directions. `contrast` scales the darkening.
function woodGrain(W, H, seed, lines, contrast = 1) {
  const r = rng(seed);
  // 1D ring profile across the grain (period H), sampled at 4× resolution.
  const N = H * 4, prof = new Float32Array(N).fill(0);
  const dip = (c, wdt, depth) => {
    for (let k = Math.floor(c - wdt * 3); k <= c + wdt * 3; k++) {
      const t = (k - c) / wdt;
      prof[((k % N) + N) % N] += depth * Math.exp(-t * t);
    }
  };
  for (let l = 0; l < lines / 12; l++) dip(r() * N, 12 + r() * 30, 0.02 + r() * 0.03); // soft bundles
  for (let l = 0; l < lines; l++) dip(r() * N, 2 + r() * 4, 0.015 + r() * 0.045); // fine lines
  const warp = tileNoise(2, 3, seed + 2), warp2 = tileNoise(7, 9, seed + 3);
  const pores = tileNoise(64, H / 2, seed + 4), tone = tileNoise(4, 3, seed + 5);
  return (x, y) => {
    const u = x / W, v = y / H;
    const yy = y + (warp(u, v) - 0.5) * H * 0.08 + (warp2(u, v) - 0.5) * 3;
    const p = prof[((Math.floor(yy * 4) % N) + N) % N];
    const pore = pores(u, v) > 0.75 ? 0.02 : 0;
    return 1 - contrast * (Math.min(p, 0.16) + pore + 0.03 * tone(u, v));
  };
}

// ---------- Kinds ----------
// size: canvas px; cm: real-world size the canvas spans (u, v).
const KINDS = {
  // The original floor look: faint 50 cm tile lines.
  plain: {
    size: [128, 128], cm: [50, 50], roughness: 0.9,
    draw(W, H) {
      const c = canvas(W, H), ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, W, H);
      return c;
    },
  },
  // Furniture wood: grain along u (boxUVsCm runs u along each face's long side).
  wood: {
    size: [512, 512], cm: [150, 60], roughness: 0.65,
    draw(W, H) {
      const g = woodGrain(W, H, 11, 120, 0.7);
      return paint(W, H, g);
    },
  },
  // Plain-weave upholstery: ~3 mm threads, yarn variation and soft mottling.
  fabric: {
    size: [512, 512], cm: [40, 40], roughness: 0.95,
    draw(W, H) {
      const P = 4; // thread pitch in px
      const r = rng(21), yarnU = new Float32Array(H / P).map(() => r()), yarnV = new Float32Array(W / P).map(() => r());
      const mottle = tileNoise(8, 8, 22), slub = tileNoise(16, 128, 23);
      return paint(W, H, (x, y) => {
        const i = Math.floor(x / P), j = Math.floor(y / P);
        const over = (i + j) % 2 === 0; // which thread is on top in this cell
        const fx = (x % P) / P, fy = (y % P) / P;
        // A thread is round: brighter in its middle, darker at its edges.
        const across = over ? fy : fx;
        const round = Math.sin(Math.PI * (across * 0.9 + 0.05));
        const yarn = over ? yarnU[j] : yarnV[i];
        return 0.915 + 0.07 * round + 0.03 * (yarn - 0.5) + 0.05 * (mottle(x / W, y / H) - 0.5) + 0.03 * (slub(x / W, y / H) - 0.5);
      });
    },
  },
  // Strip parquet: 10 cm × 50–100 cm planks in staggered rows, each cut
  // from a random spot of the furniture wood (same grain size) and given its
  // own tone, with thin dark joints. Canvas drawing, not per pixel: cheap.
  parquet: {
    size: [1024, 1024], cm: [160, 160], roughness: 0.55,
    draw(W, H) {
      const c = canvas(W, H), ctx = c.getContext('2d');
      const ROWS = 16, RH = H / ROWS, PX = W / 160; // px per cm
      const wood = texture('wood').image, wk = KINDS.wood;
      const sx = wood.width / wk.cm[0], sy = wood.height / wk.cm[1]; // wood px per cm
      const r = rng(31);
      for (let k = 0; k < ROWS; k++) {
        // Plank lengths (cm) filling the 160 cm row exactly, so the tile repeats.
        const lens = [];
        let left = 160;
        while (left > 100) {
          const l = 50 + Math.floor(r() * 6) * 10;
          lens.push(l);
          left -= l;
        }
        if (left < 30) lens[lens.length - 1] += left;
        else lens.push(left);
        let x = r() * W; // rows start at random offsets so joints don't line up
        const y = k * RH;
        for (const l of lens) {
          const w = l * PX, tone = 0.88 + r() * 0.12;
          const srcX = r() * (wood.width - l * sx), srcY = r() * (wood.height - 10 * sy);
          for (const x0 of [x, x - W]) {
            ctx.drawImage(wood, srcX, srcY, l * sx, 10 * sy, x0, y, w, RH);
            ctx.fillStyle = `rgba(0,0,0,${1 - tone})`;
            ctx.fillRect(x0, y, w, RH);
            ctx.fillStyle = 'rgba(0,0,0,0.45)'; // end joint
            ctx.fillRect(x0, y, 1, RH);
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.fillRect(x0 + 1, y, 1, RH);
          }
          x = (x + w) % W;
        }
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; // side joint
        ctx.fillRect(0, y, W, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(0, y + 1, W, 1);
      }
      return c;
    },
  },
  // 60 × 60 cm stone tiles: each a slightly different tone with soft
  // mottling and fine speckle, 3 mm grout. The mottling is drawn at 1/4
  // size and scaled up; its seam at the canvas edge falls under the grout.
  tile: {
    size: [960, 960], cm: [180, 180], roughness: 0.45,
    draw(W, H) {
      const c = canvas(W, H), ctx = c.getContext('2d');
      const T = W / 3, GROUT = 2;
      const big = tileNoise(6, 6, 42), mid = tileNoise(24, 24, 43);
      const low = paint(W / 4, H / 4, (x, y) => {
        const u = (x * 4) / W, v = (y * 4) / H;
        return 0.97 + 0.05 * (big(u, v) - 0.5) + 0.05 * (mid(u, v) - 0.5);
      });
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(low, 0, 0, W, H);
      // Fine speckle: independent per pixel, so it tiles by itself.
      const img = ctx.getImageData(0, 0, W, H), d = img.data, r = rng(44);
      for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = d[i] * (1 - 0.05 * r() * r());
      ctx.putImageData(img, 0, 0);
      for (let j = 0; j < 3; j++) {
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = `rgba(0,0,0,${0.01 + r() * 0.06})`; // tile tone
          ctx.fillRect(i * T, j * T, T, T);
          ctx.strokeStyle = 'rgba(0,0,0,0.05)'; // soft edge beside the grout
          ctx.strokeRect(i * T + GROUT / 2 + 0.5, j * T + GROUT / 2 + 0.5, T - GROUT - 1, T - GROUT - 1);
        }
      }
      ctx.fillStyle = '#b3b3b3'; // grout, centred on tile edges (split across the canvas edge)
      for (let k = 0; k <= 3; k++) {
        ctx.fillRect(k * T - GROUT / 2, 0, GROUT, H);
        ctx.fillRect(0, k * T - GROUT / 2, W, GROUT);
      }
      return c;
    },
  },
};

export const FLOOR_KINDS = ['plain', 'parquet', 'tile'];

const cache = new Map();

// The shared texture of a kind, drawn on first use.
function texture(kind) {
  let tex = cache.get(kind);
  if (tex) return tex;
  const k = KINDS[kind];
  tex = new THREE.CanvasTexture(k.draw(...k.size));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / k.cm[0], 1 / k.cm[1]);
  tex.anisotropy = anisotropy;
  tex.userData.shared = true; // never dispose: other materials use it too
  cache.set(kind, tex);
  return tex;
}

// MeshStandardMaterial properties for a surface kind: { map, roughness }.
// Spread into the material's options; `color` stays the caller's.
export function surface(kind) {
  if (!KINDS[kind]) kind = 'plain';
  return { map: texture(kind), roughness: KINDS[kind].roughness };
}

// Replace a box geometry's 0..1-per-face UVs with cm, measured in the
// piece's own frame (geometry coordinates + the part's offset), so parts
// of a piece continue each other's grain. u runs along each face's longer
// side (grain along a leg, across a table top's length).
// w, h, d = the part's size along x, y, z.
export function boxUVsCm(geo, w, h, d, ox = 0, oy = 0, oz = 0) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  // Non-indexed geometry (RoundedBoxGeometry): one projection per triangle,
  // so a triangle on a rounded edge doesn't smear between two faces.
  const step = geo.index ? 1 : 3;
  for (let i = 0; i < pos.count; i += step) {
    let nx = 0, ny = 0, nz = 0;
    for (let k = i; k < i + step; k++) {
      nx += nor.getX(k);
      ny += nor.getY(k);
      nz += nor.getZ(k);
    }
    nx = Math.abs(nx);
    ny = Math.abs(ny);
    nz = Math.abs(nz);
    for (let k = i; k < i + step; k++) {
      const x = pos.getX(k) + ox, y = pos.getY(k) + oy, z = pos.getZ(k) + oz;
      let a, b, la, lb; // the face's two in-plane coordinates and the part's size along them
      if (nx >= ny && nx >= nz) [a, b, la, lb] = [z, y, d, h];
      else if (ny >= nz) [a, b, la, lb] = [x, z, w, d];
      else [a, b, la, lb] = [x, y, w, h];
      if (la >= lb) uv.setXY(k, a, b);
      else uv.setXY(k, b, a);
    }
  }
  uv.needsUpdate = true;
}
