# Original FloodGuard interface

This folder contains the original HTML interface, kept intact and served by the Next.js route at `/legacy`.

| Location | Purpose |
| --- | --- |
| `index.html` | Original application markup |
| `assets/styles/` | Base, barangay, and report styles |
| `assets/scripts/config.js` | Thresholds, labels, and constants |
| `assets/scripts/state.js` | Application state and persistence helpers |
| `assets/scripts/ui.js` | Rendering, charts, and interface helpers |
| `assets/scripts/logic.js` | Alerts, water-level processing, and sensor logic |
| `assets/scripts/main.js` | Startup and event binding |
| `assets/scripts/barangay.js` | Barangay-specific workflow |
| `assets/scripts/reports.js` | Report and backup workflow |
| `assets/images/` | FloodGuard and MDRRMO logos |

The loading order of scripts in `index.html` is deliberate: do not change it unless their dependencies change.
