# Repository Management

This guide describes the GitHub project-management setup for Medical Admission Pro.

## Labels and milestones

The source of truth is:

- .github/labels.json
- .github/milestones.json

The Sync repository labels and milestones workflow creates missing labels and milestones and updates existing open definitions when the source files change. It can also be started manually from the Actions tab with Run workflow.

The sync is intentionally non-destructive: it does not delete labels, close milestones, change milestone due dates, or automatically assign open work to a release.

### Triage convention

Use one label from each relevant group:

- Type: bug, feature, enhancement, documentation, maintenance, security, accessibility, or performance.
- Area: frontend, backend, question-bank, exams, accounts, gamification, or infrastructure.
- Priority: critical, high, normal, or low.
- Status: needs-triage, blocked, or needs-review when applicable.

Attach a milestone only after the maintainer has agreed on the target release. Do not put private student data or vulnerability details in public issues.

## GitHub Projects board

The repository includes planning conventions, but a Projects V2 board is a GitHub-hosted object. It cannot be activated by committing Markdown or YAML.

Recommended board name:

**Medical Admission Pro — Roadmap**

Create it from the repository's Projects tab using New project → Board, then add this repository as a linked source. Configure these fields:

| Field | Suggested values |
|---|---|
| Status | Backlog, Ready, In progress, In review, Done |
| Priority | Critical, High, Normal, Low |
| Area | Frontend, Backend, Question Bank, Exams, Accounts, Gamification, Infrastructure |
| Target release | v1.0.0, v1.1.0, v1.2.0 |

Useful views:

- Roadmap: group by Target release.
- Work board: group by Status.
- Triage: filter to Backlog or Ready and sort by Priority.

Keep the board limited to actionable issues and pull requests. Use milestones for release scope and the Project board for day-to-day workflow.

## Webhooks and external integrations

A repository webhook needs a real HTTPS receiver and a private signing secret. This repository does not assume an endpoint or create a placeholder webhook.

Before configuring one:

1. Identify the external service that will receive events and obtain its HTTPS webhook URL.
2. Generate a unique random secret and store it only in the receiver and GitHub's webhook configuration. Never commit it or place it in frontend code.
3. In Settings → Webhooks → Add webhook, use application/json, enter the secret, and keep SSL verification enabled.
4. Select only the required events. Typical choices are Issues, Pull requests, and Releases. Avoid Send me everything unless genuinely needed.
5. Save the webhook, inspect its recent delivery, and confirm the receiver validates GitHub's signature before trusting the payload.

Do not send private student records, credentials, or other sensitive payloads to third-party services. Prefer GitHub Actions for repository-native CI, validation, and release automation; use webhooks only when an external receiver is actually required.

## Main branch protection

The active `Main` ruleset already blocks branch deletion and non-fast-forward updates. To require every change to pass the repository checks before reaching `main`, configure these additional rules in **Settings → Rules → Rulesets → Main → Edit**:

1. Target the `main` branch.
2. Enable **Require a pull request before merging**.
3. Keep the required approval count at **0** for this single-maintainer repository; otherwise the maintainer can block their own changes.
4. Under **Require status checks to pass**, add the exact check **Build and validate** (GitHub Actions). This job is provided by `.github/workflows/validate.yml`.
5. Save the ruleset. Keep deletion and non-fast-forward protections enabled.

The workflow and check are already present in the repository. The ruleset is a GitHub-hosted repository setting and cannot be changed by committing a file to the repository.
