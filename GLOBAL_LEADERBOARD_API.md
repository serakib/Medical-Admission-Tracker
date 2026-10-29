# Medical Admission Tracker API

## Architecture and source of truth

The website uses Firebase Authentication for registered accounts and a dedicated Google Apps Script + Google Sheets API for Medical profiles, exam attempts, XP/RP/PB, ranks, streaks, friends, leaderboards, and server-side maintenance. The Google Apps Script backend source lives in `apps-script/Medical_Admission_Tracker_Backend.gs`; its Web App URL is set in `js/leaderboard-config.js`.

The Medical API is independent of the site's Get in Touch/contact endpoint. Do not route contact messages through the reward API.

## Deployment and health check

After deploying the newest `Medical_Admission_Tracker_Backend.gs` as a new version of the existing Apps Script Web App, open the same Web App URL with `?action=health` or `?action=capabilities`. The response should contain `success: true`, `status: "ok"`, the `apiVersion`, and a public, non-secret `capabilities` list. This confirms which source version is live; committing to GitHub alone does not update Apps Script.

Keep the existing Apps Script project's Script Properties, spreadsheet IDs, and deployment URL. Do not put Firebase or Telegram secrets in the repository.

## Current API actions

### GET
- `health` / `capabilities`: non-secret service version and feature list.
- `leaderboard` / `getLeaderboard`: read All Time or Weekly rankings. Optional `period`, `ids`, and `includeIds` parameters are supported.

### POST
- `createGuest` / `guestCreate`: create or recover a Guest profile using a random persistent Guest token.
- `registerUser` / `signup` / `login`: validate a Firebase ID token and create or refresh a registered profile. The first registration queues/sends the signup Telegram alert.
- `profile` / `getProfile`: return the authenticated profile.
- `progress` / `getProgress`: return the authenticated profile and committed exam-attempt history.
- `updateProfile` / `saveProfile`: update name, college, batch, or avatar.
- `syncStreak`: merge current/recent device activity into server-side streak fields.
- `submitExam` / `recordExam` / legacy `gameEnd`: record an attempt idempotently and grant server-calculated XP, full RP, and eligible PB.
- `convertPB`: convert available PB to XP (1 PB → 2 XP) or RP (1 PB → 1 RP).
- `searchStudents`: search public student-directory fields for the Friends UI.
- `friendConnections`, `sendFriendRequest`, `acceptFriendRequest`, `rejectFriendRequest`, `cancelFriendRequest`, `removeFriend`: manage friendships in the `StudentFriends` Google Sheet tab. Both registered users and authenticated Guest sessions are supported by the current backend.
- `deleteAccount`: remove registered-account data from Medical Sheets; the client then removes its Firebase profile and Auth account.
- `processPendingActivityNotifications`: intentionally trigger-only; public calls are rejected.
- `setupBackend`: manual Apps Script setup only; public calls are rejected.

## Rewards and rank progression

The backend recalculates the final score from submitted counts as `max(0, correct - 0.25 × wrong)`. RP is the full server-calculated amount `max(0, round(final score × 5))` in every exam mode and at every question count. Practice-mode XP keeps its separate rule.

For exams with at least 30 questions, weighted performance PB is computed on the server from the negative-marking-adjusted final score. Score up to 40% earns no PB; only score portions above 40% earn PB, using progressive multipliers `2× / 4× / 5× / 7× / 10×` across the 40–50%, 50–60%, 60–70%, 70–79%, and 79–100% bands. The weighted sum is rounded directly to PB, without an extra multiplier. Exams under 30 questions receive no weighted PB. PB is kept in a separate wallet for two hours, may be converted sooner, and then automatically converts to RP. XP/RP/PB amounts supplied by the browser are not trusted.

Each attempt ID can be rewarded once. A retry returns the stored reward; an interrupted `PROCESSING` attempt is recovered before a newer attempt is accepted. Rank progression and weekly review are enforced in Apps Script, not localStorage. All Time uses lifetime Total RP; Weekly ranks use RP earned in the current Saturday–Friday week in Asia/Dhaka.

**Scoring limitation:** the API recomputes the score from the received correct/wrong counts, but the browser still supplies those counts. This is not equivalent to securely grading the original answers against a server-held answer key.

## Background jobs and data storage

The two main spreadsheets and tabs are configured in the backend:
- `Students`: profile, XP/RP/PB, rank, guest-token hash, and streak fields.
- `ExamAttempts`: attempts, committed rewards, and the persistent FIFO leaderboard-activity notification queue.
- `StudentFriends`: friend requests and accepted links.

`setupBackend()` ensures the five-minute notification/PB-expiry trigger, hourly Guest cleanup trigger, and Saturday ~01:00 Asia/Dhaka weekly rank-review trigger exist. The weekly review checks the just-completed Saturday–Friday week, applies at most one rank change per student, and does not reduce lifetime Total RP. Activity Telegram notifications have a daily cap of 20 and unsent activity remains queued. Signup alerts are separate from that cap.

## In-site Notifications are separate from Apps Script

The bell/notification center builds activity and trophy notifications in the browser from leaderboard/friend snapshots. Registered, signed-in users can sync notification state to the Firebase Firestore document `studentActivityNotificationStates/{uid}` through `MedActivityNotificationStore`; Guest users use browser-local storage. This collection is not an Apps Script action or a Google Sheet. The matching Firestore security rule is described in `FIRESTORE_FRIENDS_RULES.md`, and must be merged into the existing Firebase rules separately. Do not confuse these in-site notifications with the Apps Script Telegram activity queue.

## Manual deployment checklist

1. Open the existing Medical Admission Tracker Apps Script project.
2. Replace its backend source with `apps-script/Medical_Admission_Tracker_Backend.gs` and save it.
3. Keep its existing Script Properties, private Google Sheets permissions, and deployment identity.
4. Run `setupBackend()` once and verify the execution log.
5. Deploy **Manage deployments → Edit → New version** using the same Web App access settings.
6. Test the deployed `?action=health` and `?action=capabilities` endpoints before checking profile, rewards, PB conversion/expiry, leaderboards, friends, streaks, and scheduled jobs.

Apps Script deployment and Firebase Firestore Security Rules are separate operations; neither is updated by a GitHub commit.
