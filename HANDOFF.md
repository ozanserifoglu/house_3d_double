# Handoff

Where the last session left off and what to pick up next. Read it after
[CLAUDE.md](CLAUDE.md) (how the code works) and before [TODO.md](TODO.md)
(every open item).

**Rewrite this whole file at the end of each session; don't append.** Keep it
to about a screen. History lives in `git log`, the merged PRs and
[TODO_ARCHIVE.md](TODO_ARCHIVE.md).

_Last updated: 2026-11-12_

## State
- `master` = `3a8b65d` (PR #15). It deploys itself to GitHub Pages on every
  push (`.github/workflows/deploy.yml`, about 30 s):
  https://ozanserifoglu.github.io/house_3d_double/
- Branch `refactor/rooms-module` (not merged yet): rooms + room selection
  moved out of `main.js` into `rooms.js` (data) and `room-mesh.js` (meshes,
  wall auto-hide). See CLAUDE.md "Room modules".
- PRs have no CI checks. Test locally (`npm run dev`, `npm run build`).

## Last session (2026-11-12)
- Did the `main.js` split above. Click-tested: draw a second room, select,
  undo/redo the new room, lock, parquet floor, Eye level, 3D wall auto-hide,
  reload from autosave. No console errors; build passes.
- The owner set the order: **organize the repo first, then realistic light +
  wall holes, then GLB import.**
- GLB model storage, owner's pick still open: (1) models committed to
  `public/models/`, (2) picked from disk into IndexedDB, (3) both
  (recommended). It changes the save format, so ask before building it.

## Next up (suggested order)
1. Merge `refactor/rooms-module` (PR).
2. **Real wall holes for doors/windows** (roadmap 4). Walls are
   `ExtrudeGeometry` prisms per wall piece (`room-mesh.js`, pieces from
   `walls.js`); a hole means cutting the opening's rectangle out of the
   piece it sits on (2D shape with holes in the wall's own plane, extruded
   through its thickness). The plate stays as the frame/leaf.
3. **Sun patches through windows** (roadmap 1, needs 2): the sun already
   casts shadows, so once walls have holes, sunlight through the opening
   lands on the floor. Possibly a sun direction per preset aimed through
   the windows. Window `RectAreaLight`s still cast no shadows (TODO.md).
4. Optional before GLB: `items.js` split (TODO.md "Code smells").
5. GLB/glTF import (roadmap 2), after the storage decision.

## Loose ends
- Worktree `.claude/worktrees/agent-ab26c99c8a021ce08` (local branches
  `feature/window-light` and `worktree-agent-ab26c99c8a021ce08`, both merged)
  still exists. Its `node_modules` is a **real folder**, not a junction.
  Remove it: `git worktree remove --force .claude/worktrees/agent-ab26c99c8a021ce08`,
  then `git branch -d feature/window-light worktree-agent-ab26c99c8a021ce08`.

## Notes for a hub session running agents
- Tell each agent its branch name, to commit locally and not push, and to
  **stop its dev server** before it finishes.
- Tell agents to junction the main `node_modules`
  (`cmd /c mklink /J node_modules <main>\node_modules`) instead of
  `npm install`, and follow the CLAUDE.md removal rule for junctions.
- Ask each agent to list the shared functions it touched; trial
  `git merge --no-commit` in a scratch worktree before opening PRs.
- `gh` is installed and logged in on this PC. Playwright is in the session
  scratchpad, not in the project. The Vite build uses base
  `/house_3d_double/`, so screenshot the dev server, not `vite preview`.
