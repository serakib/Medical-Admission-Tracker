import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirectories = new Set(['.git', 'node_modules']);
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) walk(path.join(directory, entry.name));
      continue;
    }

    if (entry.isFile() && /\.(?:js|mjs|gs)$/i.test(entry.name)) {
      files.push(path.join(directory, entry.name));
    }
  }
}

walk(root);
files.sort();

const failures = [];

for (const file of files) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  const extension = path.extname(file).toLowerCase();
  const args = extension === '.gs'
    ? ['--check']
    : ['--input-type=module', '--check'];

  const result = spawnSync(process.execPath, args, {
    cwd: root,
    input: fs.readFileSync(file, 'utf8'),
    encoding: 'utf8'
  });

  if (result.error || result.status !== 0) {
    failures.push(relative);
    console.error(`Syntax error in ${relative}`);
    if (result.error) console.error(result.error.message);
    if (result.stderr) console.error(result.stderr.trim());
    if (result.stdout) console.error(result.stdout.trim());
  } else {
    console.log(`Syntax OK: ${relative}`);
  }
}

if (failures.length) {
  console.error(`\nSyntax check failed for ${failures.length} file(s).`);
  process.exitCode = 1;
} else {
  console.log(`\nSyntax check passed for all ${files.length} JavaScript, MJS, and Apps Script files.`);
}
