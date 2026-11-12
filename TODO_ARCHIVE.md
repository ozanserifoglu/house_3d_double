# TODO archive

Finished items moved out of [TODO.md](TODO.md), newest first.

## 2026-11-12

### Untested since the port to readable source
Clicked through in the app on desktop:
- [x] Duplicate and Delete buttons: a copy appears 30 cm offset; Delete removes the selected piece.
- [x] Layout slots A/B/C (save + load): saved to A, changed the room, loaded A back. Undo reverts the load.
- [x] Export / Import layout text: exported text imports back to the same layout. (The Copy button's clipboard write is still open in TODO.md.)
- [x] ~~Floor and wall colour pickers, item colour picker~~ Replaced by the in-page picker (`color-picker.js`) and clicked through on desktop.
- [x] Eye level camera preset
- [x] Room W/D/ceiling inputs (pieces re-clamp into the smaller room): 500×400 → 320×300, ceiling 240; every footprint stayed inside.
- [x] Width/depth/height/lift inputs on an item

### Bugs / UX
- [x] ~~Backspace deletes the selected piece with no undo.~~ Undo/redo added (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y, and buttons top-right), so an accidental delete can be undone. Backspace still deletes.

### Room drawing
- [x] ~~Step 2: multiple rooms, connected wall to wall.~~ Done: room list (add/select/rename/delete), gap snapping, one shared wall per facing stretch, no overlaps.
