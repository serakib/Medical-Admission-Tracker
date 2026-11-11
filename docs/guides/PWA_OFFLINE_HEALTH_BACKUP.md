# PWA, offline practice and local progress backup

## Install the app

The site publishes `manifest.webmanifest` and registers `service-worker.js` on HTTPS. Supported browsers may offer an Install App prompt. If the prompt is not shown, use the browser's own Install or Add to Home Screen menu where available.

## Offline behavior

The service worker caches the app shell, offline page, public question bank and metadata. If a page navigation cannot reach the network, it falls back to `offline.html`.

Offline Practice is a deliberately separate, local-only MCQ mode. It can load the question bank only after the browser has cached it during an online visit. It stores its own session summaries in localStorage. It does not sign in, submit server rewards, sync Firestore, update Google Sheets or refresh leaderboards while offline.

Authentication, Firebase, Apps Script, account management, friends and leaderboard requests are never cached by the service worker. POST requests are never intercepted.

## Live System Health

Open Account Settings and select **Run Health Check**. It checks:
- Whether the public question bank is loaded.
- Whether Firebase Auth has resolved its current state.
- For a signed-in account only, a read of that account's own `students/{uid}` Firestore profile document.
- The read-only Apps Script `action=health` endpoint.
- Current browser network connectivity.

The Firestore test is skipped when signed out. A browser check cannot validate every Firebase security rule, every user document, or every backend write path.

The scheduled GitHub monitor checks the deployed website, PWA resources, question bank metadata and Apps Script health/version/capabilities. A backend version mismatch intentionally fails the monitor so a repository commit is not mistaken for an Apps Script deployment.

## Local progress backup

Open Account Settings → Data Backup & Export.

The JSON backup contains local exam history, seen/answered/practiced question IDs and offline practice summaries. Restore requires the same local account identity and merges records rather than replacing the existing history.

The export deliberately excludes passwords, Firebase credentials, guest tokens, profile information, leaderboard caches and server-side XP/RP. It is not a backup of Google Sheets or Firestore data. Keep the downloaded file private because it may contain question review history.

## Browser error diagnostics

Recent client-side JavaScript errors are stored locally on the current device (up to 30 entries). Use **Download Error Log** to inspect them or **Clear Local Error Log** to erase them. No remote error-tracking service or user tracking endpoint is configured.

## CI and security checks

Pull requests and main-branch pushes run the project validation, including PWA resource checks, CSS/bundle size budgets, syntax/integrity checks and npm audit. The security workflow runs CodeQL and reviews dependency changes on pull requests. Dependabot continues to propose compatible dependency updates.
