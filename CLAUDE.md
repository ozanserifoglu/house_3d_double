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
- Room: `{id,name,pts:[[x,z],...],h,floor,wall}` in `rooms[]`. `pts` = the
  **inside** outline (tape-measured), positive shoelace area, so edge a→b's
  outward normal is `(uz,-ux)` (`polygon.js`). Walls (`WALL_T` = 12) are
  extruded outward with mitred corners. `currentRoom()` = the selected room
  (`selectedRoomId`, UI state, not saved). After changing an outline call
  `onRoomsChanged()` (rebuild walls, re-clamp furniture, panel, autosave) +
  `checkpoint()`. Rooms must not overlap (`polygonsOverlap`).
- Walls (`walls.js` `wallPieces`): facing edges of two rooms 0.5–60 cm apart
  become ONE shared wall filling the gap (built by the lower room id, its
  colour/height); the rest of each edge is a 12 cm outer wall. Mitres use each
  side's real thickness. 3D and the plan overlay both draw these pieces.
  Shared walls never auto-hide except from above.
- Connecting rooms: `settings.innerWallT` (default 10) is the gap Plan snaps
  to: other rooms' corners pushed out across each wall, and their outlines
  pushed out (`gapCorners`/`gapEdges` in plan.js); a dragged wall snaps to a
  facing wall at that gap.
- Furniture vs walls (`layout-math.js`): `clampToRooms` keeps a footprint
  inside the room holding its centre (pushes off walls/columns; nearest grid
  spot if stuck; centred if it can't fit). `snapToWalls` / `snapOpeningToWall`
  work on any edge at any angle.
- Plan view (`plan.js`): orthographic top camera + its own OrbitControls
  (pan/zoom only), SVG overlay for outline/labels/handles. main.js forwards
  pointer/key events to `plan.*` first; only the active controls may be
  enabled (both listen on the canvas).
- After changing items call `commit()` (overlaps → outlines → panel → autosave).
  For a discrete action (add, delete, rotate, drag end, load…) also call
  `checkpoint()` to record an undo step. Typed/picked values are recorded
  by the global `change` listener. Undo = whole-layout JSON snapshots
  (`historyState()` = rooms + items, no settings), max 100, in memory only.
- Drag handler is a capture-phase `pointerdown` registered **before**
  OrbitControls so it can set `controls.enabled = false` first.
- Walls are boxes outside the room bounds; they auto-hide when the
  camera is behind them and all hide in top view; skirting stays.
- Persistence: localStorage keys `rp3d_auto`, `rp3d_slot_A|B|C`
  (in-memory fallback). Layout JSON v2 =
  `{version:2, settings:{light,snap,innerWallT}, rooms:[...], items:[...without obj]}`.
  v1 `{room:{w,d,h,floor,wall,light,snap}, items}` still loads (→ rectangle).

## Constraints so far
- Any number of rooms, each any (non-self-crossing) shape, no overlaps.
  Rooms join through a shared wall only: no openings between them yet.
- Doors/windows are plates on walls (no holes).

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
