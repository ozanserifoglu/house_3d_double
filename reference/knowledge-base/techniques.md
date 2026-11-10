# Techniques, mapped to this project

How other projects solve the problems on our roadmap and TODO list.
Researched 2026-11-10. Version notes are relative to our pinned
three.js **0.160.0**.

Contents:
1. [Drag, snap and collision](#1-drag-snap-and-collision)
2. [Undo / redo](#2-undo--redo)
3. [Measurements and top view](#3-measurements-and-top-view)
4. [Real wall holes for doors and windows](#4-real-wall-holes-for-doors-and-windows)
5. [Realistic rendering](#5-realistic-rendering)
6. [Importing real furniture (GLB)](#6-importing-real-furniture-glb)
7. [Getting real apartment dimensions](#7-getting-real-apartment-dimensions)
8. [AR preview](#8-ar-preview)

---

## 1. Drag, snap and collision

**What we have:** raycast to `floorPlane`, capture-phase `pointerdown`
before OrbitControls, SAT overlap on rotated footprints
(`layout-math.js`), 8 cm wall snap, 60 cm opening-to-wall snap.

**What others do:**
- There is no single canonical tutorial. The forum consensus matches
  ours: intersect the pointer ray with a floor (or wall) plane, then run
  bounding-box checks for overlap and snap to planes within a threshold.
- Most open-source planners use **AABB** overlap or no overlap check at
  all. Our rotated-rectangle SAT is better than average.
- **Snap points:** a snap is accepted only within a radius of a matching
  point, and rejected if it would overlap a wall or another piece
  (reported, from a furniture-planner article).
- **Wall-mounted items** (pictures, TVs): raycast against the wall group
  to find the wall under the pointer, then move along that wall's plane
  (three.js forum "Dynamically attach image to wall").
- **sims-house-builder** adds align/distribute, multi-select, groups and
  locks on top of drag-with-snap.

**Ideas to borrow:**
- Snap to *other furniture* edges and centres (align a chair to a desk).
- Wall-plane drag for `tv` and wall shelves, instead of the floor plane plus `y` lift.
- Show the snap target (highlight the wall/edge being snapped to).

Refs: [forum: drag and drop with snapping](https://discourse.threejs.org/t/drag-and-drop-with-snapping-objects/11902),
[forum: attach to wall](https://discourse.threejs.org/t/dynamically-attach-image-to-wall/12080),
[forum: move along surface](https://discourse.threejs.org/t/move-object-along-the-surface-of-another-object/14714).

---

## 2. Undo / redo

**What we have:** nothing. TODO.md flags that Backspace deletes with no undo.

**Reference: three.js editor** (`mrdoob/three.js/editor/js/`):
- `History.js` keeps `undos[]` and `redos[]`; `editor.execute(cmd)` runs
  `cmd.execute()` and pushes it.
- Commands in `editor/js/commands/`: `AddObjectCommand`,
  `RemoveObjectCommand`, `SetPositionCommand`, `SetRotationCommand`,
  `SetScaleCommand`, `SetColorCommand`, `SetValueCommand`,
  `MultiCmdsCommand` (batch), and more (25 files).
- **Merging:** `SetPositionCommand` is "updatable". Consecutive moves of
  the same object within a short time merge into one undo step, so a
  drag is one undo, not 200.
- Docs: "Implementing additional commands for undo-redo.md" in the editor's `docs/`.

**Simpler alternative that fits our code:** snapshot-based undo. We
already serialise the whole layout for autosave (`{room, items}`), so
`commit()` could push the previous JSON onto a capped stack (say 50) and
undo = load the previous snapshot. That's fewer lines than commands, and
it is correct by construction. Pascal uses the same idea through Zundo
(state-snapshot middleware for Zustand).

Refs: [three.js editor commands](https://github.com/mrdoob/three.js/tree/dev/editor/js/commands),
[forum: undo/redo in three.js](https://discourse.threejs.org/t/undo-redo-in-three-js-scene/3025),
[command-pattern undo explainer](https://tahazsh.com/blog/undo-with-command-pattern).

---

## 3. Measurements and top view

- **sbcode.net measurement tutorial:** raycaster + pointer events draw a
  line, a `CSS2DObject` label sits at the midpoint via `lerpVectors`.
  <https://sbcode.net/threejs/measurements/>
- **CSS2DRenderer caveat:** official docs say it supports translation
  only and expects 100% browser zoom. Alternative: project points with
  `vector.project(camera)` and position DOM labels yourself.
- **That Open SimpleDimensions:** dimension lines drawn on a given
  plane, meant for floor-plan navigation, with snapping. A good UX reference.
- **Idea for us:** in top view, show distances from the selected item to
  the nearest wall on each side (we already have `halfExtents` and room
  bounds in `layout-math.js`), plus W×D on the item.

---

## 4. Real wall holes for doors and windows

Roadmap #4. Today doors/windows are plates on the wall.

**Option A: split the wall box (recommended for a rectangular room).**
A box wall with one rectangular opening becomes up to 4 boxes: left of
the hole, right of it, above it (lintel), and below it (sill, for windows).
It needs no library, it's exact, and textures and shadows still work.
Rebuild a wall's boxes when an opening on it moves. This fits "Simple > fancy".

**Option B: CSG with [gkjohnson/three-bvh-csg](https://github.com/gkjohnson/three-bvh-csg)** (MIT, ≈962★). Verified.
```js
import { SUBTRACTION, Brush, Evaluator } from 'three-bvh-csg';
const wall = new Brush(new BoxGeometry(w, h, t)); wall.updateMatrixWorld();
const hole = new Brush(new BoxGeometry(ow, oh, t * 2)); hole.position.set(x, y, 0); hole.updateMatrixWorld();
const result = new Evaluator().evaluate(wall, hole, SUBTRACTION);
```
- Brushes must be **two-manifold** (watertight).
- Result uses `geometry.drawRange`, so `GLTFExporter` may fail unless it's cleared.
- Don't modify a Brush's geometry after creating it. **Re-evaluate from
  scratch** when an opening moves (forum pitfall: the old hole stays).
- Call `updateMatrixWorld()` on both brushes before evaluating (common
  "position does nothing" bug).
- Self-described "experimental". Peer-dep three.js range not checked:
  **verify it works with 0.160** before adopting.
- Used by Pascal Editor for wall cutouts.

Choose B only when walls stop being boxes (non-rectangular rooms, angled walls).

Refs: [forum: window and door openings](https://discourse.threejs.org/t/how-to-create-window-and-door-openings-in-the-wall/20473),
[forum: cutout offset after BVH subtraction](https://discourse.threejs.org/t/aligning-cutout-offset-after-bvh-subtraction/69265).

---

## 5. Realistic rendering

Roadmap #1. Listed cheapest-first. Checked in `node_modules/three` (0.160.0):
`AgXToneMapping`, `RoomEnvironment`, `GTAOPass`/`SAOPass`/`SSAOPass`,
`RoundedBoxGeometry` and `RGBELoader` all exist. N8AO and
three-gpu-pathtracer are third-party; their version ranges were not checked.

| Step | How | Notes |
|---|---|---|
| 1. Tone mapping | `renderer.toneMapping = THREE.ACESFilmicToneMapping` (or `AgXToneMapping`, added r160) | Re-tune light intensities after. |
| 2. Environment light | `RoomEnvironment` → `PMREMGenerator.fromScene()` → `scene.environment` | Procedural studio room, no download. Based on model-viewer's EnvironmentScene. Don't regenerate per frame (slow). For a real sky/window, load a Poly Haven HDRI. |
| 3. PBR textures | `MeshStandardMaterial` with map/normal/roughness from ambientCG or Poly Haven | Set `colorSpace = SRGBColorSpace` on colour maps only. Set `wrapS/T = RepeatWrapping` and repeat in cm/tile size. |
| 4. Ambient occlusion | **[N8AO](https://github.com/N8python/n8ao)** (`N8AOPass` replaces `RenderPass` in EffectComposer) | `aoRadius` is in world units, so with our cm scale start around 30–60. Intensity ~2 reads as natural. No normal pass needed. **Check N8AO's minimum three.js version vs 0.160.** Built-in alternatives in 0.160: `GTAOPass`, `SAOPass`, `SSAOPass`. |
| 5. Better shadows | `webgl_shadowmap_pcss` example (contact-hardening soft shadows); `webgl_shadow_contact` (fake contact shadows under objects) | PCSS is slow with many objects. Contact shadows only work on the floor, not between objects. Tighten the sun's shadow camera to the room (we already do). |
| 6. Window light | Rect area light (`RectAreaLight` + `RectAreaLightUniformsLib`) at each window, or a directional "sun" through the window opening once holes exist | RectAreaLight doesn't cast shadows. |
| 7. Beveled edges | `RoundedBoxGeometry` (addons) instead of `BoxGeometry` in builders | Cheap realism win for procedural furniture. |
| 8. Photo mode | **[three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer)**: `new WebGLPathTracer(renderer); setScene(scene, camera); renderSample()` per frame | Progressive, noisy at first. Has an **interior scene demo**, area and spot light support. Use as a "render still" button, not for live editing. Check its three.js peer range. |
| 9. Baked lighting | Blender bake → lightmap/aoMap; [Shapespark](https://shapespark.com/) does this commercially | Best quality, but furniture can't move, so it fights our core use case. Skip, except perhaps for a baked AO on static walls. |

Installed project skills that cover this: `threejs-lighting`,
`threejs-materials`, `threejs-textures`, `threejs-postprocessing`
(they target r186; see SKILLS.md).

Refs: [RoomEnvironment docs](https://threejs.org/docs/pages/RoomEnvironment.html),
[PMREMGenerator docs](https://threejs.org/docs/pages/PMREMGenerator.html),
[forum: PCSS soft shadow (vanilla + React)](https://discourse.threejs.org/t/new-realistic-pcss-soft-shadow-implementation-react-vanilla/48579),
[forum: HBAO vs N8AO](https://discourse.threejs.org/t/new-ambient-occlusion-example-hbao-vs-n8ao/58847),
[path tracer interior demo](https://gkjohnson.github.io/three-gpu-pathtracer/example/bundle/interior.html),
[realism-effects (SSGI/AO/TRAA)](https://www.npmjs.com/package/realism-effects),
[Threepipe SS contact shadows](https://threepipe.org/plugin/SSContactShadowsPlugin.html).

---

## 6. Importing real furniture (GLB)

Roadmap #2.

**Pattern from sims-house-builder / blueprint3d:** each catalogue entry
has a builder. For a GLB item the "builder" clones a cached, loaded
scene graph. That keeps drag/rotate/overlap/save identical for
procedural and imported items.

Suggested shape for us (not yet built):
- `CATALOG.myChair = { label, w, d, h, model: '/models/chair.glb' }`.
- Load once with `GLTFLoader` (+ `DRACOLoader`/`MeshoptDecoder` if
  compressed), cache by URL, `clone(true)` per item.
- On load: compute `Box3`, scale to cm (glTF is metres, so usually
  ×100), recentre so origin = floor centre and front faces +z (our
  `BUILD` convention). Store the native size; let W/D/H inputs scale
  non-uniformly or lock the aspect.
- Saved layouts keep `model` as a path under `public/models/`, so they reload.
- Keep files < 5 MB: `gltf-transform optimize` (installed skill:
  `threejs-asset-pipeline`).

**Alternative to scaling:** CodeHole7's configurator resizes with
**morph targets** so legs don't stretch. That needs authored models.
Skip.

Refs: [three.js forum #gltf-loader tag](https://discourse.threejs.org/tag/gltf-loader/296), installed skills `threejs-loaders`, `threejs-asset-pipeline`.
Free models: see [assets.md](assets.md).

---

## 7. Getting real apartment dimensions

Roadmap #3.

- **Manual (today):** tape measure → room W/D/H inputs. Fine for one rectangle.
- **Apple RoomPlan** (iPhone/iPad with LiDAR): scans walls, doors,
  windows and furniture with dimensions.
  - Export **JSON** (structured: walls/openings/objects with transforms
    and sizes) and **USDZ** (mesh). USDZ export is one-way: you can't
    get structured data back out of it, so keep the JSON.
  - JSON exporter: [fhstp/swift-roomplan-jsonexport](https://github.com/fhstp/swift-roomplan-jsonexport).
  - Flatten to a floor plan by dropping the vertical axis.
  - **openPlan3D already imports RoomPlan scans**, so read its importer.
  - Some exports reportedly drop the floor from the USDZ.
- **Floor-plan image tracing:** "Blueprint3D Evolved" lets you upload a
  plan image and trace walls over it. Cheap to add as a top-view
  background texture with a scale calibration.

Refs: [RoomPlan overview](https://developer.apple.com/augmented-reality/roomplan),
[CapturedRoom docs](https://developer.apple.com/documentation/roomplan/capturedroom),
[forum: USDZ → JSON not possible](https://developer.apple.com/forums/thread/723496).

---

## 8. AR preview

Not on the roadmap, but cheap and on-theme ("preview new furniture").

- **`<model-viewer>`:** `ar ar-modes="webxr scene-viewer quick-look"
  ar-placement="floor" ar-scale="fixed"`. Shows one GLB at real size in
  your real room on a phone. Needs a correctly scaled GLB (metres).
- **three.js WebXR hit-test** (`webxr_ar_hittest` example): place items
  on detected floor. 1 unit = 1 m in WebXR, so we'd scale our cm scene by 0.01.
- Device support varies. Test on the target phone.

Refs: [Google WebXR AR codelab](https://developers.google.com/ar/develop/webxr/hello-webxr),
[three.js + WebXR AR part 2](https://medium.com/sopra-steria-norge/get-started-with-augmented-reality-on-the-web-using-three-js-and-webxr-part-2-f10861cd1f1d).
