# Room planner (three.js) — project notes

Goal: a simple 3D "double" of my apartment to try furniture orientations
and preview new furniture. Simple > fancy.

## Stack
- Vite dev server, plain ES modules, no framework. `npm run dev`.
- three.js pinned to **0.160.0** (lighting intensities and color
  management were tuned on this version; check visuals if upgrading).
- All lengths in **cm**. Floor is y = 0, room centred on the origin.

## Git workflow
- Every new feature gets its own branch off `master` (e.g. `feature/door-holes`),
  created before the first change. Don't build features directly on `master`.
- Remote: `origin` = github.com/ozanserifoglu/house_3d_double (SSH).
  Commit/push only when asked.
- PRs are merged with a merge commit (`gh pr merge --merge`). After a merge,
  switch the main folder back to an up-to-date `master` and delete the merged
  branch locally and on `origin`.
- Worktrees (`.claude/worktrees/<name>`): their `node_modules` is a junction
  to the main one. Stop that worktree's dev server first, then
  `git worktree remove` and `cmd /c rmdir` what's left. Never
  `Remove-Item -Recurse` there: Windows PowerShell 5.1 follows the junction
  and deletes the real `node_modules`.

## Architecture
- `CATALOG[type]` = defaults `{label,w,d,h,color,y?,noCol?,opening?,top?,under?,tuck?,onTop?}`.
  `noCol` skips overlap checks; `opening` = door/window, snaps to walls.
  Stacking (`main.js` "Stacking"): `top` = flat top at height h; `onTop`
  pieces dragged/added over one (centre inside its footprint) get `y` = its
  top, else 0, and a dragged `top` piece carries what rests on it. `under` =
  knee room below a `TOP_T` top; a `tuck` piece (chair) overlapping it isn't
  flagged if its seat (`seatTop(h)`) clears the underside and its backrest
  (rear `BACK_T` cm, `backStrip`) stays outside. No saved-format change.
- `BUILD[type](group,w,d,h,color)` builds primitives; origin at floor
  centre, front faces +z. Each part's surface is picked in its builder
  (`box(..., WOOD | FABRIC)`, see Textures), so it isn't saved. `coffee`
  aliases `table`, `armchair` aliases `sofa`. A missing builder logs `missing builder` at load (that once caused a black screen).
- Item: `{id,type,w,d,h,y(lift),x,z,rot(deg),color,obj}`.
  `rot` → `group.rotation.y = rot·π/180`; `layout-math.js` corners use the same mapping.
- Room: `{id,name,pts:[[x,z],...],h,floor,floorTex?,wall,locked}` in `rooms[]`. `pts` = the
  **inside** outline (tape-measured), positive shoelace area, so edge a→b's
  outward normal is `(uz,-ux)` (`polygon.js`). Walls (`WALL_T` = 12) are
  extruded outward with mitred corners. `currentRoom()` = the selected room
  (`selectedRoomId`, UI state, not saved). After changing an outline call
  `onRoomsChanged()` (rebuild walls, re-clamp furniture, panel, autosave) +
  `checkpoint()`. Rooms must not overlap (`polygonsOverlap`).
- Locked walls (`locks.js`): lock the wall's **length (and angle)**, not its
  place. `room.locked` = each locked wall's [start, end] corners where it
  last was. Edits move corners via `carryLocked` (a locked wall touching a
  moved corner moves whole; from there a wall square to the motion moves
  whole too, so rectangles stay square). `relocateLocks(locks, newPts)` then
  finds each lock again as the same start→end vector nearest its old place;
  null = a locked wall stretched/turned → the edit is refused (Plan's
  `applyOutline`, live drag turns red; Room tab W/D/Reset too). Typing a
  length tries the end corner, then the start. Locked walls can't be split
  and their corners can't be deleted. `onRoomsChanged()` prunes locks whose
  wall left the outline (redraw).
- Locked room: `room.roomLock` (bool) = a finished room. Plan refuses every
  outline edit/redraw/wall-lock toggle on it; Room tab disables W/D/ceiling/
  draw/delete. Name and colours stay editable. Toggle: "Lock room" in the
  Plan toolbar or Room tab (undo step).
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
- Lighting: ACES tone mapping + `RoomEnvironment` as `scene.environment`,
  hemisphere + sun (PCF shadows, `shadow.radius` for soft edges) + lamp point
  lights. `LIGHTING[preset]` holds each preset's strengths incl. `env` and
  `exposure`; `applyLighting()` sets `envMapIntensity` on every standard
  material (0.160 has no `scene.environmentIntensity`), so call it after
  creating materials (rebuildItem/buildRooms already do). Furniture `box()`
  parts are `RoundedBoxGeometry` (≤1.5 cm radius; parts < 2 cm stay sharp).
