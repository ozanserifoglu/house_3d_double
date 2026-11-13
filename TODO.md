# TODO

Known issues and open items.
Finished items move to [TODO_ARCHIVE.md](TODO_ARCHIVE.md).

## Roadmap (from the original handoff)
1. Realistic render style. Done: soft shadows, environment light (`RoomEnvironment`), ACES tone mapping, rounded edges, AO (GTAO), canvas-drawn textures (wood, fabric, parquet/tile floors), window light (one `RectAreaLight` per window).
2. [ ] Import real furniture meshes (GLB/glTF first; OBJ/FBX later): file picker, scale to cm, then behave like any item (drag/rotate/overlap/save). Keep models < ~5 MB. Saved layouts reference files in `public/models/` so they reload.
3. [ ] Enter real apartment dimensions and furniture.
4. Done: non-rectangular and multi-room rooms, openings between rooms (doors open/close; see "Doors").

## Untested since the port to readable source
Everything else from the port has been clicked through on desktop.
- [ ] Copy button: the clipboard write itself (the in-app test browser denies clipboard access, so only the select-the-text fallback was seen)
- [ ] Touch: pinch zoom and drag on a phone; dragging in the colour picker's square and hue bar
- [ ] Phone performance with ambient occlusion on (it roughly doubles the 3D work per frame; it defaults to off on touch screens)

## Untested since textures + window light were merged together (PRs #13, #14)
Each was tested on its own branch; the combined build only got a build and one daytime 3D screenshot.
- [ ] Click through the evening/night presets, Eye level, AO off, and drag/undo of a window over textured furniture and a parquet/tile floor.
- [ ] Phone: first-draw cost of the textures plus the window lights' per-pixel cost (each `RectAreaLight` adds work to every standard material).

## Bugs / UX
- [ ] Undo history is in memory only: a page reload starts a fresh history (the layout itself is still autosaved).
- [ ] `R` rotates even with Ctrl held, so Ctrl+R both rotates the piece and reloads the page (pre-existing).
- [ ] New pieces from the catalog always appear in the same 5 staggered spots (`items.length % 5`). They can land on top of existing furniture.
- [ ] Stacking only re-settles when a piece is dragged, added or duplicated (`settleOnTop`). Deleting a table, changing its height, rotating it or typing a new size leaves a lamp/plant on it floating or sunk in; rotating a table also doesn't swing what's on it around with it. Typing "Lifted cm" on an `onTop` piece is undone by its next drag.
- [ ] Lamp point lights cast no shadows (only the sun does).
- [ ] Window lights (`RectAreaLight`) cast no shadows: furniture doesn't block them and they pass through walls, so a window faintly lights the neighbouring room on its side of the wall plane (e.g. across a shared wall).
- [ ] Window light colour is fixed per preset; it ignores the glass colour. Day/evening only (night = 0).
- [ ] Turning a door/window with R or the angle field doesn't re-snap it: `clampToRooms` pushes the turned plate off the wall (a 180° turn left one 56 cm out). Its light still shines into the room (`frontFacesRoom`); dragging re-snaps it (pre-existing).
- [ ] Ambient occlusion: the semi-transparent window glass picks up a little AO along its edges (cosmetic).
- [ ] Colour picker: Ctrl+Z / Ctrl+Y while it is open changes the colour underneath but the open picker keeps showing the old one until it is closed.
- [ ] Saved layouts are per site (localStorage). Layouts from the claude.ai artifact must be moved over by hand: Export → Copy there, Import here.

