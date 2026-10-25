# Global League / Leaderboard Backend Setup

The Medical Admission Tracker now uses a separate Google Apps Script + Google Sheets backend for global leaderboard entries, RP, League changes, weekly rollover, and friend requests. Firebase Authentication remains the sign-in identity provider. This is a separate backend from the Fallrush game endpoint; do not reuse the Fallrush URL or spreadsheet.

## One-time deployment

1. Open https://script.google.com/ and create a **new standalone project** for Medical Admission Tracker.
2. Copy the complete contents of backend/medical-admission-leaderboard.gs into the Apps Script editor, replacing the starter file.
3. Run setupMedicalLeaderboard once and grant the requested Google Sheets permissions. The function creates a new spreadsheet and the Users, Attempts, and FriendRequests tabs. It stores the spreadsheet ID in Script Properties and logs the spreadsheet URL.
4. In **Project Settings → Script Properties**, add:
   - Property: FIREBASE_API_KEY
   - Value: the Web API key from js/firebase-config.js. This is the public Firebase client API key, not a password or service-account key. The backend uses it to ask Firebase Identity Toolkit to verify Firebase ID tokens.
5. Select **Deploy → New deployment → Web app**. Set **Execute as** to your account and access to **Anyone** so the static GitHub Pages site can call it. Writes that change a user's score/profile or friend relationships are still checked against a Firebase ID token on the server. Keep the Google spreadsheet private; do not share it publicly.
6. Copy the deployed URL ending in /exec.
7. In js/leaderboard-config.js, set window.MED_LEADERBOARD_API_URL to that URL, including quotes. Commit the updated config to the repo and wait for GitHub Pages to deploy.
8. Open the deployed /exec?action=health URL. It should return JSON with success: true and configured: true. Then sign in to the site, finish an eligible Challenge Quiz, and check that the result appears in the Global Leaderboard. Test with a second account/browser to verify shared visibility.

## Defaults implemented

- Leagues: Bronze → Silver → Gold → Diamond.
- Promotion: 100 RP per League. Promotion is immediate and RP overflow carries into the next League.
- Weekly reset: Monday, using Asia/Dhaka time. Weekly points reset; all-time points remain.
- Safe zone: the top 75% of active players stay in their League. If a League has at least four active players, the bottom 25% may demote by one League at rollover and lose up to 100 RP.
- Weekly, All-time, and Friends views are filtered by the selected League.
- Friend requests are persisted in the FriendRequests sheet; only accepted friendships appear in Friends.
- Browser LocalStorage is a cache/offline queue only. It is not the global source of truth.

The League thresholds and safe-zone percentage are constants near the top of the Apps Script file, so they can be adjusted without changing the Firebase Auth flow.

## Important security limitation

The backend verifies that the sender is signed in and checks score totals against the site's scoring formula, and it ignores duplicate attempt IDs. However, the browser currently sends aggregate quiz counts; the server does not independently re-grade every answer against a private answer key. That means this protects against unauthenticated writes and ordinary duplicate submissions, but it is **not full anti-cheat validation**. To make competitive RP tamper-resistant, the next step would be server-side answer verification using a trusted answer key that is not bundled with the public website.

## Existing Firebase data

The client no longer reads or writes leaderboard entries, quiz attempts, or student profile documents in Firestore. Firebase Authentication remains responsible for sign-in and issuing ID tokens. The separate private Google spreadsheet stores public leaderboard fields and student profile metadata; the API returns only public leaderboard fields to leaderboard viewers, and returns mobile/class/blood-group details only to the authenticated owner during profile sync. Existing Firestore documents, if any, are not deleted by this change.
