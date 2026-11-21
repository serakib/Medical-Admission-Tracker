import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stat = file => fs.statSync(path.join(root, file)).size;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cssPath = path.join(root, 'css', 'tailwind.generated.css');

assert.ok(fs.existsSync(cssPath), 'Generated Tailwind CSS must exist after build.');
const cssBytes = fs.statSync(cssPath).size;
assert.ok(cssBytes <= 250 * 1024, 'Generated Tailwind CSS exceeds the 250 KB performance budget: ' + cssBytes);
const appBundleBytes = stat('js/vendor/app.bundle.js');
assert.ok(appBundleBytes <= 2.5 * 1024 * 1024,
  'Main application bundle exceeds the 2.5 MB performance budget: ' + appBundleBytes);
assert.doesNotMatch(html, /firebase-compat\\.js|firebase-config\\.js/i,
  'Do not load the unused Firebase compatibility SDK or duplicate config script.');
assert.match(html, /rel=["']modulepreload["'][^>]+app\\.bundle\\.js/i,
  'Preload the main app module so it can download while HTML is parsed.');
assert.match(html, /rel=["']preconnect["'][^>]+www\.gstatic\.com/i,
  'Firebase SDK origin should be preconnected to reduce connection setup latency.');
assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/i,
  'Avoid blocking remote font requests; use local/system typography.');
console.log('Performance budgets passed: generated CSS ' + (cssBytes / 1024).toFixed(1) +
  ' KB, minified main app bundle ' + (appBundleBytes / 1024).toFixed(1) + ' KB.');
