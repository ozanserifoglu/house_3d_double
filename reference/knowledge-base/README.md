# Knowledge base: three.js planners, editors and techniques

Research notes from web research done on 2026-11-10. The goal is to
find projects similar to this room planner, or close enough in some
area, so they can serve as **benchmarks** (what "good" looks like) and
as **references** (code to read before building a roadmap item).

| File | What's in it |
|---|---|
| [projects.md](projects.md) | Open-source planners and editors, commercial products, adjacent tools. One card per project. |
| [techniques.md](techniques.md) | How others solve each problem on our roadmap: drag/snap/collision, undo, wall holes, realistic rendering, GLB import, getting real dimensions, measurements. |
| [assets.md](assets.md) | Free furniture models, textures and HDRIs, with licences. |

## How reliable is this?

- **Verified** means the repo or product page was opened on 2026-11-10
  and the fact (licence, stars, stack, features) was read there.
- **Reported** means it came from search snippets or third-party
  write-ups and was not checked at the source. Treat it as a lead.
- Star counts drift. Licences can change. **Re-check the licence before
  copying any code.**
- Most projects target newer three.js than ours (we pin **0.160.0**).
  Code from r170+ projects may need small API changes (see the version
  notes in [SKILLS.md](../../SKILLS.md#open-items)).

## Benchmark scorecard

Each capability is compared with the best reference found. "Us" is the
state of `src/` on 2026-11-10.

| Capability | Us | Best reference | Gap / next step |
|---|---|---|---|
| Drag furniture on floor | ✅ raycast to floor plane, capture-phase handler | three.js forum patterns; blueprint3d | None. Ours is already the standard pattern. |
| Overlap detection | ✅ SAT on rotated footprints, red outlines | Most planners skip this or use AABB | Ours is **ahead** of most open-source planners. |
| Wall snap | ✅ 8 cm snap to room walls | openPlan3D, sims-house-builder (snap + angle constraints) | Add snapping to *other furniture* edges (align/distribute). |
| Doors/windows | ⚠️ plates stuck to walls | sims-house-builder, Pascal, openPlan3D cut real holes | Roadmap #4. See [wall holes](techniques.md#4-real-wall-holes-for-doors-and-windows). |
| Undo / redo | ❌ none (and Backspace deletes) | three.js editor command pattern; Pascal (Zundo); sims-house-builder | Highest-value small feature. See [undo](techniques.md#2-undo--redo). |
| Multi-select, groups, align | ❌ | sims-house-builder | Nice to have. |
| Save / load | ✅ localStorage slots + JSON text | blueprint3d-modern (IndexedDB + thumbnail), sims-house-builder (restore points, share links) | Add thumbnails or restore points if slots feel limiting. |
| Export | JSON text only | sims-house-builder: JSON/CSV/PNG/GLB/SVG/DXF; openPlan3D adds PDF | PNG screenshot is trivial (`renderer.domElement.toDataURL`); GLB via `GLTFExporter`. |
| Realistic rendering | ⚠️ hemi + sun, PCF soft shadows | three.js examples (PCSS, contact shadows), RoomEnvironment, N8AO, three-gpu-pathtracer | Roadmap #1. See [rendering](techniques.md#5-realistic-rendering). |
| Real furniture meshes | ❌ procedural boxes only | sims-house-builder (catalogue + builder registry, like ours), openPlan3D (3D model catalogue) | Roadmap #2. See [GLB import](techniques.md#6-importing-real-furniture-glb). |
| Real room dimensions | Manual W/D/H inputs | openPlan3D imports **Apple RoomPlan** scans | Roadmap #3. See [real dimensions](techniques.md#7-getting-real-apartment-dimensions). |
| Dimension labels | ❌ | sbcode.net measurement tutorial (CSS2DRenderer) | Show item-to-wall distances in top view. |
| First-person walk | Eye-level preset only | openPlan3D, sims-house-builder (walkthrough) | PointerLockControls if wanted. |
| Multi-room / walls editor | ❌ single rectangle | blueprint3d family, openPlan3D, Pascal (2D wall drawing) | Roadmap #4. Big jump in complexity. |

## Top 5 projects to study first

1. **[ch-bas/threejs-sims-house-builder](projects.md#ch-basthreejs-sims-house-builder)**:
   the closest match to our architecture. It uses raw three.js (no R3F),
   and furniture is a catalogue entry plus a mesh builder in a central
   registry, just like our `CATALOG`/`BUILD`. It has undo, openings cut
   through walls, and GLB export. MIT.
2. **[three.js editor `editor/js/commands/`](techniques.md#2-undo--redo)**:
   a small, proven undo/redo command pattern written in plain ES modules.
3. **[laanlabs/openPlan3D](projects.md#laanlabsopenplan3d)**: imports
   Apple RoomPlan scans, which is the fastest path to real apartment
   dimensions. MIT.
4. **[pascalorg/editor](projects.md#pascalorgeditor)**: the most
   ambitious open-source building editor (≈25k★). Use it as a benchmark
   for the far end of the roadmap, not as code to copy, since its stack
   is R3F, WebGPU and a monorepo. MIT.
5. **[gkjohnson/three-bvh-csg](techniques.md#4-real-wall-holes-for-doors-and-windows)**
   and **[three-gpu-pathtracer](techniques.md#5-realistic-rendering)**:
   the two go-to libraries for wall holes and a photoreal still mode.

## Takeaways for this project

- **Our core interaction is already on par.** Floor-plane drag, rotated
  SAT overlap and wall snap match or beat most open-source planners.
  The gaps are around it: undo, real meshes, rendering, openings.
- **Keep the catalogue + builder registry.** sims-house-builder uses the
  same design at 69 items, so it scales. GLB items can join as a
  `BUILD` variant that clones a loaded scene graph.
- **Wall holes don't need CSG in a single rectangular room.** With box
  walls, cutting a rectangular opening = replacing one wall box with up
  to 4 boxes around the hole. Use CSG (three-bvh-csg) only if walls
  become arbitrary meshes. This fits "Simple > fancy".
- **Realism is a stack of cheap steps, in this order:** ACES tone
  mapping, `RoomEnvironment` env map, PBR textures, AO pass, better
  shadows, and optionally a path-traced "photo" button. All of these
  have official three.js examples.
- **Commercial planners** (IKEA Kreativ, Planner 5D, Homestyler,
  Floorplanner, Roomle) don't publish their engines. Use them as UX
  benchmarks only (see [projects.md](projects.md#commercial-products-ux-benchmarks-only)).
