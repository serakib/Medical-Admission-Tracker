# JavaScript Modules

`index.html` loads the app engine and feature modules from this folder. Keep script order in `index.html` unchanged unless dependencies have been checked.

## File responsibilities

| File | Main responsibility |
|---|---|
| `app.js` | Core app engine, exams, question loading and results |
| `firebase-config.js` | Firebase client configuration |
| `leaderboard-config.js` | Apps Script API endpoint configuration |
| `feature-navigation.js` | In-app navigation and feature-view compatibility |
| `avatar-creator.js` | Compatibility bootstrap for the avatar renderer |
| `avatar-creator-extended.js` | Avatar presets, customization options, SVG URL generation, SVG layers and facial motion |
| `avatar-profile-modal.js` | Profile avatar edit modal and entry point |
| `integrated-features.js` | Exam review/history, account helpers and Avatar Builder UI integration |
| `global-league-system.js` | Firebase/Apps Script adapter for student profiles, rewards, ranks and leaderboard sync |
| `leaderboard-experience.js` | Leaderboard UI, student portraits and leaderboard interactions |
| `final-exam-type-lifetime.js` | Exam-type and lifetime leaderboard behavior |
| `final-trophy-practice.js` | Practice instructions and lifetime trophy progression |
| `practice-history.js` | Persistent history of attempted Practice questions |
| `dashboard-rp-streak-shortcuts.js` | Dashboard RP, streak and shortcut UI |
| `activity-notifications.js` | In-site activity notifications |
| `student-ai.js` | Student Life Support AI interface and conversation behavior |
| `break-reminder.js` | Study break reminder |
| `animated-loading-dots.js` | Animated loading/status dots |
| `firebase.js`, `firebase-integration.js` | Compatibility entry points; check the app engine before changing authentication behavior |

## Avatar Builder: where to start

Read these files in order:

1. `avatar-creator.js` — compatibility bootstrap; it does not contain the main artwork.
2. `avatar-creator-extended.js` — character presets, available parts, configuration normalization and SVG rendering.
3. `integrated-features.js` — builder layout, category navigation, option cards, selected state and live preview.
4. `avatar-profile-modal.js` — how the profile opens the editor.

The selected character card and the live preview must always use the same normalized configuration. Do not keep a stale/duplicate preview layer after a character change.

## Safe editing notes

- Trace the caller and data flow before changing a module.
- Check `index.html` script order before adding or moving script tags.
- Profile, XP, RP, rank and leaderboard values may be server-authoritative; inspect the backend adapter before changing their calculation.
- Never add passwords, private keys, tokens or other secrets to client-side files.
- Compatibility files may intentionally contain very little code. Do not duplicate the main implementation there.
- After a change, test the affected feature, a fresh page load and the mobile layout.
