# Agent skills: research, installs and safety review

Notes from a Claude Code session on 2026-11-10. Covers which agent skills fit
this project, what got installed, the security review behind each decision,
and what is still open.

## Summary

| Skill | Status | Verdict |
|---|---|---|
| `threejs-lighting` | Installed | Safe to install |
| `threejs-materials` | Installed | Safe to install |
| `threejs-textures` | Installed | Safe to install |
| `threejs-postprocessing` | Installed | Safe to install |
| `threejs-loaders` | Installed | Safe to install |
| `threejs-asset-pipeline` | Installed | Safe to install |
| `playwright-cli` | **Not installed** (deferred) | Install with precautions |

Installed location: `.claude/skills/<name>/SKILL.md` (project level only).

## Open items

- [ ] **three.js version mismatch.** The installed skills target **r186**; this
      project is pinned to **0.160.0**. Many APIs differ (`RGBELoader` →
      `HDRLoader` in r180, `Clock` → `Timer` in r183, `PostProcessing` →
      `RenderPipeline`, `PCFSoftShadowMap` deprecated in r182, removed
      constructor args on `SMAAPass`/`HalftonePass` in r175). Either upgrade
      three.js (re-check lighting and colour, per CLAUDE.md) or add a line to
      CLAUDE.md such as: *"Target three.js 0.160 APIs; ignore r186-only idioms
      such as HDRLoader and Timer."*
