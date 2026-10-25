# Firebase setup

## 1) Authentication

Firebase is the sign-in provider for the Medical Admission Tracker. In Firebase Console → Authentication → Sign-in method, enable **Email/Password**. Firebase Authentication handles credentials, persistent sessions, and the user identity used by the app.

## 2) Student profile data

The existing app still uses the `students/{uid}` Firestore document for student profile fields such as name, college, and profile details. Keep the current Firestore rules owner-scoped for writes to a student's own profile. Do not allow public reads of private profile details.

## 3) Global leaderboard / Rank data

Leaderboard, Rank Points, and rank tiers are **not stored in Firestore**. The client sends eligible submitted exam results to the shared API configured in `js/leaderboard-config.js`. It currently points to the existing Fallrush API as requested; that means the Medical app's Rank entries use the same backend and may appear alongside Fallrush Rank entries.

To use a separate Medical Admission Tracker API later, replace the URL in `js/leaderboard-config.js`. No Firebase leaderboard collections are needed for the new flow. Old Firestore leaderboard/quiz-attempt documents from earlier versions are left untouched, but the current client no longer reads or writes them.

## 4) Security boundary

The current Fallrush API has its own session token. When that token is available in the same browser, the adapter sends it. Otherwise, a signed-in Medical user is submitted through the API's guest-player route with a stable Medical-prefixed player ID. Firebase authentication still gates submission in the Medical UI, but **the Fallrush API does not verify Firebase ID tokens**. Therefore, this temporary shared-API setup does not provide full server-side verification that a Rank result came from an authenticated Medical account, and it should not be treated as tamper-proof. A dedicated Medical backend should verify Firebase ID tokens and validate exam submissions server-side before using the ranking for high-stakes decisions.

## 5) Browser cache

LocalStorage stores a cached copy of the shared leaderboard and a pending queue for temporarily failed result submissions. These are convenience caches only; the shared API is the global data source.
