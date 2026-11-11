import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Build command failed: ' + command);
};

console.log('[assets] Building local Tailwind CSS...');
const tailwindCli = path.join(root, 'node_modules', 'tailwindcss', 'lib', 'cli.js');
run(process.execPath, [tailwindCli, '-c', 'config/tailwind.config.cjs', '-i', 'css/tailwind.input.css', '-o', 'css/tailwind.generated.css', '--minify']);

console.log('[assets] Bundling the main app and Firebase modular SDK locally...');
await esbuild.build({
  entryPoints: ['js/app.js'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: ['es2020'],
  outfile: 'js/vendor/app.bundle.js',
  legalComments: 'none',
  sourcemap: false
});

console.log('[assets] Bundling local Firebase compat SDK...');
fs.mkdirSync(path.join(root, 'js', 'vendor'), { recursive: true });
await esbuild.build({
  entryPoints: ['scripts/firebase-compat-entry.js'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2019'],
  outfile: 'js/vendor/firebase-compat.js',
  legalComments: 'none',
  minify: true
});

const packages = {
  solid: require('@fortawesome/free-solid-svg-icons'),
  regular: require('@fortawesome/free-regular-svg-icons'),
  brands: require('@fortawesome/free-brands-svg-icons')
};
const iconMaps = Object.fromEntries(Object.entries(packages).map(([family, pkg]) => [
  family,
  new Map(Object.values(pkg).filter(value => value && value.iconName && value.icon).map(value => [value.iconName, value]))
]));
const sourceFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'vendor') walk(full);
    }
    else if (entry.isFile() && entry.name.endsWith('.js')) sourceFiles.push(full);
  }
}
walk(path.join(root, 'js'));
sourceFiles.push(path.join(root, 'index.html'));
const ignored = new Set([
  'solid','regular','brands','spin','pulse','fw','ul','li','border','inverse',
  'pull-left','pull-right','flip-horizontal','flip-vertical','rotate-90','rotate-180',
  'rotate-270','beat','fade','bounce','shake','beat-fade','flip','spin-pulse','spin-reverse',
  'xs','sm','lg','xl','2xl','2x','3x','4x','5x','6x','7x','8x','9x'
]);
const iconNames = new Set();
const preferredFamily = new Map();
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/fa-(solid|regular|brands)\s+fa-([a-z0-9-]+)/g)) {
    preferredFamily.set(match[2], match[1]);
  }
  for (const match of source.matchAll(/\bfa-([a-z0-9-]+)\b/g)) {
    if (!ignored.has(match[1]) && !match[1].startsWith('local-') && match[1] !== 'use') iconNames.add(match[1]);
  }
}
console.log('[assets] Generating local Font Awesome SVG sprite from ' + sourceFiles.length + ' source files...');
const symbols = [];
const missing = [];
for (const name of [...iconNames].sort()) {
  const family = preferredFamily.get(name) || 'solid';
  const iconAliases = {
    'grid-2': 'table-cells',
    'hand-wave': 'hand',
    'minus-circle': 'circle-minus',
    'shield-check': 'shield-halved'
  };
  const definition = iconMaps[family]?.get(iconAliases[name] || name);
  if (!definition) { missing.push(family + ':' + name); continue; }
  const [width, height, , , rawPaths] = definition.icon;
  const paths = Array.isArray(rawPaths) ? rawPaths : [rawPaths];
  const markup = paths.map(d => '<path d="' + String(d).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"/>').join('');
  symbols.push('<symbol id="fa-' + family + '-' + name + '" viewBox="0 0 ' + width + ' ' + height + '">' + markup + '</symbol>');
}
if (missing.length) throw new Error('Missing Font Awesome free SVG definitions: ' + missing.join(', '));
const spriteDir = path.join(root, 'public', 'assets', 'icons');
fs.mkdirSync(spriteDir, { recursive: true });
fs.writeFileSync(path.join(spriteDir, 'fontawesome.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs>' + symbols.join('') + '</defs></svg>\n');
console.log('Built local Tailwind CSS, Firebase compat bundle, and ' + symbols.length + ' Font Awesome SVG symbols.');