## Sun through windows
- [ ] The sun direction is one global setting (`sunAz`), not tied to real north or time of day; elevation is fixed per preset (day 45°, evening 22°, night 40° "moon").
- [ ] Evening: a low sun lands far into the room (often on the front wall, which the 3D view hides), and the lamps outshine it; the patch is subtle.
- [ ] The room is now in shade apart from the patches: the day preset's look depends on the window lights + environment. Day sun was raised 2.6 → 7 and evening 1.2 → 3 so the patches read; other strengths are unchanged.
- [ ] Outside the rooms (the ground around them) there's no ground plane, so the sun's light outside isn't shown; exterior wall faces are lit by the sun (the twins don't shade them).
- [ ] The "Sun from" slider shows no number (only a tooltip explaining the directions).
- [ ] Not phone-tested: the shadow map now draws every wall twice (visible wall doesn't cast, twin does) plus a ceiling per room.

## Wall holes
- [ ] The plan view and its overlay don't show holes; doors aren't drawn as gaps in the wall band.
- [ ] A door/window turned with R or the angle field and pushed off the wall by `clampToRooms` (see Bugs) cuts no hole until it's dragged back onto the wall.
- [ ] The skirting board runs on across a door's opening (hidden behind the door plate, which is deeper).
- [ ] A hole is exactly the plate's size. An opening that sticks out past a wall's end (into a corner) is clipped to that piece; the neighbouring wall at the corner is not cut.
- [ ] Not phone-tested: walls are rebuilt on every pointer move while a door/window is dragged (cheap on desktop).

## Doors (open/close)
- [ ] The swing area ignores walls: a wedge that reaches a side wall (e.g. a hinge near a corner opened past 90°), or an "out" swing on an outer wall, is drawn and checked through the wall. The 3D leaf passes through walls and furniture too; it is only flagged, never stopped.
- [ ] No leafless "open doorway" type (an arch/passage with just a hole).
- [ ] Double-click toggles a door in 3D/Top/Eye level only; in Plan, double-click stays "add a corner".
- [ ] Open/close is instant (no swing animation).
- [ ] The yellow selection box (and the red/orange outlines) stay around the closed plate, not the open leaf.
- [ ] "In"/"Out" and "Left"/"Right" are relative to the door's front, so turning a door 180° with R swaps them (and pushes it off the wall: see Bugs).
- [ ] Windows don't open.
- [ ] Not clicked through: a door in a shared wall between two rooms (Eye level looking through it), sun through an open door, night/evening presets, phone.

## Textures
- [ ] Albedo maps only: no normal/bump or roughness maps, so grout, plank joints and weave are flat colour (they read fine at room scale; a cheap bump map from the same canvases is the next step if close-ups need it).
- [ ] Two identical pieces show identical grain (UVs are in each piece's own frame); likewise all chairs. A per-item offset would vary it but needs a stable seed (the item id).
- [ ] The tile floor's mottling is drawn at 1/4 resolution and can look slightly patchy from far away.
- [ ] First use of each texture kind costs a one-off main-thread draw (desktop: wood ~50 ms, fabric ~40 ms, tile ~50 ms; parquet reuses the wood canvas, ~1 ms). Not measured on a phone.
- [ ] Cylinders and spheres (lamps, plant, pot) and the plain-coloured parts (handles, books, window frame, TV) stay untextured.
- [ ] Textured parts render a few % darker than the same colour untextured (the map averages ~0.9–0.97, not 1).

## Room drawing (steps 1 + 2 done: rooms of any shape, connected by shared walls)
- [ ] A shared wall takes the owning (lower-id) room's wall colour and ceiling height, on both of its faces.
- [ ] Where a shared wall (e.g. 10 cm) meets a 12 cm outer wall, the 2 cm step overlaps the neighbour's corner wall; coincident faces there can flicker slightly (cosmetic).
- [ ] Dragging furniture across a shared wall moves it into the other room as soon as its centre crosses (no doorway check).
- [ ] Walls between rooms that are not parallel (angled neighbours) are not merged: each room keeps its own outer wall there.
- [ ] Rooms can't overlap, but nothing stops two rooms from being placed far apart (no "must touch" rule).
- [ ] Plan view on touch: while drawing, one finger places corners, so you can't pan/pinch mid-drawing (zoom first, or finish and edit).
- [ ] Typing a wall length moves the wall's *end* corner (in drawing order), and the next wall too if it is square. Locking a wall makes it move the other end instead; there's still no direct choice of which end moves.
- [ ] Locked walls: dragging a wall whose (non-straight) neighbour is locked is refused rather than solved some other way; a corner drag simply refuses on a locked wall's corner.
- [ ] Locked walls: "Redraw room" drops the locks of walls the new outline doesn't reuse exactly (no warning).
- [ ] Room tab: when a W/D change is refused (overlap, locked walls) the field keeps the typed number until the panel refreshes (pre-existing for overlaps).
- [ ] Walls of an inside corner (L-shaped room) auto-hide by the same "camera beyond the wall's line" rule, so from some angles an inner wall hides while you could still see it.
- [ ] Very short walls between two inside corners can give odd mitred wall geometry (cosmetic).
- [ ] Furniture is clamped to the room its centre is in; a piece too big for every spot is centred and sticks out (same rule as the old rectangle).

## Code smells (fine at this size)
- [ ] `clampToRooms` falls back to a 10 cm grid search (~6 ms for a piece that fits nowhere), which runs on every pointer move while dragging such a piece.
- [ ] The plan overlay rebuilds its whole SVG via `innerHTML` whenever the view or outline changes.
- [ ] Every item edit (size, colour) rebuilds the whole piece's geometry and materials (`rebuildItem`).
- [ ] Outlines are disposed and recreated on every pointer move while dragging (`refreshOutlines`).
- [ ] `applyLighting()` runs on every `rebuildItem` call and walks all items to find lamp/window lights.
- [ ] Adding or removing a window (or lamp) changes the light count, which recompiles every material's shader (a short hitch on slow GPUs).
- [ ] Undo/redo restores via `loadLayout`, which rebuilds every item and the room. Instant at this size; switch to per-item diffs if layouts get large or GLB models are slow to rebuild.
- [ ] `main.js` still holds the items (list, item selection, build/stacking/overlaps, save/load, undo) and all panel UI (~1,090 lines). An `items.js` would be the natural next split before GLB import, since a GLB model is an item type.
- [ ] `plan.js` gets rooms through `ctx.getRooms()` and has its own copy of `overlapsOthers`; it could import both from `rooms.js`.

## Not done
- [ ] No single-file offline build of the new source. `reference/room-planner-v1-offline.html` still works on its own (see `vite-plugin-singlefile` if needed).
