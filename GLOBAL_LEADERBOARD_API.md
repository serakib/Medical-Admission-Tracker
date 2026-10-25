# Global Rank API (temporary Fallrush integration)

The global Rank UI is integrated into the Medical Admission Tracker. Its API URL is set in one place: `js/leaderboard-config.js`.

## Current configuration

That file points to the existing Fallrush Apps Script endpoint, per the requested temporary setup. Both sites can therefore share the same Rank API records. The Medical site does **not** create a separate leaderboard database while this URL remains configured.

When a dedicated Medical Admission Tracker API is ready, change only `window.MED_LEADERBOARD_API_URL` in `js/leaderboard-config.js`, keeping the compatible API actions below or updating the adapter at `js/global-league-system.js`.

## API actions used

- `leaderboard` with `mode: 'Rank'` for the shared global ranking.
- `gameEnd` with `mode: 'Rank'` to submit an eligible completed Medical exam result.
- `profile` to read a profile when a Fallrush session token exists in the same browser.
- `friends`, `friendRequests`, `friendInvite`, `friendRespond`, and `publicProfile` for the shared API's friend/profile features.

The adapter keeps a local leaderboard cache and a queue for failed score submissions; successful API results remain the shared source of truth.

## Exam result rewards

Every submitted exam mode sends an exam-result reward request: Challenge, Previous Year, Model Test, Random Test, Previous Exam, and selected-question exams. The result screen shows the XP and RP deltas returned by the shared API, together with the updated Rank when the API returns it. If the API omits a delta or returns zero, the adapter follows Fallrush's existing client-side fallback calculation and labels that clearly in the result panel. That fallback display is not independent proof that the API stored the same delta. If the request is temporarily unavailable, the result panel says the reward is pending and the same attempt is queued for retry; it does not pretend that an unconfirmed result was saved.

Fallrush Rank scoring expects a 300-point threshold, while Medical exam marks use a different scale. For the Rank API request only, the adapter normalizes each exam into a Rank score from 300 to 600 based on the proportion of questions answered correctly. The actual Medical exam score/marks and quiz points are not changed in the exam result or saved exam history. Consecutive correct answers are passed as the exam's combo value. This normalization is what lets even short exam modes receive an XP/RP reward under the existing Fallrush Rank rules.

## Rank UI

The rank strip mirrors Fallrush's current Match Rank tiers: Bronze I/II/III, Silver I/II/III, Gold I/II/III, Platinum I/II/III, Diamond I/II/III, Master, Grandmaster, and Legend. The progress bar uses the API's 300 RP promotion target.

## Authentication and data integrity limitation

Firebase Authentication remains the Medical Admission Tracker's sign-in provider, and Firebase is not used to store leaderboard points. If the same browser already has a Fallrush API session token, the adapter sends it. Otherwise, a Firebase-signed-in Medical user is submitted through the shared API's guest route using a stable Medical-prefixed player ID.

The Fallrush API does not verify Firebase ID tokens. Therefore, Firebase sign-in gates result submission in the Medical UI, but the shared endpoint cannot independently prove that a submitted score belongs to a particular Firebase account. Do not use this temporary setup for high-stakes or tamper-resistant ranking. When switching to a dedicated Medical API, verify Firebase ID tokens server-side, prevent duplicate submissions, and grade attempts server-side before awarding RP.
