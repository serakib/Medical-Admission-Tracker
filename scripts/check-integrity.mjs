import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const htmlPath = path.join(root, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const failures = [];
const refs = [];

for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
  const raw = match[1].trim();
  if (!raw || raw.startsWith('#') || raw.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(raw)) continue;
  const clean = raw.split(/[?#]/, 1)[0];
  if (!clean) continue;
  const target = path.resolve(root, clean.replace(/^\.\//, ''));
  refs.push(clean);
  if (!target.startsWith(root + path.sep) && target !== root) {
    failures.push(`Reference escapes repository: ${raw}`);
    continue;
  }
  if (!fs.existsSync(target)) failures.push(`Missing local asset: ${raw}`);
}

if (failures.length) {
  console.error('Static asset integrity check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Static asset integrity check passed (${refs.length} local src/href references checked).`);
}
