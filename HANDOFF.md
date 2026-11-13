# Handoff

Where the last session left off and what to pick up next. Read it after
[CLAUDE.md](CLAUDE.md) (how the code works) and before [TODO.md](TODO.md)
(every open item).

**Rewrite this whole file at the end of each session; don't append.** Keep it
to about a screen. History lives in `git log`, the merged PRs and
[TODO_ARCHIVE.md](TODO_ARCHIVE.md).

_Last updated: 2026-11-13_

## State
- `master` = `d34270f` (PR #17). It deploys itself to GitHub Pages on every
  push (`.github/workflows/deploy.yml`, about 30 s):
  https://ozanserifoglu.github.io/house_3d_double/
- **Branch `feature/wall-holes`: real door/window holes, NOT committed yet**
  (the owner hadn't asked for a commit). Changes in `src/walls.js`
  (`pieceHoles`), `src/room-mesh.js` (`buildWallMeshes`, `wallGeometry`),
  `src/main.js` (`wallGroup`, `buildWalls`, `syncWallHoles`) plus CLAUDE.md,
  TODO.md, TODO_ARCHIVE.md and this file.
- PRs have no CI checks. Test locally (`npm run dev`, `npm run build`).

## Last session (2026-11-13)
- **Wall holes** (roadmap 4): see CLAUDE.md "Wall holes". Checked: build
  passes; a Node raycast test (not kept) went through the window/door holes
  and hit wall below/above/beside them; in the app, a door on a shared wall
  shows inset from the other room, holes follow add, resize, dragging a door
  onto another wall, import and reload. No console errors. Not clicked
  through: undo/redo and R-rotate of an opening, phone.
- The owner's order stands: **realistic light + wall holes, then GLB import.**
- GLB model storage, owner's pick still open: (1) models committed to
  `public/models/`, (2) picked from disk into IndexedDB, (3) both
  (recommended). It changes the save format, so ask before building it.

## Next up (suggested order)
1. Commit `feature/wall-holes`, open the PR, merge (after the owner's OK).
2. **Sun patches through windows** (roadmap 1): walls need `castShadow`
   (currently off) so sunlight only reaches the floor through the holes;
   check the sun direction per preset actually goes through a window, and
   the shadow-camera bias with 12 cm walls. Window `RectAreaLight`s still
   cast no shadows (TODO.md).
3. Optional before GLB: `items.js` split (TODO.md "Code smells").
4. GLB/glTF import (roadmap 2), after the storage decision.

## Loose ends
- Wall-hole follow-ups are listed in TODO.md "Wall holes" (plan overlay
  doesn't show holes, skirting across doors, R-turned openings).
- An empty `.claude/worktrees/` folder remains; git ignores it.

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
