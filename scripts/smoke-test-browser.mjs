import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const suppliedUrl = process.argv[2];
if (!suppliedUrl) {
  console.error('Usage: node scripts/smoke-test-browser.mjs <deployed-url>');
  process.exit(2);
}

const baseUrl = new URL(suppliedUrl);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const errors = [];
const failedRequests = [];

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();

  page.on('pageerror', error => errors.push('PAGE ERROR: ' + error.stack));
  page.on('console', message => {
    if (message.type() === 'error') errors.push('CONSOLE ERROR: ' + message.text());
  });
  page.on('requestfailed', request => {
    failedRequests.push(request.url() + ' — ' + (request.failure()?.errorText || 'request failed'));
  });

  console.log('Opening in Chromium: ' + baseUrl.href);
  const response = await page.goto(baseUrl.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
  assert.ok(response?.ok(), 'Homepage navigation failed: HTTP ' + (response?.status() ?? 'no response'));

  // The application-ready event is emitted only after the main app instance is constructed.
  await page.waitForFunction(
    () => Boolean(window.app && typeof window.app.showView === 'function'),
    undefined,
    { timeout: 30000 }
  ).catch(() => {});

  const appState = await page.evaluate(() => ({
    appExists: Boolean(window.app),
    appType: typeof window.app,
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

  assert.equal(appState.appExists, true,
    'The main application never created window.app. The splash remains because startup did not complete.');
  assert.equal(appState.loaderVisible, false,
    'The main application exists, but the initial splash overlay is still visible.');
  assert.ok(appState.bodyText.includes('Dashboard') || appState.bodyText.includes('ড্যাশবোর্ড'),
    'The page did not render dashboard navigation/content.');

  if (errors.length) console.log('Browser console errors (for review):\n' + errors.join('\n'));
  if (failedRequests.length) console.log('Failed requests (for review):\n' + failedRequests.join('\n'));

  console.log('Chromium browser startup test passed.');
} catch (error) {
  console.error('Chromium browser startup test failed.');
  if (errors.length) console.error('Browser errors:\n' + errors.join('\n'));
  if (failedRequests.length) console.error('Failed requests:\n' + failedRequests.join('\n'));
  throw error;
} finally {
  await browser.close();
}
