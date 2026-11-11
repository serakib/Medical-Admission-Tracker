# JavaScript Modules

`index.html` loads the app engine and feature modules from this folder. Keep script order in `index.html` unchanged unless dependencies have been checked.

| File | Main responsibility |
|---|---|
| `app.js` | Core app engine, exams, question loading and results |
| `firebase-config.js` | Firebase client configuration |
| `leaderboard-config.js` | Apps Script API endpoint configuration |
| `feature-navigation.js` | In-app navigation |
| `avatar-creator.js`, `avatar-creator-extended.js` | Avatar builder and rendering |
| `avatar-profile-modal.js` | Profile avatar modal |
| `global-league-system.js`, `leaderboard-experience.js` | Rank, RP and leaderboard features |
| `final-exam-type-lifetime.js`, `final-trophy-practice.js` | Exam type, lifetime and trophy/practice logic |
| `practice-history.js` | Practice history |
| `dashboard-rp-streak-shortcuts.js` | Dashboard RP and streak shortcuts |
| `activity-notifications.js` | In-site notifications |
| `promo-code-system.js` | Promo code UI and redemption |
| `student-ai.js` | Student AI feature |
| `account-slideshow.js` | Account/profile slideshow |
| `break-reminder.js`, `animated-loading-dots.js` | Study-break reminder and loading indicators |
| `integrated-features.js` | Shared feature integrations |
| `firebase.js`, `firebase-integration.js` | Legacy compatibility placeholders |

After editing, run the GitHub Actions **Validate static app** workflow. Firebase and Apps Script are deployed separately from GitHub Pages.
