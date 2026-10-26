# Firebase and Medical API setup

## 1. Firebase Authentication

Firebase Authentication is used only for registered Medical Admission Tracker accounts. Enable the sign-in method used by the app (Email/Password if that is the current registration flow). Registered API requests include the Firebase ID token; the Medical Apps Script validates the token before resolving a profile.

## 2. Student profile storage

The existing `students/{uid}` Firestore document may continue storing the app's private student profile and admission details. Global leaderboard, rank points, and exam rewards are no longer written to the Firestore `leaderboard` collection by the current client. The separate Medical Google Sheets API is authoritative for leaderboard XP/RP and rank.

## 3. Dedicated Medical Sheets API

`js/leaderboard-config.js` points directly to the Medical Admission Tracker's own Google Apps Script deployment, which uses the two private spreadsheets supplied by the site owner: one for student profiles/rewards, and one for exam history plus queued leaderboard-activity notifications. This does not call any external game API.

- Registered users: Firebase ID token is verified by the Medical API.
- Guests: a random Guest token is stored locally and resolved by the Medical API.
- Profile editing: name, college, batch, and avatar are stored in the Medical Students sheet.
- Exam rewards: Medical XP/RP are awarded by the API using a unique attempt ID.
- Telegram: first registered account creation sends an alert; leaderboard activity alerts are separately limited to 20 per day with pending messages carried forward.

Keep both spreadsheets private. Store `FIREBASE_API_KEY`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_OWNER_CHAT_ID` in Apps Script Project Settings → Script Properties. Never expose the Telegram token on the website.

## 4. Direct Apps Script calls and Get in Touch

The Medical frontend calls the dedicated Apps Script API directly. Verify that the deployed Web App is accessible to intended users and returns responses the browser can read. Apps Script redirects/CORS can vary by deployment; do not describe live API sync as tested until it has been tested from the site. The site's Get in Touch form is a separate portfolio-message feature; keep its existing portfolio Telegram endpoint and reply flow unchanged. Do not route contact messages through the Medical rewards API.