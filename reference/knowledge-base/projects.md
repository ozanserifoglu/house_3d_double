# Benchmark projects

Researched 2026-11-10. **Verified** = repo page opened that day.
**Reported** = from search results or third-party write-ups only.

Contents:
- [A. Open-source room/floor planners (three.js)](#a-open-source-roomfloor-planners-threejs)
- [B. Open-source planners not on three.js](#b-open-source-planners-not-on-threejs)
- [C. Adjacent: configurators, BIM, archviz](#c-adjacent-configurators-bim-archviz)
- [D. Commercial products (UX benchmarks only)](#commercial-products-ux-benchmarks-only)

---

## A. Open-source room/floor planners (three.js)

### ch-bas/threejs-sims-house-builder
**Closest architectural match to this project.** Verified.

- Repo: <https://github.com/ch-bas/threejs-sims-house-builder>
- Licence: MIT · ≈92★ · 909 commits · 54 open issues
- Stack: **raw three.js** (no R3F), Next.js 15, React 18 (UI only),
  TypeScript, Vitest. Static export with no backend, and data stays in
  the browser.
- Features:
  - Up to 4 floors, stairs that cut their own stairwells, roofs with dormers
  - Interior and exterior walls, **doors/windows that cut through walls**, per-wall paint
  - 69 furniture items in 12 categories, plus furniture sets, themes and room templates
  - **Drag with snapping, multi-select, groups, align/distribute, copy/paste, locks, undo/redo**
  - First-person walkthrough with touch support
  - Autosave, saved-house library, share links, **automatic restore points**
  - Export: JSON, CSV, PNG, **GLB**, SVG, DXF, print to scale
  - Sun shadows follow a time-of-day setting
- **Why it matters:** furniture = catalogue entry + mesh builder in a
  central registry, the same design as our `CATALOG` + `BUILD`. Read its
  undo, opening cuts and GLB export before building ours.

### laanlabs/openPlan3D
Verified.

- Repo: <https://github.com/laanlabs/openPlan3D>
- Licence: MIT · ≈281★ · 116 forks · 507 commits
- Stack: SvelteKit, three.js, Tailwind, TypeScript, jsPDF, dxf-writer.
  Firebase for hosting. Projects stored locally.
- Features:
  - Wall drawing with automatic snapping and angle constraints
  - Many door/window styles (single, double, sliding, pocket, bi-fold, French; casement, bay, picture)
  - Stairs (straight, L, U); rooms auto-detected from walls
  - Furniture catalogue with drag, rotate, resize, snap; 3D models in the 3D view
  - First-person walkthrough; material editor for walls, floors and ceilings; adjustable lighting
  - Export: SVG, DXF, PDF, PNG, JSON, ZIP package, interchange JSON
  - **Import: Apple RoomPlan scans** (from an iPhone/iPad LiDAR scan)
- **Why it matters:** RoomPlan import is the fastest route to roadmap #3
  (real apartment dimensions). Its `MODEL_SOURCES.md` may list furniture
  model sources (not read).

### pascalorg/editor (Pascal Editor)
The current high-water mark for open-source web building editors. Verified.

- Repo: <https://github.com/pascalorg/editor> · Live: editor.pascal.app
- Licence: MIT (hosted service has separate terms) · ≈25.4k★ · 3.2k forks · 2,238 commits
- Stack: React Three Fiber + Drei, **WebGPU renderer**, Zustand, Zod
  schemas, Zundo (undo/redo), **three-bvh-csg** (for wall cutouts),
  Bun/Turbo monorepo (`@pascal-app/core`, `viewer`, `editor`, `nodes`,
  `cli`, `ifc-converter`). Projects are stored in SQLite.
- Features: sites, buildings, levels, walls, slabs, roofs, openings,
  rooms, furniture; 3D scans as reference layers; CLI; **MCP server so
  AI agents can read/edit scenes**; plugins define node kinds.
- Reported: the wall system transforms each opening's bounding box into
  wall-local space and extrudes it through the wall thickness before
  subtracting (see the mintlify wiki, `api/systems/wall-system`).
- **Why it matters:** benchmark for the far end of the roadmap
  (multi-room, real holes, scans). It's too heavy to copy into a no-framework
  Vite app, but its docs (`docs/architecture.md`, mintlify wiki) are
  worth reading for data-model ideas.

#### Importing your own apartment into Pascal
Read from Pascal's source on `main`, 2026-11-10. Pascal itself was not run,
so actual UI labels may differ.

| You have | Pascal turns it into | Editable walls? |
|---|---|---|
| Floor plan image (JPEG/PNG/WebP/GIF) | **Guide** node: image layer (default opacity 50%) with a scale reference (two points + real length → `metersPerUnit`). You trace walls over it. | No, you trace them |
| 3D scan as **GLB/glTF** | **Scan** node: reference layer with position/rotation/scale/opacity, loaded with a KTX2-aware glTF loader. Needs an open project (the scan is uploaded to it). | No, reference only |
| **IFC** (2x3 / IFC4) | IFC converter app (`apps/ifc-converter`, package `@pascal-app/ifc-converter`). Sites, buildings, levels, walls, doors, windows, slabs, columns and spaces become native nodes; anything else becomes an `imported-mesh` node. Labelled **early alpha**. Outputs scene JSON. | Yes (when mapping succeeds) |
| Pascal scene ("build") JSON | "Load Build", or `/import?src=<https URL>` (meant for scanning apps to hand over a file). Needs CORS on the source; 10 MB cap; validated and reviewed before creating the scene. | Yes |

- **Not accepted directly:** OBJ, FBX, SketchUp, DXF, USDZ, PLY/E57
  point clouds, Apple RoomPlan JSON. Convert to GLB (e.g. Blender) to
  use as a scan reference.
- **Custom furniture:** the docs say the built-in catalogue is small and
  host apps can extend it ("contracts for GLB catalog items"). No UI
  upload for your own furniture models was found, so test this before
  relying on Pascal to preview specific products.
- **MCP:** agents can read/edit/validate/save scenes. `export_glb` is
  `not_implemented` in the MCP package; the browser editor has its own
  GLB export (`packages/editor/src/lib/glb-export.ts`).
- **Hosting:** editor.pascal.app (separate terms), or run locally/self-host (MIT).
- **Suggested first try:** floor-plan image as a guide → trace walls →
  add a few real furniture pieces to judge the catalogue.

Source files: `packages/editor/src/components/ui/action-menu/view-toggles.tsx`
(accepted types), `packages/core/src/schema/nodes/{guide,scan,imported-mesh}.ts`,
`packages/editor/src/lib/local-guide-image.ts`, `packages/nodes/src/scan/renderer.tsx`,
`apps/editor/app/import/import-client.tsx`, `apps/editor/lib/import-src.ts`,
`apps/ifc-converter/components/IfcConverter.tsx`.

### blueprint3d family
The classic open-source three.js planner. It has a 2D floorplan editor and a 3D item view.

| Repo | Status | Notes |
|---|---|---|
| [furnishup/blueprint3d](https://github.com/furnishup/blueprint3d) | Original, unmaintained. ≈2k★, 587 forks. Licence in LICENSE.txt (not checked). | `src/` split into `core`, `model`, `floorplanner` (2D), `three` (3D), `items`. Uses old `Geometry`/`Face3` APIs. Verified. |
| [aalavandhaann/blueprint-js](https://github.com/aalavandhaann/blueprint-js) | ES6 port. MIT, ≈592★. | Pure MVC (models hold data; 2D view on PixiJS, 3D view on three.js). GLTF export, skybox switching. README says 3D items are WIP. README states three.js "1.148.0" (probably r148). Verified. |
| [charmlinn/blueprint3d-modern](https://github.com/charmlinn/blueprint3d-modern) | TypeScript rewrite. MIT, ≈155★, 10 commits. | **three.js 0.181.2**, BufferGeometry throughout. Next.js 15 demo, 2D canvas wall editor with snapping and measurement overlays, item catalogue with doors/windows, drag/resize/rotate/lock. Save = `exportSerialized()` JSON in IndexedDB with a base64 thumbnail. GLB is on the roadmap (OBJ/MTL only today). Verified. |
| [omerg/blueprint3d](https://github.com/omerg/blueprint3d) | Fork | Better save/load format; jQuery removed from core. Reported. |
| "Blueprint3D Evolved" | Fork (Reddit, May 2025) | Wall paint, upload and trace a floor-plan image. Reported. |

**Why it matters:** blueprint3d's 5-way split (core / model / 2D view /
3D view / items) is a good target layout if `main.js` grows too large
(see TODO.md code smells).

### cvdlab/react-planner
Reported.

- Repo: <https://github.com/cvdlab/react-planner> · MIT · created 2016, little activity since
- React component with a 2D SVG plan editor and a three.js 3D view;
  catalogue of walls, "holes" (doors/windows) and items.
- Many forks (`react-floorplanner`, `react-planner-fork`). Low npm usage.
- Its catalogue design (each element = 2D render + 3D render + properties)
  is a useful pattern if we ever add a 2D plan view.

### Smaller / unclear licence

| Repo | Notes |
|---|---|
| [CodeHole7 (CodyMQ)/threejs-3d-room-designer](https://github.com/CodeHole7/threejs-3d-room-designer) | ≈465★, React + three.js. 2D wall editing and a product configurator with **morph-based resizing** (not scaling) and per-part materials. **No licence found**; repo looks like build output; full source "on request". Use for ideas only. Verified. |
| [nickorzha/threejs-room-planner](https://awesome.ecosyste.ms/projects/github.com%2Fnickorzha%2Fthreejs-room-planner) | Small React + three.js planner. Reported. |
| [hofk/SHOWROOM](https://github.com/hofk/SHOWROOM) | Generates showrooms from construction-drawing data; by a prolific three.js forum contributor. Reported. |
| [aniketghodmare/3d-floorplan](https://awesome.ecosyste.ms/projects/github.com%2Faniketghodmare%2F3d-floorplan) | Reported. |
| [socialtables/openfpc](https://awesome.ecosyste.ms/projects/github.com%2Fsocialtables%2Fopenfpc) | React + three.js 2D CAD tool, archived. Reported. |
| [@opengeometry/openplans](https://www.jsdelivr.com/package/npm/@opengeometry/openplans) | TS library with a three.js renderer that places walls/doors/windows. Reported. |

---

## B. Open-source planners not on three.js

These are useful as feature benchmarks even though the engine differs.

| Project | Engine | Notes |
|---|---|---|
| **Sweet Home 3D / SH3D JS** | Custom WebGL (glMatrix), Java → JS via JSweet | The reference desktop planner (GPL). Its online editor runs in any WebGL browser. Source on SourceForge; self-hosting builds are reported to be painful. Good UX benchmark for furniture catalogue, wall drawing, and dimension lines. [sweethome3d.com](https://www.sweethome3d.com/) |
| **mehanix/arcada** | React + **Pixi.js** (2D) | Walls, furniture, doors/windows, measure tool. 2D only. [repo](https://github.com/mehanix/arcada) |
| **kodaline/home-planner** | Raw WebGL | [repo](https://github.com/kodaline/home-planner) |

---

## C. Adjacent: configurators, BIM, archviz

| Project | What to learn |
|---|---|
| [GronskiDeveloper/threejs-product-configurator-starter](https://github.com/GronskiDeveloper/threejs-product-configurator-starter) | MIT minimal configurator: parametric geometry, materials, live spec. Reported. Pattern for "change W/D/H and rebuild" (we already do this). |
| [Salsita KILO case study](https://blog.salsitasoft.com/implementing-a-challenging-product-configurator-with-3d-parametric-models/) | Parametric furniture: split into parts, draw a 2D profile per part, extrude in three.js. Gives better procedural builders than stacked boxes. |
| [That Open Company `@thatopen/components`](https://github.com/ThatOpen/engine_components) + [web-ifc](https://github.com/ThatOpen/engine_web-ifc) | BIM/IFC in three.js. `web-ifc-three` is deprecated in favour of components. Includes **SimpleDimensions** (dimension lines on a plane, with snapping). Overkill unless we load architect IFC files. |
| [Shapespark](https://shapespark.com/) | Commercial WebGL archviz with **baked lightmaps** (GPU/cloud bake). Benchmark for how photoreal a browser walkthrough can look. Falls back to FXAA on devices without MSAA. |
| [Three.js Journey "baked room"](https://www.threejs-journey.com/lessons/creating-a-scene-in-blender) | Paid lesson; the forum calls it the most complete Blender → three.js baking tutorial. Pitfall: lightmaps need `texture.flipY = false`. |
| [google/model-viewer](https://modelviewer.dev/) | `<model-viewer ar ar-placement="floor" ar-scale="fixed">` gives real-scale AR preview of one GLB on Android/iOS. Cheapest way to "see this sofa in my real room". |
| [AR_RoomDecor](https://padmavatisb.github.io/AR_RoomDecor) | three.js + WebXR hit-test furniture placement demo. Reported. |
| [three.js editor](https://threejs.org/editor/) | Official editor. Its `editor/js/commands/` folder is the reference undo/redo implementation. |

---

## Commercial products (UX benchmarks only)

None of these publish their rendering stack (searched; no confirmation
found). Use them to judge UX, not code.

| Product | Worth copying |
|---|---|
| IKEA Kreativ | Scan-your-room + erase-existing-furniture flow; real product catalogue. |
| IKEA Wallspace Planner (by Demodern) | Photoreal 3D environment, WebAR, mobile-first. [case study](https://demodern.com/projects/ikea-wallspace-planner) |
| Planner 5D, Homestyler, Floorplanner, Coohom, RoomSketcher | Catalogue browsing, 2D↔3D switching, render-quality "snapshot" button (often cloud-rendered). |
| Roomle | Product configurator + room planner hybrid. |

---

## Sources

- <https://github.com/ch-bas/threejs-sims-house-builder>
- <https://github.com/laanlabs/openPlan3D>
- <https://github.com/pascalorg/editor> · <https://www.mintlify.com/pascalorg/editor/introduction> · <https://mintlify.wiki/pascalorg/editor/api/systems/wall-system>
- <https://github.com/furnishup/blueprint3d> · <https://github.com/aalavandhaann/blueprint-js> · <https://github.com/charmlinn/blueprint3d-modern> · <https://github.com/omerg/blueprint3d>
- <https://discourse.threejs.org/t/blueprint3d-modern-a-full-typescript-three-js-r181-rewrite-of-the-abandoned-blueprint3d-floor-planner/90610>
- <https://github.com/cvdlab/react-planner> · <https://github.com/CodeHole7/threejs-3d-room-designer>
- <https://www.sweethome3d.com/> · <https://github.com/mehanix/arcada>
- <https://github.com/ThatOpen/web-ifc-three> · <https://shapespark.com/> · <https://demodern.com/projects/ikea-wallspace-planner>
- <https://discourse.threejs.org/t/how-to-bake-light-with-textures/52076>
