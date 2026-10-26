# Medical Admission Tracker API

## Independent backend

Medical Admission Tracker uses Firebase Authentication for registered users and its own Google Apps Script + Google Sheets API for profiles, exam results, Medical XP/RP, rank progression, and leaderboard data. It uses no external game account session or shared game-reward balance.

The API endpoint is configured in `js/leaderboard-config.js`. Current Google Apps Script endpoint is the dedicated Medical deployment provided by the site owner.

## API actions used by the website

- `createGuest`: create or recover a Guest profile using a persistent Guest token.
- `registerUser`: verify a Firebase ID token, create a Medical profile once, and send a first-registration Telegram notification.
- `updateProfile`: update name, college, batch, and avatar.
- `leaderboard`: read All Time or Weekly Medical rankings.
- `submitExam`: save an exam attempt and let the Medical backend award XP/RP exactly once per attempt ID.

## Identity and profile

Registered users authenticate with Firebase. The frontend sends the user's Firebase ID token to the Medical API; the Apps Script checks it with Firebase before reading or changing the registered profile. Guest users receive a random persistent token and a default name such as `Guest Student 4821`; Guest profiles can also update their name, college, batch, and avatar. The Guest token is not a Firebase account and is scoped to that browser unless the user registers and transfers progress in a future feature.

Profile fields are stored in the private `Students` spreadsheet. Do not make the spreadsheet public.

## Rewards, rank, and leaderboard

The Medical API is the source of truth for Medical XP, current RP, Total RP, level, and rank. The UI does not award a second browser-only XP/RP balance. Each completed exam uses an account-prefixed unique attempt ID; repeated submissions are intended to return the previously saved reward rather than award it twice.

Rank progression is configured server-side as Bronze V → IV → III → II → I, then Silver V through I, Gold, Platinum, Diamond, Master, Grandmaster, and Immortal. The top leaderboard uses Total RP. Weekly leaderboard values are calculated from RP awarded during the current week, based on the Bangladesh time-zone policy in Apps Script.

The backend currently receives the correct/wrong counts from the frontend. For tamper-resistant competitive scoring, move answer-key grading to a trusted server before relying on rank as a high-stakes result.

## Telegram alerts

The backend sends a Telegram notification when a registered user is first created in the Medical Students sheet. Repeated login/profile reads do not send a new signup alert after the `SignupTelegramSent` status is `SENT`.

Top-10 leaderboard movement notifications are queued with their original timestamps. The backend sends at most 20 activity notifications per day and keeps leftovers in a persistent FIFO queue for later days. Signup alerts are outside that daily activity cap.

Bot token and owner Chat ID belong in Apps Script Script Properties only; never put them in client-side JavaScript or public repository code.

## Apps Script CORS/redirect note

Apps Script Web Apps can redirect `ContentService` responses. If browser requests from GitHub Pages show a CORS or redirect error, deploy the separate proxy Worker in `workers/medical-api-proxy-worker.js`, then set `window.MED_LEADERBOARD_API_URL` to the deployed Worker URL in `js/leaderboard-config.js`. Deploy it as a new Worker; do not replace the unrelated Student Support/AI Worker. The Worker forwards only the documented Medical API actions to the dedicated Google Apps Script backend.

## Tests before launch

Test Guest creation and profile editing; registered Firebase signup and one-time Telegram alert; repeated login without repeated signup alerts; duplicate exam submission; XP/RP synchronization; rank promotions; All Time and Weekly leaderboard; the 20-per-day activity cap with pending carry-forward; and the API health endpoint.
