# Handoff

Where the last session left off and what to pick up next. Read it after
[CLAUDE.md](CLAUDE.md) (how the code works) and before [TODO.md](TODO.md)
(every open item).

**Rewrite this whole file at the end of each session; don't append.** Keep it
to about a screen. History lives in `git log`, the merged PRs and
[TODO_ARCHIVE.md](TODO_ARCHIVE.md).

_Last updated: 2026-11-12_

## State
- `master` = `dc842d4` (PR #14). It deploys itself to GitHub Pages on every
  push (`.github/workflows/deploy.yml`, about 30 s):
  https://ozanserifoglu.github.io/house_3d_double/
- PRs have no CI checks. Test locally (`npm run dev`, `npm run build`).
- Roadmap 1 (realistic render) is done except sun patches through windows,
  which need roadmap 4 (wall holes).

## Last session (2026-11-12)
- **#13 Textures:** wood/fabric drawn on canvas, real-world cm scale, and a
  per-room "Floor look" (plain/parquet/tile, optional `room.floorTex`).
  Details in CLAUDE.md "Textures".
- **#14 Window light:** one `RectAreaLight` per window, strength per lighting
  preset, the glass glows with it. `frontFacesRoom` in `layout-math.js`.
  Details in CLAUDE.md "Window light".
- How it ran: a hub session started one background agent per feature, each
  in its own worktree (`.claude/worktrees/agent-*`) on its own
  `feature/*` branch. The hub then did a trial merge, opened the PRs, and
  resolved the docs-only conflicts (CLAUDE.md / TODO.md / TODO_ARCHIVE.md;
  parallel branches always collide there).
- The combined result was only smoke-tested: a build plus one daytime 3D
  screenshot. See TODO.md "Untested".

## Next up (suggested order)
1. **Move rooms + selection out of `main.js`** into their own module
   (TODO.md "Code smells"). This is a prerequisite for GLB import.
2. **GLB/glTF import** (roadmap 2). The `threejs-loaders` and
   `threejs-asset-pipeline` skills in `.claude/skills/` apply.
3. **Enter the real apartment** (roadmap 3). This needs the owner's tape
   measurements.
4. Cheap wins from TODO.md "Bugs / UX": re-snap a door/window after R,
   Ctrl+R also rotating, new pieces landing on top of each other.

## Loose ends
- Worktree `.claude/worktrees/agent-ab26c99c8a021ce08` (local branches
  `feature/window-light` and `worktree-agent-ab26c99c8a021ce08`, both merged)
  couldn't be removed from inside that session. Its `node_modules` is a
  **real folder** (the agent ran `npm install`), not a junction. Remove it:
  `git worktree remove --force .claude/worktrees/agent-ab26c99c8a021ce08`, then
  `git branch -d feature/window-light worktree-agent-ab26c99c8a021ce08`.

## Notes for a hub session running agents
- Tell each agent its branch name, to commit locally and not push, and to
  **stop its dev server** before it finishes. One was left running and held
  its worktree's files open.
- Agents ran `npm install` in their worktrees (real `node_modules`). To save
  time and disk, tell them to make a junction to the main `node_modules`
  instead (`cmd /c mklink /J node_modules <main>\node_modules`), and follow
  the CLAUDE.md removal rule for junctions.
- Ask each agent to list the shared functions it touched, which makes the
  merge easy. Do a trial `git merge --no-commit` in a scratch worktree
  before opening PRs.
- `gh` is installed and logged in on this PC (merging PRs, run status).
  Playwright is installed in the session scratchpad, not in the project.
  The Vite build uses base `/house_3d_double/`, so screenshot the dev
  server, not `vite preview`.
