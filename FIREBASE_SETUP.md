# Firebase and Medical API setup

## 1. Firebase Authentication

Firebase Authentication is used for registered Medical Admission Tracker accounts. Registered API requests include the Firebase ID token; the Medical Apps Script validates it with Firebase before resolving or changing a registered profile.

## 2. Source of truth

The existing `students/{uid}` Firestore document may continue storing private admission/profile information. The Medical Apps Script + Google Sheets API is authoritative for Medical XP, RP, Total RP, PB, levels, ranks, committed exam attempts, streaks, and leaderboard data. The site's Get in Touch form remains separate from the Medical reward API.

## 3. Dedicated Medical Sheets API

`js/leaderboard-config.js` points at the dedicated Apps Script Web App.
- Registered users authenticate using a Firebase ID token verified by the API.
- Guests use a random server-issued Guest token stored locally.
- Profiles, rewards, exam history, PB, streaks, leaderboard data, and Friends records use the private Google Sheets backend.
- Signup and leaderboard Top-10 activity Telegram alerts use the backend's queue and Script Properties.

Keep the `Students`, `ExamAttempts`, and `StudentFriends` data private. Configure `FIREBASE_API_KEY`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_OWNER_CHAT_ID` in Apps Script Project Settings → Script Properties. Never expose a Telegram token in website JavaScript.

## 4. Friends

The current Friends UI calls the Medical Apps Script actions `searchStudents`, `friendConnections`, `sendFriendRequest`, `acceptFriendRequest`, `rejectFriendRequest`, `cancelFriendRequest`, and `removeFriend`. The current backend stores requests and links in the `StudentFriends` tab and supports authenticated Guest and registered users. Older Firestore rules for `studentFriendRequests` and `studentFriendships` are legacy and are not required by this current API path.

## 5. In-site activity notification state

The bell/notification center derives its notification feed from browser-side leaderboard/friend snapshots. For registered, signed-in users, read/unread state, trash, snapshots, and trophy activity may sync into `studentActivityNotificationStates/{uid}` using the app's Firestore adapter. Guest notification state remains in localStorage. This does not use Apps Script and does not send OS/browser push notifications.

Merge the notification-state rule in [FIRESTORE_FRIENDS_RULES.md](FIRESTORE_FRIENDS_RULES.md) into the existing Firestore rules. Do not replace the existing private `students/{uid}` rules wholesale. Firebase Security Rules are deployed separately from Apps Script and GitHub Pages.

## 6. Deployment and verification

After updating the backend source in the existing Apps Script project:
1. Preserve the existing Script Properties and spreadsheet permissions.
2. Run `setupBackend()` once and inspect the execution log.
3. Deploy a new version under **Deploy → Manage deployments → Edit → New version** with the same Web App access settings.
4. Open the existing Web App URL with `?action=health` and `?action=capabilities`; verify that a version and capability list are returned.
5. Test guest creation, registered signup/profile editing, idempotent exam reward sync, PB conversion and expiry, All Time/Weekly/Friends leaderboards, friend requests, streak sync, account deletion, and scheduled jobs.

Apps Script redirects/CORS can depend on deployment settings; confirm requests from the actual website rather than assuming they work because the code exists in GitHub.
