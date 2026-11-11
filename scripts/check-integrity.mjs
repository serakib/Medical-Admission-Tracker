import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const htmlPath = path.join(root, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const failures = [];
const refs = [];

function checkLocalReference(raw, baseDir, label) {
  const value = String(raw || '').trim();
  if (!value || value.startsWith('#') || value.startsWith('//') ||
      /^(?:data:|blob:|javascript:|mailto:|tel:)/i.test(value) ||
      /^[a-z][a-z\d+.-]*:/i.test(value)) return;
  const clean = value.split(/[?#]/, 1)[0];
  if (!clean) return;
  const target = path.resolve(baseDir, clean.replace(/^\.\//, ''));
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    failures.push(`${label} escapes repository: ${raw}`);
    return;
  }
  refs.push(raw);
  if (!fs.existsSync(target)) failures.push(`Missing local asset (${label}): ${raw}`);
}

// Check HTML src/href attributes.
for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
  checkLocalReference(match[1], root, 'index.html');
}

// Duplicate IDs break getElementById(), labels, and ARIA relationships.
const idCounts = new Map();
for (const match of html.matchAll(/\bid=["']([^"']+)["']/gi)) {
  idCounts.set(match[1], (idCounts.get(match[1]) || 0) + 1);
}
for (const [id, count] of idCounts) {
  if (count > 1) failures.push(`Duplicate HTML id "${id}" appears ${count} times.`);
}

// Check local CSS url(...) references.
const cssRoot = path.join(root, 'css');
if (fs.existsSync(cssRoot)) {
  for (const entry of fs.readdirSync(cssRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.css')) continue;
    const file = path.join(cssRoot, entry.name);
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      checkLocalReference(match[1], path.dirname(file), entry.name);
    }
  }
}

// Check explicit local asset paths embedded in JavaScript.
const jsRoot = path.join(root, 'js');
function inspectJavaScriptDirectory(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'vendor') inspectJavaScriptDirectory(target);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const source = fs.readFileSync(target, 'utf8');
    for (const match of source.matchAll(/["']((?:\.\/)?public\/assets\/[^"'\s]+)["']/g)) {
      checkLocalReference(match[1], root, path.relative(root, target));
    }
  }
}
inspectJavaScriptDirectory(jsRoot);

// Validate the question bank and keep its published metadata in sync.
const questionsPath = path.join(root, 'data', 'questions.json');
const metadataPath = path.join(root, 'data', 'question-bank-info.json');
if (fs.existsSync(questionsPath) && fs.existsSync(metadataPath)) {
  const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  if (!Array.isArray(questions)) {
    failures.push('data/questions.json must contain an array.');
  } else {
    const ids = new Set();
    const subjects = {};
    let practiceTagged = 0;
    let yearTagged = 0;
    let untaggedYear = 0;
    questions.forEach((question, index) => {
      const label = question?.id || `row ${index + 1}`;
      if (!question || typeof question !== 'object') {
        failures.push(`Invalid question record at row ${index + 1}.`);
        return;
      }
      if (!question.id || ids.has(question.id)) failures.push(`Missing or duplicate question id: ${label}.`);
      ids.add(question.id);
      if (!String(question.question || '').trim()) failures.push(`Question text is missing: ${label}.`);
      if (!question.subject) failures.push(`Question subject is missing: ${label}.`);
      subjects[question.subject] = (subjects[question.subject] || 0) + 1;
      const options = question.options;
      if (!options || !['A', 'B', 'C', 'D'].every(key => String(options[key] ?? '').trim())) {
        failures.push(`Question must have four non-empty options: ${label}.`);
      }
      if (!/^[ABCD]$/i.test(String(question.correctAnswer || ''))) {
        failures.push(`Question has an invalid correctAnswer: ${label}.`);
      }
      if (typeof question.difficulty !== 'string' || !['easy', 'medium', 'hard'].includes(question.difficulty.toLowerCase())) {
        failures.push(`Question has an invalid difficulty: ${label}.`);
      }
      if (String(question.year || '').toLowerCase() === 'practice') practiceTagged++;
      else if (question.year) yearTagged++;
      else untaggedYear++;
      for (const field of ['question', 'explanation', 'source']) {
        if (typeof question[field] === 'string' && /\[cite:\s*\d+\]/i.test(question[field])) {
          failures.push(`Unresolved citation marker in ${label}.`);
        }
      }
    });
    if (metadata.totalQuestions !== questions.length) failures.push('Question metadata totalQuestions is out of sync.');
    if (JSON.stringify(metadata.subjects) !== JSON.stringify(subjects)) failures.push('Question metadata subject counts are out of sync.');
    if (metadata.practiceTaggedQuestions !== practiceTagged) failures.push('Question metadata practiceTaggedQuestions is out of sync.');
    if (metadata.yearTaggedQuestions !== yearTagged) failures.push('Question metadata yearTaggedQuestions is out of sync.');
    if (metadata.untaggedYearQuestions !== untaggedYear) failures.push('Question metadata untaggedYearQuestions is out of sync.');
    const dashboardCount = html.match(/id=["']dash-total-questions["'][^>]*>([^<]*)</i);
    if (!dashboardCount || dashboardCount[1].trim() !== `${questions.length}+`) {
      failures.push('Dashboard question-count fallback is out of sync with questions.json.');
    }
  }
}

// Every local SVG must at least have a valid SVG root and closing element.
const assetsRoot = path.join(root, 'public', 'assets');
function inspectSvgDirectory(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) inspectSvgDirectory(target);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.svg')) {
      const source = fs.readFileSync(target, 'utf8').trim();
      if (!/^<\?xml[^>]*\?>\s*/i.test(source) && !/^<svg\b/i.test(source)) {
        failures.push(`SVG file has no SVG root: ${path.relative(root, target)}`);
      }
      if (!/<\/svg>\s*$/i.test(source)) failures.push(`SVG file is not closed: ${path.relative(root, target)}`);
    }
  }
}
inspectSvgDirectory(assetsRoot);

if (failures.length) {
  console.error('Repository integrity checks failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Repository integrity checks passed (${refs.length} local references, ${idCounts.size} unique HTML ids, question bank and SVG assets checked).`);
}
