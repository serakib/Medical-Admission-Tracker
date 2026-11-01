import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../js/feature-navigation.js', import.meta.url), 'utf8');

class FakeClassList {
  constructor(initial = []) { this.values = new Set(initial); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const shouldAdd = force === undefined ? !this.values.has(value) : Boolean(force);
    if (shouldAdd) this.values.add(value);
    else this.values.delete(value);
    return shouldAdd;
  }
}

function makeSection(id) {
  return {
    id,
    classList: new FakeClassList(['view-section', ...(id === 'view-home' ? [] : ['hidden'])]),
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; }
  };
}

const home = makeSection('view-home');
const leaderboard = makeSection('view-leaderboard');
const sections = [home, leaderboard];
const sectionById = new Map(sections.map(section => [section.id, section]));
const body = { classList: new FakeClassList() };
let coreShowViewCalls = 0;
let leaderboardRefreshCalls = 0;
let submitConfirmations = 0;

const app = {
  examActive: false,
  examState: { submitted: true },
  confirmSubmitExam() { submitConfirmations += 1; },
  showView(viewName) {
    coreShowViewCalls += 1;
    if (viewName === 'leaderboard') leaderboardRefreshCalls += 1;
  }
};

const document = {
  readyState: 'complete',
  body,
  getElementById(id) { return sectionById.get(id) || null; },
  querySelectorAll(selector) {
    if (selector === 'main .view-section') return sections;
    return [];
  }
};

const window = { app, scrollTo() {} };
vm.runInNewContext(source, { window, document, console });

const opened = app.showView('leaderboard');
assert.equal(opened, true, 'Leaderboard navigation should report success');
assert.equal(coreShowViewCalls, 1, 'The original app view controller must run');
assert.equal(leaderboardRefreshCalls, 1, 'The original leaderboard refresh hook must be preserved');
assert.equal(leaderboard.classList.contains('hidden'), false, 'Leaderboard section should be visible');
assert.equal(home.classList.contains('hidden'), true, 'Other app views should be hidden');
assert.equal(leaderboard.attributes['aria-hidden'], 'false', 'Visible view should be announced to assistive technology');

const callsBeforeUnknownView = coreShowViewCalls;
assert.equal(app.showView('missing-view'), false, 'Unknown views should fail safely');
assert.equal(coreShowViewCalls, callsBeforeUnknownView, 'Unknown views must not reach the original controller');

app.examActive = true;
app.examState.submitted = false;
const callsBeforeExamGuard = coreShowViewCalls;
assert.equal(app.showView('home'), false, 'Unsaved exam navigation should remain blocked');
assert.equal(coreShowViewCalls, callsBeforeExamGuard, 'Blocked exam navigation must not switch views');
assert.equal(submitConfirmations, 1, 'Blocked exam navigation should request submit confirmation');

console.log('Navigation regression checks passed.');