- Textures (`textures.js`): canvas-drawn in code, no files. Kinds `wood`,
  `fabric` (furniture) and `plain`/`parquet`/`tile` (floors), each drawn once
  on first use and shared (`userData.shared`: never dispose them; materials
  stay per mesh). Albedo = near-white grey detail × `material.color`, so
  colour picks still apply. Scale is real cm: UVs are cm and each texture's
  `repeat` = 1 / the cm it spans. Floors: ShapeGeometry UVs are already cm.
  Furniture: `box()` with `opts.tex` calls `boxUVsCm` (box projection in the
  piece's frame, u along each face's longer side = grain direction).
  `surface(kind)` → `{map, roughness}` for a MeshStandardMaterial, so
  `applyLighting()` still reaches them. Room floor look = `room.floorTex`
  ('parquet' | 'tile'; missing = plain, the old faint 50 cm grid), Room tab
  "Floor look" (one undo step via the global `change` listener).
- Window light: `BUILD.window` adds a w×h `RectAreaLight`
  (`userData.windowLight`) 0.5 cm in front of the plate at h/2 (so lift `y`
  counts) and tags the glass `userData.windowGlass`. Being a child of the
  item group, it follows drag/rotate/rebuild/delete/undo like lamp lights.
  It shines along its local -z, so it's turned π to face +z; `applyTransform`
  flips it to the back face when `frontFacesRoom` (layout-math.js: the
  nearest roughly-parallel wall) says the window's back faces the room.
  `LIGHTING[preset].win`/`winCol` set intensity (nits; scale-free, so cm
  don't matter) and colour; glass emissive = `win × GLASS_GLOW`.
  `RectAreaLightUniformsLib.init()` runs once in main.js. Only standard/
  physical materials react; no shadows, so it also passes through walls.
- Ambient occlusion: the 3D view renders through `composer` (RenderPass →
  `GTAOPass` → OutputPass, 4× MSAA HalfFloat target); Plan view and AO-off
  use plain `renderer.render`. GTAO lengths are cm (`thickness` must be tens
  of cm or the AO vanishes). On/off = Room tab, stored per device in
  localStorage `rp3d_ao` (not in the layout); default off on coarse-pointer
  (touch) screens.
- Colour picker (`color-picker.js`, `attachColorPickers(store)`): replaces
  the native dialog on every `input[type=color]` (the Windows one ignores
  the current value). The `<input>` stays the value holder: picking fires
  `input` events (live), closing fires one `change` if the colour changed
  (→ one undo step via the global listener); Esc reverts. Recent colours
  (12, shared by all fields) in localStorage `rp3d_recent_colors`.
- Walls are boxes outside the room bounds; they auto-hide when the
  camera is behind them and all hide in top view; skirting stays.
- Persistence: localStorage keys `rp3d_auto`, `rp3d_slot_A|B|C`, `rp3d_ao`,
  `rp3d_recent_colors` (in-memory fallback). Layout JSON v2 =
  `{version:2, settings:{light,snap,innerWallT}, rooms:[...], items:[...without obj]}`.
  `rooms[].locked` and `rooms[].roomLock` are optional (older saves load
  unlocked); so is `rooms[].floorTex` (missing or unknown = plain; plain is
  saved as no field).
  v1 `{room:{w,d,h,floor,wall,light,snap}, items}` still loads (→ rectangle).

## Constraints so far
- Any number of rooms, each any (non-self-crossing) shape, no overlaps.
  Rooms join through a shared wall only: no openings between them yet.
- Doors/windows are plates on walls (no holes).

## Roadmap
Lives in [TODO.md](TODO.md#roadmap-from-the-original-handoff) with the known
issues: GLB/glTF import, real dimensions, wall holes (and sun through windows).

## Session handoff
[HANDOFF.md](HANDOFF.md) says where the last session stopped and what's next.
Read it at the start of a session. At the end, rewrite it (replace, don't
append): state, what was done, next steps, loose ends.
