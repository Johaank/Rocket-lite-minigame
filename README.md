# Mini Print Farm Tycoon

Mini Print Farm Tycoon is a browser-based tycoon prototype where you grow a tiny 3D printing business from a dorm room into a warehouse-scale operation.

## How to run locally
1. Download or clone this project.
2. Open `index.html` directly in your browser.
3. Play immediately (no build tools required).

## File structure
- `index.html` – game layout, panels, modal, and UI containers.
- `style.css` – indie-style diorama visuals, responsive layout, animations, and card styling.
- `script.js` – all game systems (state, printers, jobs, locations, upgrades, rendering, autosave).
- `README.md` – project documentation.

## Gameplay summary
- Start in **Dorm Room** with starter cash and no printers.
- Buy printers from five models: **P1S**, **X1C**, **P2S**, **H2D**, **H2C**.
- Accept generated jobs with real constraints: difficulty, size, complexity, deadline, payout.
- Assign jobs to individual printers; each printer can run one job at a time.
- Handle random print failures and choose to restart or forfeit.
- Build reputation through successful on-time deliveries.
- Unlock and move to larger locations:
  - Dorm Room
  - Office (requires 5 printers)
  - Warehouse (requires 10 printers)
- Buy business upgrades and printer upgrades for better throughput and reliability.
- Progress is autosaved to `localStorage`.
- You can reset the game at any time with the Reset button.

## Future feature ideas
- Consumables (filament inventory, material costs by type).
- Staff hiring and shift scheduling.
- Power grid / machine heat management.
- Client relationships and recurring contracts.
- Visual printer placement and drag-and-drop floor editor.
- More location tiers and city map progression.
