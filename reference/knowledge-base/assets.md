# Free assets: furniture models, textures, HDRIs

Researched 2026-11-10. **Always re-check the licence on the specific
asset page before committing a file to `public/models/`.** Record the
source and licence next to each file (e.g. a `public/models/CREDITS.md`).

## Furniture models

| Source | Licence | Formats | Style | Notes |
|---|---|---|---|---|
| [Poly Haven models](https://polyhaven.com/models) | **CC0** | glTF, blend, fbx | **Photoreal** PBR | Best fit for realistic preview. Examples: [ArmChair_01](https://polyhaven.com/a/ArmChair_01) (~6k tris), [painted_wooden_chair_02](https://polyhaven.com/a/painted_wooden_chair_02) (~1k tris), [WoodenTable_03](https://polyhaven.com/a/WoodenTable_03), [ClassicNightstand_01](https://polyhaven.com/a/ClassicNightstand_01), [sofa_03](https://polyhaven.com/a/sofa_03). Has a public API (poorly documented). Real-world scale. |
| [KayKit Furniture Bits](https://kaylousberg.itch.io/furniture-bits) | **CC0** | **glTF**, FBX, OBJ | Low-poly stylised | Free (pay what you want). Interiors and rooms. |
| [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) | **CC0** | (check download; Kenney usually ships glTF/FBX/OBJ) | Low-poly | ~140 files, v1.0 (2018). |
| [Quaternius "Furniture Low Poly"](https://opengameart.org/content/furniture-low-poly) | CC0 | not confirmed | Low-poly | |
| [Poly Pizza](https://poly.pizza/) | **Mostly CC-BY**, some CC0, per model | glTF | Low-poly | Attribution required for CC-BY. |
| [FurniMesh](https://furnimesh.com/library/format/glb/) | Vendor terms (free commercial use, no attribution claimed). **Not CC0.** | GLB, glTF | AI-generated from photos | Read terms first. Quality varies. |
| Manufacturer models (IKEA product pages, etc.) | Usually **not licensed for download/reuse** | — | Exact products | Viewing on their site is fine; extracting files likely breaks ToS. For a private planner, prefer modelling a box at the real product's dimensions. |
| [Sketchfab](https://sketchfab.com/) (filter: downloadable, CC licences) | Per model (CC-BY, CC0, …) | glTF/GLB auto-converted | Mixed | Large catalogue; check each licence. |

**Scale tip:** glTF is in metres. Our scene is in cm, so multiply by 100
or, better, fit to the catalogue's W/D/H using the model's `Box3`.

## Textures (PBR)

| Source | Licence | Notes |
|---|---|---|
| [Poly Haven textures](https://polyhaven.com/textures) | CC0 | Wood floors, tiles, plaster, fabric. 1k–8k. Use 1k–2k for web. |
| [ambientCG](https://ambientcg.com/) | CC0 | Huge PBR library (colour/normal/roughness/AO). |
| [3dtextures.me](https://3dtextures.me/) | Free (check terms) | Used by blueprint-js for floors/walls. |

## HDRIs (environment / window light)

| Source | Licence | Notes |
|---|---|---|
| [Poly Haven HDRIs](https://polyhaven.com/hdris) | CC0 | Pick an "indoor" or "skies" HDRI at 1k–2k for `scene.environment`. Loader in 0.160: `RGBELoader` (renamed `HDRLoader` in r180). |
| Built-in `RoomEnvironment` | MIT (three.js) | Procedural, zero download. Good default. |

## Sources

- <https://polyhaven.com/about-contact> (CC0 statement)
- <https://kaylousberg.itch.io/furniture-bits> · <https://godotengine.org/asset-library/asset/2125>
- <https://kenney.nl/assets/furniture-kit> · <https://opengameart.org/content/furniture-kit>
- <https://opengameart.org/content/furniture-low-poly>
- <https://app.cinevva.com/game-assets/free-3d-furniture-models>
- <https://furnimesh.com/library/format/glb/>
