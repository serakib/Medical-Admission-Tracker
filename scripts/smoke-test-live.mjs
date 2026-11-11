import assert from 'node:assert/strict';

const suppliedUrl = process.argv[2];
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
