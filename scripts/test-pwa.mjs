import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));
const html = read('index.html');
const offline = read('offline.html');
const worker = read('service-worker.js');
const offlineScript = read('js/offline-study.js');
const pwaScript = read('js/pwa.js');
const tools = read('js/system-tools.js');

assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, './index.html');
assert.equal(manifest.scope, './');
for (const size of ['192x192', '512x512']) {
  const icon = manifest.icons.find(item => item.sizes === size);
  assert.ok(icon, 'Missing PWA icon size ' + size);
  assert.ok(fs.existsSync(path.join(root, icon.src.replace(/^\.\//, ''))), 'Missing PWA icon file ' + icon.src);
}
for (const required of ['rel="manifest"', 'js/pwa.js', 'js/system-tools.js']) {
  assert.ok(html.includes(required), 'index.html must include ' + required);
}
assert.ok(offline.includes('js/offline-study.js'));
assert.doesNotMatch(offline, /<script[^>]+https?:\/\//i, 'Offline page must not load remote scripts.');
assert.ok(fs.existsSync(path.join(root, 'public/assets/pwa-icon.svg')));
assert.match(worker, /pwa-icon\.svg/);
assert.match(worker, /addEventListener\(['"]install['"]/);
assert.match(worker, /addEventListener\(['"]activate['"]/);
assert.match(worker, /addEventListener\(['"]fetch['"]/);
assert.match(worker, /offline\.html/);
assert.match(worker, /data\/questions\.json/);
assert.match(worker, /request\.method !== 'GET'/);
assert.match(worker, /url\.origin !== self\.location\.origin/);
assert.match(offlineScript, /correctAnswer/);
assert.match(offlineScript, /med_offline_practice_history_v1/);
assert.match(pwaScript, /serviceWorker\.register/);
assert.match(tools, /medical-admission-pro-progress-backup/);
assert.match(tools, /identityFingerprint/);
assert.match(tools, /med_history_/);
assert.match(tools, /med_answered_questions_/);
assert.doesNotMatch(tools, /med_sheet_guest_token_v1|firebaseConfig|password.*export/i,
  'Progress backup must not include credentials or Firebase secrets.');
console.log('PWA checks passed: install manifest, offline fallback, cached question bank, local practice and safe backup wiring.');
