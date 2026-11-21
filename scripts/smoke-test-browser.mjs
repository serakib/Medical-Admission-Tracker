import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const suppliedUrl = process.argv[2];
if (!suppliedUrl) {
  console.error('Usage: node scripts/smoke-test-browser.mjs <deployed-url>');
  process.exit(2);
}

const baseUrl = new URL(suppliedUrl);
if (!['http:', 'https:'].includes(baseUrl.protocol)) {
  throw new Error('The deployed URL must use HTTP or HTTPS.');
}
baseUrl.protocol = 'https:';
if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/';

const errors = [];
const failedRequests = [];
const badResponses = [];
const slowRequests = [];
let proxiedRequests = 0;
let browser;
let context;
let serverStarted = false;

function withTimeout(promise, milliseconds, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + ' exceeded ' + milliseconds + 'ms')), milliseconds);
    })
  ]).finally(() => clearTimeout(timer));
}

// Chromium on GitHub-hosted runners may not have direct network access.
// A local HTTP proxy lets Chromium execute the real deployed HTML and JS while
// Node's fetch retrieves the files from GitHub Pages.
const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Method not allowed');
    return;
  }

  const incoming = new URL(request.url || '/', 'http://127.0.0.1');
  const relativePath = incoming.pathname.replace(/^\/+/, '');
  const targetUrl = relativePath
    ? new URL(relativePath + incoming.search, baseUrl).href
    : new URL(baseUrl.pathname + incoming.search, baseUrl.origin).href;
  const startedAt = Date.now();

  try {
    const upstream = await fetch(targetUrl, {
      method: request.method,
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
      headers: { 'user-agent': 'Medical-Admission-Tracker-Chromium-Smoke-Test' }
    });
    const body = request.method === 'HEAD' ? null : Buffer.from(await upstream.arrayBuffer());
    const headers = Object.fromEntries(
      [...upstream.headers.entries()].filter(([name]) =>
        ['content-type', 'cache-control', 'etag', 'last-modified', 'expires'].includes(name.toLowerCase())
      )
    );
    proxiedRequests += 1;
    if (upstream.status >= 400) badResponses.push(upstream.status + ' ' + targetUrl);
    if (Date.now() - startedAt > 3000) slowRequests.push((Date.now() - startedAt) + 'ms ' + targetUrl);
    response.writeHead(upstream.status, headers);
    response.end(body);
  } catch (error) {
    failedRequests.push(targetUrl + ' — ' + (error?.message || String(error)));
    response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Upstream request failed');
  }
});

try {
  await withTimeout(new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  }), 5000, 'Local diagnostic proxy startup');
  serverStarted = true;
  const address = server.address();
  const localOrigin = 'http://127.0.0.1:' + address.port;

  browser = await withTimeout(
    chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] }),
    15000,
    'Chromium launch'
  );
  context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    serviceWorkers: 'block'
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);

  page.on('pageerror', error => errors.push('PAGE ERROR: ' + error.stack));
  page.on('requestfailed', request => failedRequests.push(
    request.url() + ' — ' + (request.failure()?.errorText || 'request failed')
  ));
  page.on('console', message => {
    if (message.type() === 'error') errors.push('CONSOLE ERROR: ' + message.text());
  });

  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin !== localOrigin) {
      await route.abort('blockedbyclient').catch(() => {});
      return;
    }
    await route.continue();
  });

  console.log('Opening deployed site in Chromium via local proxy: ' + baseUrl.href);
  const response = await withTimeout(
    page.goto(localOrigin + '/', { waitUntil: 'commit', timeout: 15000 }),
    18000,
    'Chromium page navigation'
  );
  assert.ok(response?.ok(), 'Homepage navigation failed: HTTP ' + (response?.status() ?? 'no response'));

  await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(error => {
    errors.push('DOM CONTENT LOADED TIMEOUT: ' + error.message);
  });

  await page.waitForFunction(
    () => Boolean(window.app && typeof window.app.showView === 'function'),
    undefined,
    { timeout: 10000 }
  ).catch(() => {});

  console.log('Inspecting browser app state...');
  const appState = await withTimeout(page.evaluate(() => ({
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
  })), 10000, 'Browser state evaluation');

  console.log('Browser app state: ' + JSON.stringify(appState, null, 2));
  console.log('Same-origin assets proxied: ' + proxiedRequests);
  if (errors.length) console.log('Browser errors:\n' + errors.join('\n'));
  if (failedRequests.length) console.log('Failed requests:\n' + failedRequests.join('\n'));
  if (badResponses.length) console.log('HTTP error responses:\n' + badResponses.join('\n'));
  if (slowRequests.length) console.log('Slow requests:\n' + slowRequests.join('\n'));

  assert.ok(proxiedRequests > 0, 'No site assets reached the local proxy.');
  assert.equal(appState.appExists, true,
    'The main application never created window.app. Inspect browser errors and failed requests above.');
  assert.equal(appState.loaderVisible, false,
    'The initial splash overlay remained visible after startup or its recovery timeout.');
  assert.ok(appState.bodyText.includes('Dashboard') || appState.bodyText.includes('ড্যাশবোর্ড'),
    'The page did not render dashboard navigation/content.');

  console.log('Chromium browser startup test passed.');
} catch (error) {
  console.error('Chromium browser startup test failed: ' + (error?.stack || error));
  if (errors.length) console.error('Browser errors:\n' + errors.join('\n'));
  if (failedRequests.length) console.error('Failed requests:\n' + failedRequests.join('\n'));
  if (badResponses.length) console.error('HTTP error responses:\n' + badResponses.join('\n'));
  if (slowRequests.length) console.error('Slow requests:\n' + slowRequests.join('\n'));
  console.error('Same-origin assets proxied before failure: ' + proxiedRequests);
  throw error;
} finally {
  if (context) await withTimeout(context.close(), 5000, 'Browser context close').catch(() => {});
  if (browser) {
    await withTimeout(browser.close(), 5000, 'Browser close').catch(() => {
      try { browser.process()?.kill('SIGKILL'); } catch (_) {}
    });
  }
  if (serverStarted) {
    await withTimeout(new Promise(resolve => server.close(resolve)), 3000, 'Local proxy close').catch(() => {});
  }
}
