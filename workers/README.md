# Deploy the Medical API proxy Worker

This Worker is an optional bridge between GitHub Pages and the separate Google Apps Script + Google Sheets backend. Use it if the browser blocks direct Apps Script responses because of CORS/redirect behavior.

## Deploy

1. Open Cloudflare Dashboard → Workers & Pages.
2. Create a **new Worker** named something like `medical-admission-api-proxy`.
3. Paste the full contents of `workers/medical-api-proxy-worker.js` into that new Worker.
4. Deploy it. Do **not** replace the existing Student Support / AI Worker.
5. Open the deployed Worker URL with `/?action=health`. A working proxy should return JSON with `success: true` and `status: "ok"`.
6. Copy the Worker URL into `js/leaderboard-config.js` as `window.MED_LEADERBOARD_API_URL`, replacing the direct Apps Script URL. Commit/deploy the updated site.

## Important

- This Worker only forwards requests; Google Apps Script remains the backend and Google Sheets remain the database.
- The allowed browser origin defaults to `https://serakib.github.io`. Add other exact website origins to `ALLOWED_ORIGINS` if you intentionally use them.
- The Telegram Bot token, owner chat ID and Firebase API key stay in Apps Script Script Properties; never put these secrets in this Worker or in frontend JavaScript.
