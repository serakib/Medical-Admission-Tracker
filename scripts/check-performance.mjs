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
assert.ok(stat('js/vendor/firebase-compat.js') <= 2 * 1024 * 1024,
  'Local Firebase compatibility bundle exceeds the 2 MB budget.');
assert.match(html, /rel=["']preconnect["'][^>]+www\.gstatic\.com/i,
  'Firebase SDK origin should be preconnected to reduce connection setup latency.');
assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/i,
  'Avoid blocking remote font requests; use local/system typography.');
console.log('Performance budgets passed: generated CSS ' + (cssBytes / 1024).toFixed(1) +
  ' KB, Firebase compat bundle ' + (stat('js/vendor/firebase-compat.js') / 1024).toFixed(1) + ' KB.');
