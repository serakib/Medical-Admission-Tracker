# JavaScript Modules

The browser entry point is `app.js`. Feature code is grouped by responsibility so related files stay together. Script loading order is controlled in the root `index.html`; preserve that order when editing its script list.

## Directory map

| Location | Responsibility |
|---|---|
| `app.js` | Main application engine, exams, question loading and results |
| `avatar/` | Avatar presets, SVG renderer, profile editor and generated avatar definition |
| `config/` | Public Firebase settings and Apps Script endpoint configuration |
| `core/` | Navigation and shared browser utilities |
| `features/` | Practice, exams, dashboard, notifications, PWA and student tools |
| `integrations/` | Firebase/Apps Script adapters, profile and leaderboard integration |
| `vendor/` | Generated third-party browser bundles; never hand-edit |

## Key modules

- `config/leaderboard-config.js` — dedicated Apps Script API URL.
- `integrations/global-league-system.js` — server-backed profiles, rewards, ranks and leaderboard sync.
- `integrations/integrated-features.js` — exam review/history, account helpers and Avatar Builder integration.
- `integrations/leaderboard-experience.js` — leaderboard presentation and interactions.
- `features/practice-history.js` — attempted Practice question history.
- `features/pwa.js` and `features/offline-study.js` — install/offline experience.
- `features/system-tools.js` — local diagnostics and progress backup/restore.

## Safe editing rules

- Trace callers and data flow before changing a module.
- Keep script order in `index.html` unchanged unless dependencies are checked.
- Treat XP, RP, rank, rewards and leaderboard values as server-authoritative; inspect the Apps Script adapter before changing them.
- Keep private credentials and tokens out of browser code.
- Generated bundles and avatar definitions are rebuilt by `npm run build`; edit their source/generator instead.
- Run `npm test` before merging.
