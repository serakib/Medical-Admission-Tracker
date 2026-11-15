import assert from 'node:assert/strict';
import { createServer } from 'node:http';
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
const timeoutSignal = () => AbortSignal.timeout(12000);

// Use a real local HTTP proxy instead of fulfilling every browser navigation through
// Playwright routing. This makes document commit deterministic while Node handles
// the network request to GitHub Pages (Chromium itself has no external network access).
const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Method not allowed');
    return;
  }

  const incoming = new URL(request.url || '/', 'http://127.0.0.1');
  const basePath = baseUrl.pathname.endsWith('/') ? baseUrl.pathname : baseUrl.pathname + '/';
  let relativePath = incoming.pathname;
  if (relativePath === '/' || relativePath === basePath || relativePath === basePath.slice(0, -1)) {
    relativePath = '';
  } else if (relativePath.startsWith(basePath)) {
    // Strip the GitHub Pages project-site prefix before resolving against baseUrl.
    relativePath = relativePath.slice(basePath.length);
  } else {
    relativePath = relativePath.split('/').filter(Boolean).join('/');
  }
  const targetUrl = relativePath
    ? new URL(relativePath + incoming.search, baseUrl).href
    : baseUrl.href;

  try {
    const upstream = await fetch(targetUrl, {
      method: request.method,
      redirect: 'follow',
      signal: timeoutSignal(),
      headers: { 'user-agent': 'Medical-Admission-Tracker-Chromium-Smoke-Test' }
    });
    const headers = Object.fromEntries(
      [...upstream.headers.entries()].filter(([name]) =>
        ['content-type', 'cache-control', 'etag', 'last-modified', 'expires'].includes(name.toLowerCase())
      )
    );
    if (upstream.status >= 400) badResponses.push(upstream.status + ' ' + targetUrl);
    const body = request.method === 'HEAD' ? null : Buffer.from(await upstream.arrayBuffer());
    response.writeHead(upstream.status, headers);
    response.end(body);
  } catch (error) {
    failedRequests.push(targetUrl + ' — ' + (error?.message || String(error)));
    response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Upstream request failed');
  }
});

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
let context;
let serverStarted = false;

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  serverStarted = true;
  const address = server.address();
  const localOrigin = `http://127.0.0.1:${address.port}`;

  context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    serviceWorkers: 'block'
  });
  const page = await context.newPage();

  page.on('pageerror', error => errors.push('PAGE ERROR: ' + error.stack));
  page.on('requestfailed', request => {
    if (new URL(request.url()).origin === localOrigin) {
      failedRequests.push(request.url() + ' — ' + (request.failure()?.errorText || 'request failed'));
    }
  });
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

  console.log('Opening deployed files in Chromium via local Node HTTP proxy: ' + baseUrl.href);
  const response = await page.goto(localOrigin + '/', { waitUntil: 'commit', timeout: 30000 });
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
  if (errors.length) console.log('Browser errors:\n' + errors.join('\n'));
  if (failedRequests.length) console.log('Failed requests:\n' + failedRequests.join('\n'));
  if (badResponses.length) console.log('HTTP error responses:\n' + badResponses.join('\n'));

  assert.equal(appState.appExists, true,
    'The main application never created window.app. The splash should fall back and expose a retry notice.');
  assert.equal(appState.loaderVisible, false,
    'The initial splash overlay remained visible after startup or its recovery timeout.');
  assert.ok(appState.bodyText.includes('Dashboard') || appState.bodyText.includes('ড্যাশবোর্ড'),
    'The page did not render dashboard navigation/content.');

  console.log('Chromium browser startup test passed.');
} catch (error) {
  console.error('Chromium browser startup test failed.');
  if (errors.length) console.error('Browser errors:\n' + errors.join('\n'));
  if (failedRequests.length) console.error('Failed requests:\n' + failedRequests.join('\n'));
  if (badResponses.length) console.error('HTTP error responses:\n' + badResponses.join('\n'));
  throw error;
} finally {
  if (context) await context.close().catch(() => {});
  await browser.close();
  if (serverStarted) await new Promise(resolve => server.close(resolve));
}
