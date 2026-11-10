# House 3D double — room planner

A simple 3D copy of my apartment in three.js, for trying furniture
arrangements and previewing new pieces in the browser.

## Run

```bash
npm install
npm run dev        # http://localhost:5173, reloads when you save a file
npm run build      # static site in dist/
```

You need the dev server (or any static HTTP server): ES modules and the
upcoming `public/models/` loading don't work from `file://`.

## Layout

| Path | What it is |
|---|---|
| `index.html` | Page markup (viewport + tabbed bottom panel) |
| `src/main.js` | Scene, camera, lights, drag/select, UI wiring, save/load |
| `src/catalog.js` | Furniture catalog (default sizes) and procedural builders |
| `src/layout-math.js` | Pure footprint math: clamp, wall snap, door/window snap, overlap (SAT) |
| `src/style.css` | Styles |
| `public/models/` | Put GLB/glTF furniture here (served as `/models/...`) |
| `TODO.md` | Known issues, untested parts, code smells |
| `reference/knowledge-base/` | Research on similar three.js projects, techniques per roadmap item, and free asset sources. Start at its README. |
| `reference/room-planner-v1-offline.html` | The original single-file build from the claude.ai artifact (three.js inlined). Open it directly to compare behaviour. |

## Moving layouts from the old artifact

Saved layouts live in the browser's localStorage per site, so the ones
saved in the claude.ai artifact don't appear here. In the artifact,
open **Layouts → Export layout text → Copy**, then here paste it into
the same box and press **Import from text**.
