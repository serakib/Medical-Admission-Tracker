# Google Apps Script backend

The standalone backend source is in [Medical_Admission_Tracker_Backend.gs](./Medical_Admission_Tracker_Backend.gs).

## What it handles

- Medical student profiles and exam attempts in the two configured Google Sheets.
- Medical XP, current RP, lifetime RP, level, and sequential subrank progression.
- Exam RP is always the full server-calculated reward (`max(0, round(final score × 5))`) in every exam mode and at every question count. The separate Practice-mode XP rule is unchanged.
- Weighted PB is calculated by the backend only for exams with 30+ questions. It recomputes `finalScore = max(0, correct - 0.25 × wrong)`. Scores up to 40% earn no PB; only score portions above 40% earn PB, with multipliers `2× / 3× / 4× / 5× / 6×` across the 40–50%, 50–60%, 60–70%, 70–79%, and 79–100% bands. The weighted sum is rounded directly to PB, with no extra multiplier. Client-supplied XP, RP, or PB amounts are not used. Client-supplied XP, RP, or PB amounts are not used. PB is stored in a separate wallet and becomes convertible for two hours before automatically converting to RP.
- All Time and Weekly leaderboard results, plus Friends queries by explicit user IDs.
- Friends and friend requests for both registered Firebase accounts and persistent Google Sheets guest sessions. The matching guest token or Firebase ID token is required for each Friends action; the server stores requests centrally in the `StudentFriends` tab.
- Daily visit streaks, counted once per Asia/Dhaka calendar day (00:00–23:59:59), with offline activity history merged idempotently into the Students sheet. Current streak, highest streak, last activity date, and up to 366 activity dates are returned in profile and leaderboard payloads; committed exam dates are only a legacy fallback until a daily streak is saved.
- A daily Weekly Promotion Zone review at about 01:00 Asia/Dhaka. The Saturday check evaluates the completed Saturday–Friday week; Sunday–Friday checks the current week. Weekly RP at 70% or more of the next subrank's promotion cost promotes by one subrank. Weekly review has no Safe Zone or demotion. Promotion sets the new rank's Basic RP, with no extra 30% starting reward.
- The existing persistent FIFO leaderboard-activity notification queue and the separate signup notification.
- Scheduled Guest cleanup: permanently removes server-side Guest profile, exam/activity records, and friend/request records after 90 days without a visit. If weekly demotion resets a Guest's current RP to 0, the Guest is also removed after 7 days without a visit while RP remains 0. Registered accounts are excluded.

## Deploying an updated backend

Committing this file to GitHub does **not** change the live Apps Script deployment automatically. To activate changes on the website:

1. Open the existing Medical Admission Tracker Apps Script project—the one connected to the currently configured Web App URL. Keep that same project so its Script Properties and spreadsheet permissions remain available.
2. Replace the editor's backend source with the contents of `Medical_Admission_Tracker_Backend.gs`, then save.
3. Check that the Script Properties already used by the project remain configured (including Firebase verification and Telegram notification settings). Do not paste secrets into this repository.
4. Run `setupBackend()` once from the Apps Script editor and approve requested permissions. It verifies the Students and ExamAttempts tabs, adds missing headers without clearing existing records, and ensures the notification, daily Weekly Promotion Zone review, and monthly Main Rank Safe Zone review triggers exist.
5. Open **Deploy → Manage deployments**, edit the existing Web App deployment, choose **New version**, and deploy it using the same access settings as the current working deployment. Keep the Web App URL configured in `js/leaderboard-config.js` unchanged unless the deployment URL itself has changed.
6. Guest Friends support specifically requires this new backend version: `matFriendAuthenticate_` must accept validated `guestToken` sessions, and the send-request action must allow any existing guest or registered student as a target. A GitHub commit does not publish Apps Script by itself.
7. Verify the execution log, then open `.../exec?action=health` or `.../exec?action=capabilities`. The response should include `apiVersion: "2026.11.01.2"` and the supported `capabilities` list. Then test profile updates, exam reward sync, duplicate-attempt handling, PB conversion/expiry, All Time/Weekly/Friends leaderboards, friend requests, streak sync, account deletion, the daily activity queue, and the next scheduled weekly review.

## Weekly Safe Zone behavior

Weekly Promotion Zone threshold is 70% of the next subrank's promotion cost. The daily review promotes at most one subrank per check and has no Weekly Safe Zone or demotion. Monthly Safe Zone checks the previous Bangladesh calendar month's RP against 30% of the whole Main Rank requirement and can demote by one Main Rank. Any promotion or demotion sets current RP to the target rank's Basic RP (`matRankMilestoneCap_`); no additional 30% starting RP is awarded. Lifetime TotalRP remains unchanged by rank changes.

Guest cleanup runs hourly. `LastSeenAt` is refreshed by Guest creation/reuse and authenticated API requests; the seven-day zero-RP timer is anchored to the later of the weekly demotion timestamp and the Guest's last visit. The backend source should be syntax-checked and tested in Apps Script before redeployment. The GitHub commit itself cannot verify a live Apps Script deployment or Firebase Firestore security rules.
