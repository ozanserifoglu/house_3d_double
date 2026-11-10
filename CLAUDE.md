# Room planner (three.js) — project notes

Goal: a simple 3D "double" of my apartment to try furniture orientations
and preview new furniture. Simple > fancy.

## Stack
- Vite dev server, plain ES modules, no framework. `npm run dev`.
- three.js pinned to **0.160.0** (lighting intensities and color
  management were tuned on this version; check visuals if upgrading).
- All lengths in **cm**. Floor is y = 0, room centred on the origin.

## Architecture
- `CATALOG[type]` = defaults `{label,w,d,h,color,y?,noCol?,opening?}`.
  `noCol` skips overlap checks; `opening` = door/window, snaps to walls.
- `BUILD[type](group,w,d,h,color)` builds primitives; origin at floor
  centre, front faces +z. `coffee` aliases `table`, `armchair` aliases `sofa`.
  A missing builder logs `missing builder` at load (that once caused a black screen).
- Item: `{id,type,w,d,h,y(lift),x,z,rot(deg),color,obj}`.
  `rot` → `group.rotation.y = rot·π/180`; `layout-math.js` corners use the same mapping.
- After changing items call `commit()` (overlaps → outlines → panel → autosave).
  For a discrete action (add, delete, rotate, drag end, load…) also call
  `checkpoint()` to record an undo step. Typed/picked values are recorded
  by the global `change` listener. Undo = whole-layout JSON snapshots
  (`historyState()`, excludes `light`/`snap`), max 100, in memory only.
- Drag handler is a capture-phase `pointerdown` registered **before**
  OrbitControls so it can set `controls.enabled = false` first.
- Walls are boxes outside the room bounds; they auto-hide when the
  camera is behind them and all hide in top view; skirting stays.
- Persistence: localStorage keys `rp3d_auto`, `rp3d_slot_A|B|C`
  (in-memory fallback). Layout JSON = `{room, items:[...without obj]}`.

## Constraints so far
- Single rectangular room. Doors/windows are plates on walls (no holes).

## Roadmap (from the original handoff)
1. Realistic render style: soft shadows, environment map / sky light,
   ACES tone mapping, textures (wood, fabric, tile), beveled edges, AO,
   window light.
2. Import real furniture meshes (GLB/glTF first; OBJ/FBX later): file
   picker, scale to cm, then behave like any item (drag/rotate/overlap/
   save). Keep models < ~5 MB. Saved layouts reference files in
   `public/models/` so they reload.
3. Enter real apartment dimensions and furniture.
4. Maybe: non-rectangular / multi-room, real wall holes for doors/windows.