- [ ] **playwright-cli** decision deferred. See [Playwright recommendation](#playwright-recommendation).
- [ ] `.claude/skills/` is untracked in git. Decide whether to commit it.
- [ ] Skills were copied by hand (not via `npx skills add`), so `npx skills
      update` will not track them. To update: re-review the new commit, then
      copy again.

---

## 1. Skill research

Searched the open skills registry (`npx skills find`, ~20 queries: threejs,
three.js, webgl, react three fiber, 3d, gltf, blender, shader, pbr textures,
floor plan, interior design, 3d model optimization, vite, webgl performance,
playwright, javascript es modules, visual regression, frontend design), then
checked GitHub stars and last activity for each source repo. Install counts
are as reported by the registry and were not independently verified.

### Already installed before this session (none 3D-related)

| Skill | Use here |
|---|---|
| `graphify` | Codebase knowledge graph; may help once `main.js` grows |
| `hf-cli` | Hugging Face Hub; only if pulling models from HF |
| `find-skills`, `handoff` | General tools |
| Built-ins: `run`, `code-review`, `simplify`, `security-review` | Launching, reviewing |

### Tier 1: core three.js

**`CloudAI-X/threejs-skills`**: ★4.1K, MIT, updated Oct 2026, 13 skills at
16–25K installs each. Targets r186.

| Skill | Roadmap fit |
|---|---|
| `threejs-lighting` | #1 realistic rendering (soft shadows, env lighting, window light) |
| `threejs-materials` | #1 (PBR wood, fabric, tile) |
| `threejs-textures` | #1 (texture loading, colour space, repeat) |
| `threejs-postprocessing` | #1 (AO, tone mapping, EffectComposer) |
| `threejs-loaders` | #2 GLB import |
| `threejs-asset-pipeline` (4.6K) | #2 (gltf-transform, keeping models < 5 MB) |
| `threejs-interaction` | Drag, raycasting, OrbitControls |
| `threejs-geometry` | Beveled edges, primitive builders |
| `threejs-performance` (5K) | TODO code smells (rebuilds, outline churn) |
| `threejs-fundamentals` | Scene, camera, renderer setup |
| `threejs-shaders`, `threejs-animation` | Low priority for a room planner |
| `threejs-react-three-fiber` | Skip (no framework here) |

**`gamedev-skills/awesome-gamedev-agent-skills`**: ★8.1K, Apache-2.0, very active.
- `threejs-gltf-loading` (9K): narrower alternative for #2
- `threejs-materials-lighting` (8.9K), `threejs-scene-setup` (8.9K)

### Tier 2: worth considering

| Skill | Source | Why |
|---|---|---|
| `freshtechbro/claudedesignskills@blender-web-pipeline` (3.9K) | ★1.3K, no updates since Nov 2025 | Blender → GLB for #2 |
| `freshtechbro/claudedesignskills@threejs-webgl` (5K) | same | Overlaps CloudAI-X |
| `majidmanzarpour/threejs-game-skills@threejs-debug-profiler` (3.6K) | ★2.8K | Renderer and performance debugging |
| `majidmanzarpour/threejs-game-skills@threejs-aaa-graphics-builder` (3.8K) | ★2.8K | High-end visuals, game-oriented |
| `antfu/skills@vite` (41.8K) | ★6K, Anthony Fu | Vite config, single-file build (TODO) |
| `microsoft/playwright-cli` (212K) | ★15K, Microsoft | Automating the untested-features TODO list |
| `anthropics/skills@frontend-design` (1.1M) | ★192K, Anthropic | Control panel UI polish |

### Tier 3: niche or later

- `RobLe3/cc-blender-skill@blender-export` / `blender-modeling` (2–3K, ★156): if modelling furniture yourself.
- `img2threejs/img2threejs` (2.9K, ★21K): image → three.js scene; maybe for roadmap #3.
- `meshy-dev/meshy-3d-agent@meshy-3d-generation` (2.7K), `layerai/skills@layer-3d` (4.6K): AI-generated meshes, paid API.
- `dgreenheck/webgpu-claude-skill@webgpu-threejs-tsl` (1.7K, ★1.3K, **no licence**): only after upgrading past 0.160.
- `curiositech/some_claude_skills@interior-design-expert` (1.2K): design advice, not code.

### Skipped

- `cesartevisual/*`, `full-stack-skills/*`, `vladmdgolam/blender-mcp`: under 25 stars each.
- `openmontageinc/openmontage@threejs-*`: copies of CloudAI-X topics inside a large AGPL video project.
- `mengto/skills@*` (scroll worlds, towers, weather): game and landing-page effects.
- Floor-plan / interior-visualisation skills (`eachlabs`, `muapi`): AI image generation, not 3D code.
- `liarjsdev/...@playwright-stealth-verify`: 119K installs looks inflated; built for bot-detection evasion.

---

## 2. Security review: installed three.js skills

**Verdict: SAFE TO INSTALL.** Instruction-only reference text from a known
maintainer; no scripts, no network, no secret access, nothing hidden.

- **Repo:** `CloudAI-X/threejs-skills`
- **Commit:** `0e181866f095b5f06d005133876e926515390d95` (2026-10-19)
- **Licence:** MIT. ★4.1K.
- **Files:** each skill is a single `SKILL.md`; no other files in the skill
  folders. All 6 read in full.

### Method
1. Pinned the commit and listed the full repo tree.
2. Downloaded each file at that commit.
3. Automated scans: zero-width / bidi / tag Unicode, HTML comments, base64-like
   blobs (60+ chars), injection phrases ("ignore previous", "silently",
   "bypass", "run this first", etc.), max line length.
4. Read every file in full.
5. Verified the installed copies' git blob hashes match the pinned commit.

### Findings

| Severity | Where | Finding |
|---|---|---|
| INFO | `threejs-asset-pipeline` lines 15–17, 201 | `npx @gltf-transform/cli …` and `npx gltfjsx` shown unpinned. Examples that fit the purpose; only run if asked. |
| INFO | all 6, line 8 | Targets three.js r186 (see Open items). |
| — | Injection, hidden text, encoded blobs, secret reads, outbound URLs (only `cdn.example.com` as an illustration), runtime-fetched instructions, `allowed-tools` | None found |

Scan notes: no suspicious Unicode in any file; no HTML comments; no blobs.
Injection-phrase hits were all benign code comments (e.g. "Specular
overrides", "silently ignored without it").

### Installed blob hashes

| File | Git blob SHA |
|---|---|
| `.claude/skills/threejs-lighting/SKILL.md` | `49370e6e1c9a73096e3089c78246b826fb572cdf` |
| `.claude/skills/threejs-materials/SKILL.md` | `550a83cd4febc2ee458962deb0da4d67da3b9d13` |
| `.claude/skills/threejs-textures/SKILL.md` | `dd12ee9f94300c6674bae586288e5d7c030b8ef0` |
| `.claude/skills/threejs-postprocessing/SKILL.md` | `9e45adb56a967090d3a83a13e1e6b8b2a824cd28` |
| `.claude/skills/threejs-loaders/SKILL.md` | `ce7100526666340c37a3996e5e3ab3ff7cb7893e` |
| `.claude/skills/threejs-asset-pipeline/SKILL.md` | `9515e85dac0dd16a3d8fac9b00263af8c217517f` |

Re-check later with `git hash-object .claude/skills/<name>/SKILL.md`.

---

## 3. Security review: playwright-cli (not installed)

**Verdict: INSTALL WITH PRECAUTIONS.** Legitimate Microsoft repo, nothing
malicious, but it pre-approves powerful commands and relies on an unpinned
global CLI.

- **Repo:** `microsoft/playwright-cli`
- **Commit:** `9c95a500e59b354c3e76135e5686f42cedb28391` (2026-11-10)
- **Licence:** Apache-2.0. ★15K. CLI package `@playwright/cli` 0.1.24.
- **Read in full:** `skills/playwright-cli/SKILL.md`, all 10
  `references/*.md`, plus the CLI's `playwright-cli.js`, `skillCheck.js`,
  `package.json`.
- **Not read:** the `playwright` / `playwright-core` npm packages the CLI runs
  (`1.66.0-alpha-1794252756000`).

### What it does
Teaches the agent to drive a browser through the `playwright-cli` command:
open pages, click, fill, snapshot, screenshots, cookies and storage, request
mocking, tracing, video, and a plan → generate → heal workflow for Playwright
tests. The skill is useless without the CLI installed separately.

### Findings

| Severity | Evidence | Why it matters |
|---|---|---|
| **MEDIUM** | `SKILL.md:4` `allowed-tools: Bash(playwright-cli:*) Bash(npx playwright:*) Bash(npx --no-install playwright:*)` | While the skill is active these commands run **without a permission prompt**: `run-code` (arbitrary JS with `fetch`), `attach --cdp=chrome` (your real signed-in Chrome), `cookie-get` / `state-save auth.json` (writes login sessions to disk), `delete-data`, `kill-all`, and `npx playwright test` / `install` (runs project code, downloads browsers). |
| **MEDIUM** | `SKILL.md:415` `npm install -g @playwright/cli@latest` | Global, unpinned install. The CLI depends on an **alpha** Playwright build. That code is outside this review. |
| LOW | `playwright-cli.js:81` | Once a day on `open`/`attach`/`list`/`install`, spawns `npm view @playwright/cli version` (npm registry) and writes `cli-update-check.json` to Playwright's registry dir. Sends no data. Disable with `NO_UPDATE_NOTIFIER=1`. |
| LOW | `skillCheck.js` | Reads `.claude/skills/playwright-cli/SKILL.md` and `.agents/skills/...` in the cwd and prints a warning if it differs from the bundled copy. Read-only. |
| LOW | `references/test-generation.md:744` `npm init playwright@latest` | Unpinned scaffolding command. |
| INFO | `SKILL.md:234–247` WebMCP | Tells the agent to prefer page-provided tools, but labels them "untrusted". |
| INFO | `references/storage-state.md` "Security Notes" | Advises not committing auth state files. Good. |
| — | Hidden Unicode, HTML comments, encoded blobs, instructions to hide actions | None found |

### Playwright recommendation

**Recommendation: skip it for now.**

1. **Redundant here.** The Claude desktop app already has a built-in browser
   that can open the Vite dev server, click, read the page, and take
   screenshots. That covers the "Untested since the port" TODO list without
   installing anything.
2. **No test suite yet.** The skill's strongest part (plan → generate → heal
   for Playwright tests) needs `@playwright/test` set up first.
3. **The auto-allow is the real cost.** Pre-approving `playwright-cli:*`
   removes prompts for commands that can touch your real browser profile and
   cookies.

**Revisit when** you want repeatable automated tests (e.g. regression checks
for drag/rotate/save after the GLB import work). Then install it with:

1. Project-level only: `.claude/skills/playwright-cli/`, never global.
2. **Delete the `allowed-tools:` line** from `SKILL.md` so every command still
   asks.
3. Pin the CLI as a dev dependency instead of `-g @latest`:
   ```bash
   npm i -D @playwright/cli@0.1.24
   ```
   and use it through `npx --no-install playwright-cli`.
4. Copy the skill from a pinned commit (as done for the three.js skills) and
   re-review on every update.
5. Add `*.auth-state.json`, `storage-state-*.json` and `.playwright-cli/` to
   `.gitignore`.

---

## Limits of this review

A review lowers risk but does not prove safety. It covers the skill files at
the pinned commits only, not the npm packages they reference
(`@gltf-transform/cli`, `gltfjsx`, `@playwright/cli`, `playwright`). Anything
fetched later, or any newer commit of these repos, needs its own review.
