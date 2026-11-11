import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const suppliedUrl = process.argv[2];
if (!suppliedUrl) {
  console.error('Usage: node scripts/smoke-test-browser.mjs <deployed-url>');
  process.exit(2);
}

const baseUrl = new URL(suppliedUrl);
baseUrl.protocol = 'https:';
if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const errors = [];
const failedRequests = [];
const badResponses = [];

try {
  // Route browser traffic through Node's fetch. The live-site smoke test already
  // verifies Node network access; this avoids Chromium proxy/network restrictions
  // while still executing the exact deployed HTML, JS bundles, CSS and JSON.
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    serviceWorkers: 'block'
  });
  const page = await context.newPage();
  const localOrigin = 'http://127.0.0.1:8765';

  page.on('pageerror', error => errors.push('PAGE ERROR: ' + error.stack));
  page.on('console', message => {
    if (message.type() === 'error') errors.push('CONSOLE ERROR: ' + message.text());
  });

  await page.route('**/*', async route => {
    const requestUrl = new URL(route.request().url());
    let targetUrl = requestUrl.href;

    if (requestUrl.origin === localOrigin) {
      const relativePath = requestUrl.pathname.split('/').filter(Boolean).join('/');
      targetUrl = relativePath
        ? new URL(relativePath + requestUrl.search, baseUrl).href
        : baseUrl.href;
    }

    try {
      const upstream = await fetch(targetUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
        headers: { 'user-agent': 'Medical-Admission-Tracker-Chromium-Smoke-Test' }
      });
      const body = Buffer.from(await upstream.arrayBuffer());
      const headers = Object.fromEntries(
        [...upstream.headers.entries()].filter(([name]) =>
          !['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(name.toLowerCase())
        )
      );
      if (upstream.status >= 400) badResponses.push(upstream.status + ' ' + targetUrl);
      await route.fulfill({ status: upstream.status, headers, body });
    } catch (error) {
      failedRequests.push(targetUrl + ' — ' + (error?.message || String(error)));
      await route.abort('failed').catch(() => {});
    }
  });

  console.log('Opening deployed files in Chromium via verified Node proxy: ' + baseUrl.href);
  const response = await page.goto(localOrigin + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  assert.ok(response?.ok(), 'Homepage navigation failed: HTTP ' + (response?.status() ?? 'no response'));

  await page.waitForFunction(
    () => Boolean(window.app && typeof window.app.showView === 'function'),
    undefined,
    { timeout: 20000 }
  ).catch(() => {});

  const appState = await page.evaluate(() => ({
    appExists: Boolean(window.app),
    appType: typeof window.app,
    readyState: document.readyState,
    questionBankLoaded: Boolean(window.app?.questionsLoaded),
    questionCount: Array.isArray(window.app?.questionBank) ? window.app.questionBank.length : null,
    loaderExists: Boolean(document.getElementById('mat-initial-entry-loader')),
    loaderVisible: (() => {
      const el = document.getElementById('mat-initial-entry-loader');
      return Boolean(el && getComputedStyle(el).display !== 'none' &&
        getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0);
    })(),
    title: document.title,
    bodyText: (document.body?.innerText || '').slice(0, 1200)
  }));

  console.log('Browser app state: ' + JSON.stringify(appState, null, 2));
  if (errors.length) console.log('Browser errors:\\n' + errors.join('\\n'));
  if (failedRequests.length) console.log('Failed requests:\\n' + failedRequests.join('\\n'));
  if (badResponses.length) console.log('HTTP error responses:\\n' + badResponses.join('\\n'));

  assert.equal(appState.appExists, true,
    'The main application never created window.app. The splash remains because startup did not complete.');
  assert.equal(appState.loaderVisible, false,
    'The main application exists, but the initial splash overlay is still visible.');
  assert.ok(appState.bodyText.includes('Dashboard') || appState.bodyText.includes('ড্যাশবোর্ড'),
    'The page did not render dashboard navigation/content.');

  console.log('Chromium browser startup test passed.');
} catch (error) {
  console.error('Chromium browser startup test failed.');
  if (errors.length) console.error('Browser errors:\\n' + errors.join('\\n'));
  if (failedRequests.length) console.error('Failed requests:\\n' + failedRequests.join('\\n'));
  if (badResponses.length) console.error('HTTP error responses:\\n' + badResponses.join('\\n'));
  throw error;
} finally {
  await browser.close();
}
