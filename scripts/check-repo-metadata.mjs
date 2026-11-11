import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function readJson(relativePath) {
  const absolutePath = path.join(root, relativePath);
  try {
    return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    failures.push(`${relativePath}: ${error.message}`);
    return null;
  }
}

const labels = readJson('.github/labels.json');
if (labels !== null) {
  if (!Array.isArray(labels) || labels.length === 0) {
    failures.push('.github/labels.json must contain a non-empty array.');
  } else {
    const names = new Set();
    for (const [index, label] of labels.entries()) {
      const where = `.github/labels.json item ${index + 1}`;
      if (!label || typeof label !== 'object' || Array.isArray(label)) {
        failures.push(`${where} must be an object.`);
        continue;
      }
      if (typeof label.name !== 'string' || !label.name.trim()) {
        failures.push(`${where} is missing a non-empty name.`);
      } else if (names.has(label.name)) {
        failures.push(`Duplicate repository label: ${label.name}`);
      } else {
        names.add(label.name);
      }
      if (typeof label.color !== 'string' || !/^[0-9a-f]{6}$/i.test(label.color)) {
        failures.push(`${where} must use a six-character hexadecimal color.`);
      }
      if (typeof label.description !== 'string' || !label.description.trim()) {
        failures.push(`${where} is missing a description.`);
      }
    }
  }
}

const milestones = readJson('.github/milestones.json');
if (milestones !== null) {
  if (!Array.isArray(milestones)) {
    failures.push('.github/milestones.json must contain an array.');
  } else {
    const titles = new Set();
    for (const [index, milestone] of milestones.entries()) {
      const where = `.github/milestones.json item ${index + 1}`;
      if (!milestone || typeof milestone !== 'object' || Array.isArray(milestone)) {
        failures.push(`${where} must be an object.`);
        continue;
      }
      if (typeof milestone.title !== 'string' || !milestone.title.trim()) {
        failures.push(`${where} is missing a non-empty title.`);
      } else if (titles.has(milestone.title)) {
        failures.push(`Duplicate milestone title: ${milestone.title}`);
      } else {
        titles.add(milestone.title);
      }
      if (typeof milestone.description !== 'string' || !milestone.description.trim()) {
        failures.push(`${where} is missing a description.`);
      }
    }
  }
}

const requiredFiles = [
  '.github/dependabot.yml',
  '.github/CODEOWNERS',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/accessibility_report.yml',
  '.github/workflows/validate.yml',
  '.github/workflows/static.yml',
  '.github/workflows/security.yml',
  '.github/workflows/scorecard.yml',
  '.github/workflows/monitor-live.yml',
  '.github/workflows/publish-release.yml',
  'SECURITY.md',
  'CONTRIBUTING.md'
];

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    failures.push(`Required repository-management file is missing: ${relativePath}`);
  } else if (!fs.readFileSync(absolutePath, 'utf8').trim()) {
    failures.push(`Required repository-management file is empty: ${relativePath}`);
  }
}

const dependabotPath = path.join(root, '.github/dependabot.yml');
if (fs.existsSync(dependabotPath)) {
  const dependabot = fs.readFileSync(dependabotPath, 'utf8');
  if (!/^version:\s*2\s*$/m.test(dependabot)) {
    failures.push('.github/dependabot.yml must declare Dependabot version 2.');
  }
  for (const ecosystem of ['npm', 'github-actions']) {
    if (!dependabot.includes(`package-ecosystem: "${ecosystem}"`)) {
      failures.push(`Dependabot updates are not configured for ${ecosystem}.`);
    }
  }
}

if (failures.length) {
  console.error('Repository metadata validation failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Repository metadata validation passed (${labels.length} labels, ${milestones.length} milestones, ${requiredFiles.length} required management files).`);
}
