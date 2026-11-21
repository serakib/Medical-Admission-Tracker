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

const errors = [];
const failedRequests = [];
const badResponses = [];
let proxiedRequests = 0;

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
let context;

try {
  context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    serviceWorkers: 'block'
  });
  const page = await context.newPage();

  page.on('pageerror', error => errors.push('PAGE ERROR: ' + error.stack));
  page.on('requestfailed', request => failedRequests.push(
    request.url() + ' — ' + (request.failure()?.errorText || 'request failed')
  ));
  page.on('console', message => {
    if (message.type() === 'error') errors.push('CONSOLE ERROR: ' + message.text());
  });

  // Intercept the actual Pages origin. Node fetch has network access on the runner,
  // while Chromium may not; keeping the browser on the real origin preserves module
  // script same-origin rules without a localhost navigation/proxy server.
  await page.route('**/*', async route => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const insideSite = requestUrl.origin === baseUrl.origin &&
      (requestUrl.pathname === baseUrl.pathname.slice(0, -1) ||
       requestUrl.pathname.startsWith(baseUrl.pathname));

    // Do not let Firebase, analytics, Apps Script, or other remote APIs stall startup.
    if (!insideSite || !['GET', 'HEAD'].includes(request.method())) {
      await route.abort('blockedbyclient').catch(() => {});
      return;
    }

    proxiedRequests += 1;
    try {
      const upstream = await fetch(requestUrl.href, {
        method: request.method(),
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
        headers: { 'user-agent': 'Medical-Admission-Tracker-Chromium-Smoke-Test' }
      });
      const body = request.method() === 'HEAD' ? null : Buffer.from(await upstream.arrayBuffer());
      const headers = Object.fromEntries(
        [...upstream.headers.entries()].filter(([name]) =>
          !['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(name.toLowerCase())
        )
      );
      if (upstream.status >= 400) badResponses.push(upstream.status + ' ' + requestUrl.href);
      await route.fulfill({ status: upstream.status, headers, body });
    } catch (error) {
      failedRequests.push(requestUrl.href + ' — ' + (error?.message || String(error)));
      await route.abort('failed').catch(() => {});
    }
  });

  console.log('Opening deployed site in Chromium through same-origin request interception: ' + baseUrl.href);
  const response = await page.goto(baseUrl.href, { waitUntil: 'commit', timeout: 30000 });
  assert.ok(response?.ok(), 'Homepage navigation failed: HTTP ' + (response?.status() ?? 'no response'));

  await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(error => {
    errors.push('DOM CONTENT LOADED TIMEOUT: ' + error.message);
  });

  await page.waitForFunction(
    () => Boolean(window.app && typeof window.app.showView === 'function'),
    undefined,
    { timeout: 12000 }
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
  console.log('Same-origin assets proxied: ' + proxiedRequests);
  if (errors.length) console.log('Browser errors:\\n' + errors.join('\\n'));
  if (failedRequests.length) console.log('Failed requests:\\n' + failedRequests.join('\\n'));
  if (badResponses.length) console.log('HTTP error responses:\\n' + badResponses.join('\\n'));

  assert.ok(proxiedRequests > 0, 'No same-origin site requests were intercepted.');
  assert.equal(appState.appExists, true,
    'The main application never created window.app. The splash should fall back and expose a retry notice.');
  assert.equal(appState.loaderVisible, false,
    'The initial splash overlay remained visible after startup or its recovery timeout.');
  assert.ok(appState.bodyText.includes('Dashboard') || appState.bodyText.includes('ড্যাশবোর্ড'),
    'The page did not render dashboard navigation/content.');

  console.log('Chromium browser startup test passed.');
} catch (error) {
  console.error('Chromium browser startup test failed.');
  if (errors.length) console.error('Browser errors:\\n' + errors.join('\\n'));
  if (failedRequests.length) console.error('Failed requests:\\n' + failedRequests.join('\\n'));
  if (badResponses.length) console.error('HTTP error responses:\\n' + badResponses.join('\\n'));
  console.error('Same-origin assets proxied before failure: ' + proxiedRequests);
  throw error;
} finally {
  if (context) await context.close().catch(() => {});
  await browser.close();
}
