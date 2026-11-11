# TODO

Known issues and open items. Roadmap features live in [CLAUDE.md](CLAUDE.md#roadmap-from-the-original-handoff).

## Untested since the port to readable source
These were converted one-to-one from the minified build but not clicked through yet:
- [ ] Duplicate and Delete buttons
- [ ] Layout slots A/B/C (save + load)
- [ ] Export / Import / Copy layout text
- [x] ~~Floor and wall colour pickers, item colour picker~~ Replaced by the in-page picker (`color-picker.js`) and clicked through on desktop.
- [ ] Eye level camera preset
- [ ] Room W/D/ceiling inputs (pieces re-clamp into the smaller room)
- [ ] Width/depth/height/lift inputs on an item
- [ ] Touch: pinch zoom and drag on a phone; dragging in the colour picker's square and hue bar

## Bugs / UX
- [x] ~~Backspace deletes the selected piece with no undo.~~ Undo/redo added (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y, and buttons top-right), so an accidental delete can be undone. Backspace still deletes.
- [ ] Undo history is in memory only: a page reload starts a fresh history (the layout itself is still autosaved).
- [ ] `R` rotates even with Ctrl held, so Ctrl+R both rotates the piece and reloads the page (pre-existing).
- [ ] New pieces from the catalog always appear in the same 5 staggered spots (`items.length % 5`). They can land on top of existing furniture.
- [ ] Colour picker: Ctrl+Z / Ctrl+Y while it is open changes the colour underneath but the open picker keeps showing the old one until it is closed.
- [ ] Saved layouts are per site (localStorage). Layouts from the claude.ai artifact must be moved over by hand: Export → Copy there, Import here.

## Room drawing (steps 1 + 2 done: rooms of any shape, connected by shared walls)
- [x] ~~Step 2: multiple rooms, connected wall to wall.~~ Done: room list (add/select/rename/delete), gap snapping, one shared wall per facing stretch, no overlaps.
- [ ] No openings between rooms: a shared wall is solid, so Eye level can't look from one room into the next (roadmap #4, real door holes).
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
- [ ] `applyLighting()` runs on every `rebuildItem` call and walks all items to find lamp lights.
- [ ] Undo/redo restores via `loadLayout`, which rebuilds every item and the room. Instant at this size; switch to per-item diffs if layouts get large or GLB models are slow to rebuild.
- [ ] `main.js` keeps growing with shared state at the top level (now including rooms and room selection). Move rooms and selection into their own module before the GLB-import work.

## Not done
- [ ] No single-file offline build of the new source. `reference/room-planner-v1-offline.html` still works on its own (see `vite-plugin-singlefile` if needed).
