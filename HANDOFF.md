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
- **PR #18 `feature/wall-holes`** (real door/window holes): open, not merged.
- **Branch `feature/sun-through-windows`**, stacked on `feature/wall-holes`
  (it needs the holes): sun through windows, **not committed yet**. Changes
  in `src/room-mesh.js` (shadow-only wall twins + ceilings), `src/main.js`
  (`aimSun`, AO exclusion, window-frame shadows, `#r-sun`, `settings.sunAz`,
  stronger day/evening sun), `index.html` (slider), docs. Open its PR against
  `master` after #18 merges (or against `feature/wall-holes` before).
- PRs have no CI checks. Test locally (`npm run dev`, `npm run build`).

## Last session (2026-11-13)
- **Wall holes** (#18): see CLAUDE.md "Wall holes". Checked with a Node
  raycast test and in the app (shared-wall door, add/resize/drag/import/reload).
- **Sun through windows**: see CLAUDE.md "Sun through windows". Clicked
  through: day patch with the mullion's shadow in 3D, Eye level and Top view;
  evening (subtle, lamps dominate); slider saved/restored on reload; AO on;
  no console errors; build passes. Not clicked through: night preset, AO off,
  Plan view, two rooms, phone.
- The owner's order stands: **realistic light + wall holes, then GLB import.**
- GLB model storage, owner's pick still open: (1) models committed to
  `public/models/`, (2) picked from disk into IndexedDB, (3) both
  (recommended). It changes the save format, so ask before building it.

## Next up (suggested order)
1. Merge #18; commit + PR `feature/sun-through-windows` (after the owner's OK).
2. **Openings between rooms** (roadmap 4): a door in a shared wall still has
   a solid leaf. Options: an "open doorway" type (no leaf, hole only) or a
   door leaf drawn ajar. Ask which before building it.
3. Optional before GLB: `items.js` split (TODO.md "Code smells").
4. GLB/glTF import (roadmap 2), after the storage decision.

## Loose ends
- Follow-ups in TODO.md "Sun through windows" and "Wall holes".
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
