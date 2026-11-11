# Repository Quality Audit

**Project:** Medical Admission Pro  
**Repository:** [serakib/Medical-Admission-Tracker](https://github.com/serakib/Medical-Admission-Tracker)  
**Audit date:** 11 November 2026  
**Scope:** Public repository structure, documentation, static validation workflow, deployment workflow, and latest available CI run metadata.

## Executive summary

The repository already has a substantial foundation: a separated static-app structure, project documentation, GitHub issue templates, automation workflows, a question-bank integrity checker, SVG validation, and a navigation regression test.

The latest inspected `Validate static app` run on `main` completed successfully. That is evidence that the checks currently configured in CI passed; it is **not** proof that every user-facing feature, backend integration, or live deployment works correctly.

## Verified strengths

- Clear top-level separation for `js/`, `css/`, `data/`, `public/`, `apps-script/`, `scripts/`, and `docs/`.
- Dedicated guides for architecture, deployment, security, accessibility, question bank, and project governance.
- GitHub Actions checks JavaScript and Apps Script syntax.
- Integrity validation checks local references in the entry HTML, CSS asset URLs, selected JavaScript asset references, question-bank records and metadata, duplicate HTML IDs, and SVG roots/closing tags.
- A navigation regression test protects several important view-switching behaviours.
- Avatar SVG assets are stored as individual files under categorized folders.

## Findings and recommended work

### P0 — Verify real application behaviour

The current CI checks do not run a full browser-based end-to-end suite. Add browser tests for the critical student journeys:

1. Guest entry, sign-up, login, logout, and account recovery.
2. Practice, exam start, timer, answer selection, submit, and result review.
3. Profile data and avatar save/load.
4. XP, weekly/monthly/lifetime RP, rank, trophies, streaks, and leaderboard consistency.
5. Firebase/Apps Script failure, offline, retry, and duplicate-submit handling.

Do not describe these journeys as verified until they are tested against a controlled test account and test backend.

### P1 — Expand automated quality gates

- Add a browser-based smoke test for desktop and mobile viewports.
- Validate all local references in HTML files, not only `index.html`.
- Validate every SVG as parseable XML, not only by checking its opening and closing tags.
- Add accessibility checks for labels, keyboard focus, contrast, and dialog semantics.
- Add a question-bank schema test and representative answer/explanation review.
- Add dependency and secret scanning where applicable.

### P1 — Review security boundaries

- Review Firebase and Apps Script authorization rules using least privilege.
- Confirm no private keys, service credentials, or privileged tokens are committed.
- Treat all client-side values as untrusted; enforce reward, rank, and exam-submission rules on trusted server-side code.
- Document data retention, account deletion, and student privacy practices clearly.

### P2 — Improve repository presentation

- Keep one canonical policy file per policy while retaining compatibility redirects only when needed.
- Add concise workflow/status badges to the README.
- Keep the repository description, topics, license metadata, and release notes aligned with the actual project state.
- Keep module READMEs focused on purpose, dependencies, public entry points, and safe edit locations.

## Important note about similarly named policy files

`CODE-OF-CONDUCT.md` is a short compatibility notice that points to `CODE_OF_CONDUCT.md`. It is not a duplicate copy of the policy. Retain it unless all inbound references and external links have been checked.

## Current CI evidence

The inspected `Validate static app` workflow run on 11 November 2026 completed with **success**. Its configured steps included JavaScript/Apps Script syntax checks, local asset/question-bank/SVG integrity checks, and navigation regression checks.

The audit did not execute a live browser session, authenticate as a student, mutate production data, or independently verify Firebase/Apps Script security rules. Those remain explicit follow-up checks.

## Recommended completion criteria

The project should be called production-ready only after:

- Critical student journeys pass repeatable browser tests.
- Reward and leaderboard calculations are verified against server-authoritative records.
- Mobile, keyboard, and screen-reader checks pass.
- Security rules and data lifecycle are reviewed.
- Deployment is confirmed healthy after the exact commit being released.
- A documented rollback procedure is available.
