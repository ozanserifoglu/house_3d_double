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

## Code smells (fine at this size)
- [ ] Every item edit (size, colour) rebuilds the whole piece's geometry and materials (`rebuildItem`).
- [ ] Outlines are disposed and recreated on every pointer move while dragging (`refreshOutlines`).
- [ ] `applyLighting()` runs on every `rebuildItem` call and walks all items to find lamp lights.
- [ ] Undo/redo restores via `loadLayout`, which rebuilds every item and the room. Instant at this size; switch to per-item diffs if layouts get large or GLB models are slow to rebuild.
- [ ] `main.js` holds all mutable state as module globals. Fine for now; revisit if GLB import or multi-room makes it hard to follow.

## Not done
- [ ] No single-file offline build of the new source. `reference/room-planner-v1-offline.html` still works on its own (see `vite-plugin-singlefile` if needed).
- [ ] Nothing committed to git yet.
