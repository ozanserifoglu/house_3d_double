# Handoff

Where the last session left off and what to pick up next. Read it after
[CLAUDE.md](CLAUDE.md) (how the code works) and before [TODO.md](TODO.md)
(every open item).

**Rewrite this whole file at the end of each session; don't append.** Keep it
to about a screen. History lives in `git log`, the merged PRs and
[TODO_ARCHIVE.md](TODO_ARCHIVE.md).

_Last updated: 2026-11-13_

## State
- `master` = `857c418` (PR #20). It deploys itself to GitHub Pages on every
  push (`.github/workflows/deploy.yml`, about 30 s):
  https://ozanserifoglu.github.io/house_3d_double/
- Branch `feature/door-open` (off `master`): doors open/close. **Not
  committed yet** (waiting for the owner's go-ahead); no PR.
- PRs have no CI checks. Test locally (`npm run dev`, `npm run build`).

## Last session (2026-11-13)
- **Doors open and close** (roadmap 4, "openings between rooms"): see
  CLAUDE.md "Doors". Owner's picks: panel controls + double-click in 3D;
  swing area drawn in Plan, furniture in it flagged; instant (no animation).
  Clicked through: Open/Close button, double-click toggle + undo, hinge
  left/right, swings in/out (3D + Plan), 180° swing flags the sofa (orange
  outline + door warning + orange wedge), autosave/reload keeps the state,
  an old save without door fields loads closed, undo of an import. Build passes,
  no console errors. Not clicked through: a door in a shared wall (Eye level
  looking into the next room), sun through an open door, evening/night, phone.
- GLB model storage, owner's pick still open: (1) models committed to
  `public/models/`, (2) picked from disk into IndexedDB, (3) both
  (recommended). It changes the save format, so ask before building it.

## Next up (suggested order)
1. Commit + PR `feature/door-open` once the owner has looked at it.
2. Optional before GLB: `items.js` split (TODO.md "Code smells").
3. GLB/glTF import (roadmap 2), after the storage decision.

## Loose ends
- Follow-ups in TODO.md "Doors (open/close)", "Sun through windows" and
  "Wall holes".
- Turning a door with R still pushes it off the wall (TODO.md Bugs); with
  doors now opening, that will come up more often.
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
