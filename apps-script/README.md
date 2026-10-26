# Google Apps Script backend

The standalone backend source is in [Medical_Admission_Tracker_Backend.gs](./Medical_Admission_Tracker_Backend.gs).

## What it handles

- Medical student profiles and exam attempts in the two configured Google Sheets.
- Medical XP, current RP, lifetime RP, level, and sequential subrank progression.
- All Time and Weekly leaderboard results, plus Friends queries by explicit user IDs.
- Current study streak, computed from committed exam dates using Asia/Dhaka dates.
- A weekly Safe Zone review. Each Monday, the previous Monday-to-Monday week is checked once. Students below the threshold for the next trophy are demoted by exactly one subrank; Bronze V and Immortal are protected. Demotion resets current RP but does not reduce lifetime TotalRP.
- The existing persistent FIFO leaderboard-activity notification queue and the separate signup notification.

## Deploying an updated backend

Committing this file to GitHub does **not** change the live Apps Script deployment automatically. To activate changes on the website:

1. Open the existing Medical Admission Tracker Apps Script project—the one connected to the currently configured Web App URL. Keep that same project so its Script Properties and spreadsheet permissions remain available.
2. Replace the editor's backend source with the contents of `Medical_Admission_Tracker_Backend.gs`, then save.
3. Check that the Script Properties already used by the project remain configured (including Firebase verification and Telegram notification settings). Do not paste secrets into this repository.
4. Run `setupBackend()` once from the Apps Script editor and approve requested permissions. It verifies the Students and ExamAttempts tabs, adds missing headers without clearing existing records, and ensures the notification and weekly-review triggers exist.
5. Open **Deploy → Manage deployments**, edit the existing Web App deployment, choose **New version**, and deploy it using the same access settings as the current working deployment. Keep the Web App URL configured in `js/leaderboard-config.js` unchanged unless the deployment URL itself has changed.
6. Verify the execution log for the setup result, then test the health endpoint, profile update, exam reward sync, All Time/Weekly/Friends leaderboard responses, and the next scheduled weekly review.

## Weekly Safe Zone behavior

The threshold is computed internally as 30% of the RP required to unlock the next subrank. The public UI does not print the percentage; it shows the Safe Zone boundary and the additional RP required. The weekly review is idempotent for each week and at most one subrank can be lost in one review. It never drops a user directly to Bronze V and it leaves lifetime TotalRP unchanged.

The backend source should be syntax-checked and tested in Apps Script before redeployment. The GitHub commit itself cannot verify a live Apps Script deployment or Firebase Firestore security rules.
