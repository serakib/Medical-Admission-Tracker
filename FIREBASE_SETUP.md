# Firebase and Medical API setup

## 1. Firebase Authentication

Firebase Authentication is used only for registered Medical Admission Tracker accounts. Enable the sign-in method used by the app (Email/Password if that is the current registration flow). Registered API requests include the Firebase ID token; the Medical Apps Script validates the token before resolving a profile.

## 2. Student profile storage

The existing `students/{uid}` Firestore document may continue storing the app's private student profile and admission details. Global leaderboard, rank points, and exam rewards are no longer written to the Firestore `leaderboard` collection by the current client. The separate Medical Google Sheets API is authoritative for leaderboard XP/RP and rank.

## 3. Dedicated Medical Sheets API

`js/leaderboard-config.js` points to a separate Cloudflare Worker proxy. The Worker forwards to the Medical Admission Tracker's own Google Apps Script deployment, which uses the two private spreadsheets supplied by the site owner: one for student profiles/rewards, and one for exam history plus queued leaderboard-activity notifications. It does not call any external game API.

- Registered users: Firebase ID token is verified by the Medical API.
- Guests: a random Guest token is stored locally and resolved by the Medical API.
- Profile editing: name, college, batch, and avatar are stored in the Medical Students sheet.
- Exam rewards: Medical XP/RP are awarded by the API using a unique attempt ID.
- Telegram: first registered account creation sends an alert; leaderboard activity alerts are separately limited to 20 per day with pending messages carried forward.

Keep both spreadsheets private. Store `FIREBASE_API_KEY`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_OWNER_CHAT_ID` in Apps Script Project Settings → Script Properties. Never expose the Telegram token on the website.

## 4. Browser CORS / redirect handling

Deploy `workers/medical-api-proxy-worker.js` as a **separate** Cloudflare Worker named `medical-admission-api-proxy` under the site's existing workers.dev account. The config is prefilled for that Worker name. Do not replace the separate Student Support/AI Worker.
