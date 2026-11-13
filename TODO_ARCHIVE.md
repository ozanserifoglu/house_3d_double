# TODO archive

Finished items moved out of [TODO.md](TODO.md), newest first.

## 2026-11-13

### Roadmap
- [x] Real wall holes for doors/windows (roadmap item 4): each opening cuts its w × h out of the wall it sits on, including shared walls; walls are rebuilt whenever any opening changes (clicked through: add, resize, drag onto another wall, import, reload).

## 2026-11-12

### Code smells
- [x] Rooms and room selection moved out of `main.js`: room data in `rooms.js`, room meshes and wall auto-hide in `room-mesh.js`. No behaviour or save-format change.

### Roadmap
- [x] Textures (roadmap item 1): wood on tables, coffee table, desk, wardrobe, bookshelf, TV unit and doors; fabric on sofa, armchair, bed, chair seats/backs and rug; floor look per room (plain, parquet, tile). Canvas-drawn in code, tinted by the item/floor colour, real-world cm scale (`textures.js`).
- [x] Window light: one `RectAreaLight` per window, the window's size, on its room-facing side; strength/colour per lighting preset (bright by day, a dim warm glow in the evening, off at night); the glass glows with it. No shadows (open items in TODO.md).

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
