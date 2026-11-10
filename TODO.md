# TODO

Known issues and open items. Roadmap features live in [CLAUDE.md](CLAUDE.md#roadmap-from-the-original-handoff).

## Untested since the port to readable source
These were converted one-to-one from the minified build but not clicked through yet:
- [ ] Duplicate and Delete buttons
- [ ] Layout slots A/B/C (save + load)
- [ ] Export / Import / Copy layout text
- [ ] Floor and wall colour pickers, item colour picker
- [ ] Eye level camera preset
- [ ] Room W/D/ceiling inputs (pieces re-clamp into the smaller room)
- [ ] Width/depth/height/lift inputs on an item
- [ ] Touch: pinch zoom and drag on a phone

## Bugs / UX
- [x] ~~Backspace deletes the selected piece with no undo.~~ Undo/redo added (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y, and buttons top-right), so an accidental delete can be undone. Backspace still deletes.
- [ ] Undo history is in memory only: a page reload starts a fresh history (the layout itself is still autosaved).
- [ ] `R` rotates even with Ctrl held, so Ctrl+R both rotates the piece and reloads the page (pre-existing).
- [ ] New pieces from the catalog always appear in the same 5 staggered spots (`items.length % 5`). They can land on top of existing furniture.
- [ ] Saved layouts are per site (localStorage). Layouts from the claude.ai artifact must be moved over by hand: Export → Copy there, Import here.

## Room drawing (step 1 done: one room of any shape)
- [ ] **Step 2: multiple rooms, connected wall to wall.** Add/select/rename/delete rooms; while drawing, snap edges to another room's outer wall face (gap = wall thickness, default 10 cm); build one wall on the shared stretch; Room tab edits the selected room; Eye level uses it.
- [ ] Plan view on touch: while drawing, one finger places corners, so you can't pan/pinch mid-drawing (zoom first, or finish and edit).
- [ ] Typing a wall length moves the wall's *end* corner (in drawing order), and the next wall too if it is square. There's no choice of which end moves.
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
- [ ] `main.js` holds all mutable state as module globals. Fine for now; revisit if GLB import or multi-room makes it hard to follow.

## Not done
- [ ] No single-file offline build of the new source. `reference/room-planner-v1-offline.html` still works on its own (see `vite-plugin-singlefile` if needed).
- [ ] Nothing committed to git yet.
