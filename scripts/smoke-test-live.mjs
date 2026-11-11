import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const suppliedUrl = process.argv[2];
const siteOnly = process.argv.includes('--site-only');
if (!suppliedUrl) {
  console.error('Usage: node scripts/smoke-test-live.mjs <deployed-url>');
  process.exit(2);
}

const baseUrl = new URL(suppliedUrl);
if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
  throw new Error('The deployed site URL must use HTTP or HTTPS.');
}
// GitHub Pages may return an HTTP page_url; always test the secure canonical origin.
baseUrl.protocol = 'https:';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const timeoutMs = 15000;
const attempts = 12;

async function requestWithRetry(url) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': 'Medical-Admission-Tracker-Live-Smoke-Test' }
      });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(5000);
      continue;
    }

    if (response.ok) return response;
    lastError = new Error(`HTTP ${response.status} for ${url}`);
    if (response.status < 500 && response.status !== 429) break;
    if (attempt < attempts) await sleep(5000);
  }
  throw lastError || new Error(`Could not reach ${url}`);
}

console.log(`Checking live website: ${baseUrl.href}`);
const homeResponse = await requestWithRetry(baseUrl);
const html = await homeResponse.text();

assert.match(html, /<html[^>]+lang=["']bn["']/i, 'The live page should declare Bangla as its language.');
assert.match(html, /<title>[^<]+<\/title>/i, 'The live page should have a title.');
assert.match(html, /id=["']view-home["']/i, 'The main home view should exist.');
assert.match(html, /id=["']dash-total-questions["']/i, 'The question-count dashboard element should exist.');

// Validate the live question bank and its dashboard metadata, not only asset URLs.
async function fetchJson(relativePath) {
  const response = await requestWithRetry(new URL(relativePath, baseUrl));
  const contentType = response.headers.get('content-type') || '';
  assert.match(contentType, /json/i, `${relativePath} should be served as JSON.`);
  return response.json();
}

const [questions, metadata] = await Promise.all([
  fetchJson('data/questions.json'),
  fetchJson('data/question-bank-info.json')
]);

assert.ok(Array.isArray(questions) && questions.length > 0, 'Live question bank must be a non-empty array.');
assert.ok(metadata && typeof metadata === 'object', 'Live question-bank metadata must be an object.');

const questionIds = new Set();
const subjectCounts = {};
let practiceTagged = 0;
let yearTagged = 0;
let untaggedYear = 0;

for (const [index, question] of questions.entries()) {
  const label = question?.id || `row ${index + 1}`;
  assert.ok(question && typeof question === 'object', `Invalid question record: ${label}.`);
  assert.ok(typeof question.id === 'string' && question.id.trim(), `Question ID missing: ${label}.`);
  assert.ok(!questionIds.has(question.id), `Duplicate question ID: ${label}.`);
  questionIds.add(question.id);
  assert.ok(typeof question.question === 'string' && question.question.trim(), `Question text missing: ${label}.`);
  assert.ok(typeof question.subject === 'string' && question.subject.trim(), `Question subject missing: ${label}.`);
  subjectCounts[question.subject] = (subjectCounts[question.subject] || 0) + 1;
  assert.ok(question.options && ['A', 'B', 'C', 'D'].every(key =>
    typeof question.options[key] === 'string' && question.options[key].trim()
  ), `Four valid answer options required: ${label}.`);
  assert.match(String(question.correctAnswer || ''), /^[ABCD]$/i, `Invalid answer key: ${label}.`);
  assert.ok(['easy', 'medium', 'hard'].includes(String(question.difficulty || '').toLowerCase()),
    `Invalid difficulty: ${label}.`);

  if (String(question.year || '').toLowerCase() === 'practice') practiceTagged++;
  else if (question.year) yearTagged++;
  else untaggedYear++;
}

const sortedCounts = counts => Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
assert.equal(metadata.totalQuestions, questions.length, 'Live question total does not match metadata.');
assert.deepEqual(sortedCounts(metadata.subjects || {}), sortedCounts(subjectCounts),
  'Live subject counts do not match question-bank metadata.');
assert.equal(metadata.practiceTaggedQuestions, practiceTagged, 'Practice-tagged count does not match metadata.');
assert.equal(metadata.yearTaggedQuestions, yearTagged, 'Year-tagged count does not match metadata.');
assert.equal(metadata.untaggedYearQuestions, untaggedYear, 'Untagged-year count does not match metadata.');

const displayedCount = html.match(/id=["']dash-total-questions["'][^>]*>([^<]*)</i);
assert.ok(displayedCount && displayedCount[1].trim() === `${questions.length}+`,
  'Live dashboard question count does not match the published question bank.');

console.log(`OK live question bank: ${questions.length} questions across ${Object.keys(subjectCounts).length} subjects.`);

// Check the read-only backend health endpoint so stale Apps Script deployments are visible.
if (!siteOnly) {
  const backendSource = await readFile(new URL('../apps-script/Medical_Admission_Tracker_Backend.gs', import.meta.url), 'utf8');
  const sourceVersion = backendSource.match(/const MAT_API_VERSION\s*=\s*['"]([^'"]+)['"]/);
  const sourceCapabilitiesBlock = backendSource.match(/const MAT_API_CAPABILITIES\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\);/);
  assert.ok(sourceVersion, 'Backend source API version is missing.');
  assert.ok(sourceCapabilitiesBlock, 'Backend source capability list is missing.');
  const expectedCapabilities = [...sourceCapabilitiesBlock[1].matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]);

  const leaderboardConfigResponse = await requestWithRetry(new URL('js/leaderboard-config.js', baseUrl));
  const leaderboardConfigSource = await leaderboardConfigResponse.text();
  const apiUrlMatch = leaderboardConfigSource.match(/MED_LEADERBOARD_API_URL\s*=\s*['"]([^'"]+)['"]/);
  assert.ok(apiUrlMatch, 'Live leaderboard API URL is missing from its configuration.');

  const apiUrl = new URL(apiUrlMatch[1]);
  assert.equal(apiUrl.protocol, 'https:', 'Leaderboard API must use HTTPS.');
  assert.equal(apiUrl.hostname, 'script.google.com', 'Leaderboard API must use the expected Google Apps Script host.');
  apiUrl.searchParams.set('action', 'health');

  const backendResponse = await requestWithRetry(apiUrl);
  const backendHealth = await backendResponse.json();
  console.log('Backend health payload:', JSON.stringify(backendHealth));
  assert.equal(backendHealth.success, true, 'Medical backend health endpoint did not report success.');
  assert.equal(backendHealth.status, 'ok', 'Medical backend is not healthy.');
  assert.equal(backendHealth.service, 'Medical Admission Tracker API', 'Unexpected backend service response.');
  assert.equal(backendHealth.apiVersion, sourceVersion[1],
    'Live backend version ' + (backendHealth.apiVersion || 'unknown') + ' does not match repository source ' + sourceVersion[1] + '. Redeploy the existing Apps Script Web App.');

  const backendCapabilities = new Set(Array.isArray(backendHealth.capabilities) ? backendHealth.capabilities : []);
  const missingCapabilities = expectedCapabilities.filter(capability => !backendCapabilities.has(capability));
  assert.deepEqual(missingCapabilities, [],
    'Live backend is missing repository capabilities: ' + missingCapabilities.join(', ') + '. Redeploy the existing Apps Script Web App.');
  console.log('OK backend health: API ' + backendHealth.apiVersion + ', all ' + expectedCapabilities.length + ' source capabilities are deployed.');
} else {
  console.log('Backend health check skipped for site-only deployment verification.');
}

const references = new Set();
for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
  const raw = match[1].trim();
  if (!raw || raw.startsWith('#') || raw.startsWith('//') ||
      /^(?:data:|blob:|javascript:|mailto:|tel:)/i.test(raw) ||
      /^[a-z][a-z\d+.-]*:/i.test(raw)) continue;
  const target = new URL(raw, baseUrl);
  if (target.origin !== baseUrl.origin) continue;
  target.hash = '';
  references.add(target.href);
}

const failures = [];
for (const url of references) {
  try {
    const response = await requestWithRetry(url);
    console.log(`OK ${response.status} ${new URL(url).pathname}`);
    await response.body?.cancel();
  } catch (error) {
    failures.push(error.message);
    console.error(`FAIL ${error.message}`);
  }
}

assert.equal(failures.length, 0, `Live asset checks failed:\\n${failures.join('\\n')}`);
console.log(`Live smoke test passed: homepage + ${references.size} local HTML references checked.`);
