import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const assetsRoot = path.join(root, 'public', 'assets');
const output = path.join(assetsRoot, 'asset-manifest.json');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    return entry.isFile() && entry.name.toLowerCase().endsWith('.svg') ? [absolute] : [];
  });
}

function labelFromFilename(filename) {
  return path.basename(filename, '.svg')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

const files = walk(assetsRoot).sort((a, b) => a.localeCompare(b));
const categories = {};
for (const absolute of files) {
  const relative = path.relative(assetsRoot, absolute).split(path.sep).join('/');
  const parts = relative.split('/');
  const category = parts[0] === 'pets' ? 'pets'
    : parts[0] === 'avatar' && parts.length >= 3 ? parts[1]
    : 'other';
  const filename = parts.at(-1);
  (categories[category] ||= []).push({
    id: path.basename(filename, '.svg').toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
    label: labelFromFilename(filename),
    path: './public/assets/' + relative,
    content: fs.readFileSync(absolute, 'utf8')
  });
}

const manifest = {
  version: files.map(file => {
    const stat = fs.statSync(file);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    return path.relative(assetsRoot, file).split(path.sep).join('/') + ':' + hash;
  }).join('|'),
  generatedAt: new Date().toISOString(),
  total: files.length,
  categories
};

fs.mkdirSync(assetsRoot, { recursive: true });
fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Generated ${path.relative(root, output)} with ${files.length} SVG asset(s).`);
