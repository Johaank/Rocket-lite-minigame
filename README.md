# Mini Print Farm Tycoon

A polished browser-based 3D printing tycoon prototype built with HTML, CSS, and vanilla JavaScript.

## Overview
You begin in a cramped **Dorm Room** and grow a tiny print shop into an **Office** and then a **Warehouse**. The current version focuses on:

- Industrial black/white/silver/red UI style
- Distinct printer models with specialized strengths
- Balanced early progression (starter P1S can clear early jobs)
- Separated job pipeline:
  - Available Jobs
  - Accepted Jobs
  - Active Jobs
  - Completed/Failed History
- Clickable workshop printers with a live detail panel
- Deadlines, failures, restarts, reputation impacts, and business upgrades
- Autosave/load with localStorage and manual reset

## Run locally
1. Clone/download the repo.
2. Open `index.html` in any modern browser.
3. No build step or dependencies required.

## Project structure
- `index.html` – game layout, topbar, tabs, workshop scene, printer detail drawer, tutorial modal.
- `style.css` – industrial visual theme, panel/card styles, workshop diorama visuals, animations.
- `script.js` – game logic, state, balancing, rendering, printer interactions, autosave.
- `README.md` – setup and gameplay guide.

## Gameplay flow
1. Buy your first **P1S**.
2. Accept beginner jobs from **Available Jobs**.
3. Assign those jobs from **Accepted Jobs** to idle compatible printers.
4. Monitor **Active Jobs** and react to failures/deadline pressure.
5. Review outcomes in **Completed/Failed** history.
6. Expand printer fleet, buy upgrades, and unlock larger locations.

## Notes on balancing
- Early-game jobs are intentionally weighted toward Tier 1 simple work.
- Rejecting jobs is lightly penalized early so players can avoid impossible contracts.
- Failure and forfeit penalties matter but are tuned to stay recoverable.
- Better machines and upgrades improve access to higher-value contracts.

## Future ideas
- Filament/material inventory and costs
- Staff and shift scheduling
- Repeat clients with long-term contracts
- Dynamic power/heat efficiency layer
- Audio and richer FX polish
