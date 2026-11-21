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
const moduleTraceEvents = [];
const proxiedAssets = [];
let proxiedRequests = 0;
let browser;
let context;
let serverStarted = false;

function directivePrologueEnd(source) {
  let index = source.charCodeAt(0) === 0xFEFF ? 1 : 0;
  while (index < source.length) {
    while (index < source.length && /\s/.test(source[index])) index += 1;
    if (source.startsWith('//', index)) {
      const newline = source.indexOf('\n', index + 2);
      index = newline < 0 ? source.length : newline + 1;
      continue;
    }
    if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      if (end < 0) return index;
      index = end + 2;
      continue;
    }
    const quote = source[index];
    if ((quote === "'" || quote === '"') &&
        source.slice(index + 1, index + 11) === 'use strict') {
      const endQuote = source.indexOf(quote, index + 1);
      if (endQuote >= 0) {
        index = endQuote + 1;
        while (index < source.length && /\s/.test(source[index])) index += 1;
        if (source[index] === ';') index += 1;
      }
    }
    return index;
  }
  return index;
}

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
    let body = request.method === 'HEAD' ? null : Buffer.from(await upstream.arrayBuffer());
    const upstreamPath = new URL(targetUrl).pathname;
    const targetPath = upstreamPath.startsWith(baseUrl.pathname)
      ? '/' + upstreamPath.slice(baseUrl.pathname.length)
      : upstreamPath;
    if (body) {
      proxiedAssets.push(targetPath);
      if (/\.(?:m?js)$/i.test(targetPath)) {
        // Mark every same-origin JS file, including classic/deferred scripts.
        // Preserve an initial "use strict" directive when present.
        const source = body.toString('utf8');
        const prologueLength = directivePrologueEnd(source);
        const instrumented = source.slice(0, prologueLength) +
          "\nconsole.log('[MAT-TRACE] BEGIN " + targetPath + "');\n" +
          source.slice(prologueLength) +
          "\nconsole.log('[MAT-TRACE] END " + targetPath + "');\n";
        body = Buffer.from(instrumented, 'utf8');
      }
    }
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
  await page.addInitScript(() => {
    window.__MAT_STARTUP_DEBUG = true;
    document.addEventListener('readystatechange', () => {
      console.log('[MAT-TRACE] readyState=' + document.readyState);
    });
    window.addEventListener('medical-app-ready', () => {
      console.log('[MAT-TRACE] received medical-app-ready');
    });

    // Trace the first DOMContentLoaded handlers and mutation callbacks so a
    // blocked renderer can be attributed to the script that owns the callback.
    const nativeAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (this === document && type === 'DOMContentLoaded' && typeof listener === 'function') {
        const source = new Error().stack?.split('\\n').slice(2, 5).join(' <- ') || 'unknown';
        const wrapped = function (event) {
          console.log('[MAT-DIAG] DCL BEGIN ' + source);
          try { return listener.call(this, event); }
          finally { console.log('[MAT-DIAG] DCL END ' + source); }
        };
        return nativeAdd.call(this, type, wrapped, options);
      }
      return nativeAdd.call(this, type, listener, options);
    };

    const NativeObserver = window.MutationObserver;
    window.MutationObserver = class extends NativeObserver {
      constructor(callback) {
        const source = new Error().stack?.split('\\n').slice(2, 5).join(' <- ') || 'unknown';
        let calls = 0;
        super((records, observer) => {
          calls += 1;
          const trace = calls <= 4;
          if (trace) console.log('[MAT-DIAG] MO BEGIN #' + calls + ' records=' + records.length + ' ' + source);
          try { return callback(records, observer); }
          finally { if (trace) console.log('[MAT-DIAG] MO END #' + calls + ' ' + source); }
        });
      }
    };
    window.setInterval(() => console.log('[MAT-DIAG] HEARTBEAT'), 1000);
  });

  page.on('pageerror', error => errors.push('PAGE ERROR: ' + error.stack));
  page.on('crash', () => errors.push('PAGE CRASH: Chromium renderer crashed.'));
  page.on('requestfailed', request => failedRequests.push(
    request.url() + ' — ' + (request.failure()?.errorText || 'request failed')
  ));
  page.on('console', message => {
    const messageText = message.text();
    if (messageText.includes('[MAT-TRACE]') || messageText.includes('[MAT-APP-TRACE]') || messageText.includes('[MAT-DIAG]')) moduleTraceEvents.push(messageText);
    if (message.type() === 'error') errors.push('CONSOLE ERROR: ' + messageText);
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
  let appState = null;
  try {
    appState = await withTimeout(page.evaluate(() => ({
    appExists: Boolean(window.app),
    appType: typeof window.app,
    readyState: document.readyState,
    questionBankLoaded: Boolean(window.app?.questionsLoaded),
    questionCount: Array.isArray(window.app?.questionBank) ? window.app.questionBank.length : null,
    loaderExists: Boolean(document.getElementById('mat-initial-entry-loader')),
    loaderVisible: (() => {
      const el = document.getElementById('mat-initial-entry-loader');
      return Boolean(el && !el.hidden && !el.classList.contains('is-leaving'));
    })(),
    title: document.title,
    dashboardNavigationExists: Boolean(document.querySelector('[data-nav-view="home"]'))
    })), 10000, 'Browser state evaluation');
  } catch (stateError) {
    errors.push('BROWSER STATE EVALUATION: ' + (stateError?.message || String(stateError)));
  }

  if (appState) console.log('Browser app state: ' + JSON.stringify(appState, null, 2));
  else console.log('Browser app state could not be read; the page main thread may be blocked.');
  console.log('Same-origin assets proxied: ' + proxiedRequests);
  console.log('Scripts/assets fetched: ' + proxiedAssets.filter(path => /\.(?:m?js)(?:$|\?)/i.test(path)).join(' | '));
  if (moduleTraceEvents.length) console.log('Module execution trace:\\n' + moduleTraceEvents.join('\\n'));
  else console.log('Module execution trace: no trace events received.');
  if (errors.length) console.log('Browser errors:\n' + errors.join('\n'));
  if (failedRequests.length) console.log('Failed requests:\n' + failedRequests.join('\n'));
  if (badResponses.length) console.log('HTTP error responses:\n' + badResponses.join('\n'));
  if (slowRequests.length) console.log('Slow requests:\n' + slowRequests.join('\n'));

  assert.ok(proxiedRequests > 0, 'No site assets reached the local proxy.');
  assert.ok(appState, 'Browser main thread did not respond to state inspection.');
  assert.equal(appState.appExists, true,
    'The main application never created window.app. Inspect browser errors and failed requests above.');
  assert.equal(appState.loaderVisible, false,
    'The initial splash overlay remained visible after startup or its recovery timeout.');
  assert.equal(appState.dashboardNavigationExists, true,
    'The page did not render dashboard navigation.');

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
