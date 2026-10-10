# Medical Admission Tester

Polished static medical admission preparation app.

## Included
- Natural Bengali UI with standard English medical/technical terms where appropriate
- several number of question bank preserved
- Unique-question tracking for Practice/Exam sessions
- Profile-based progress and performance dashboard
- Polished leaderboard with top-3 podium and current-user highlight
- Question Bank, Practice, Model Test, Previous Year and Syllabus flows
- Firebase Authentication/Firestore remains optional; Guest mode works without configuration

## Firebase
`js/firebase-config.js` is intentionally a safe placeholder because the original Firebase configuration was not included in the supplied project files. Add the existing web config there if you want login/Firestore leaderboard features.

## Run
Serve the folder from a web server (for example GitHub Pages or VS Code Live Server).


## Leaderboard / Profile update
- Profile is available from the desktop nav, mobile menu, and Home shortcut card.
- Leaderboard starts with 8 local demo students so the page is not empty on a fresh device.
- Leaderboard data is stored in LocalStorage for instant display/offline continuity.
- Logged-in user results update LocalStorage immediately and sync to Firestore in the background.
- Failed Firebase writes are queued locally and retried on the next leaderboard refresh when Firebase is available.
- Demo rows are local-only and are never written to Firestore.
- Real Firebase sync requires the existing project web config in `js/firebase-config.js`; credentials were not present in the supplied source, so no credentials were invented.
