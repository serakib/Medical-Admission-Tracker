/* Medical Admission Tracker — independent Sheets API proxy.
 * Deploy workers/medical-api-proxy-worker.js as a NEW Cloudflare Worker named
 * "medical-admission-api-proxy" under the site's existing workers.dev account.
 * The Worker forwards to the dedicated Medical Google Apps Script + Sheets backend.
 * Do not replace the separate Student Support / AI Worker.
 */
window.MED_LEADERBOARD_API_URL = 'https://medical-admission-api-proxy.asrafuldcg.workers.dev';
