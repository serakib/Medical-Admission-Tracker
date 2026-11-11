# Development Guide

This guide covers repository development only. It does not require editing the deployed website manually.

## Requirements

- Node.js 22 (the repository's default version is recorded in `.nvmrc`).
- npm, included with Node.js.
- Git.

## Install dependencies

From the repository root:

```bash
npm ci --prefer-offline --no-audit --no-fund
```

Use `npm ci` for clean, reproducible installs. It installs exactly the dependency tree recorded in `package-lock.json` and fails if the lockfile is out of sync with `package.json`.

## Common commands

| Command | Purpose |
|---|---|
| `npm run build` | Generate local CSS, bundled frontend assets and avatar manifests |
| `npm run check:syntax` | Check JavaScript, MJS and Apps Script syntax |
| `npm run check:svg` | Verify generated SVG component parts |
| `npm run check:integrity` | Check local assets and references used by the app |
| `npm run test:navigation` | Run navigation regression checks |
| `npm test` | Run the complete build and validation suite |

Run `npm test` before pushing changes.

## GitHub Actions

- **Pull requests:** `.github/workflows/validate.yml` runs the complete test suite with `npm ci` and `npm test`. It does not deploy the site.
- **Pushes to `main`:** `.github/workflows/static.yml` runs the same clean install and test suite, prepares the Pages artifact and deploys only after validation passes.
- **Dependency manifest changes:** `.github/workflows/sync-npm-lockfile.yml` regenerates and verifies `package-lock.json` when `package.json` changes.
- **Version tags:** `.github/workflows/publish-release.yml` first checks out the exact tagged commit, performs a clean `npm ci`, and runs the complete `npm test` suite. Only a passing tag is published as a GitHub Release.
- **Supply-chain security:** `.github/workflows/scorecard.yml` runs OpenSSF Scorecard on pushes to `main`, weekly, and on manual dispatch. Its SARIF report is uploaded to GitHub Code Scanning.

Keep validation logic in `package.json` scripts instead of duplicating shell commands in workflow files.

## Updating dependencies

1. Change the exact dependency version in `package.json`.
2. Regenerate the lockfile with:

   ```bash
   npm install --package-lock-only --ignore-scripts --no-audit --no-fund
   ```

3. Verify the clean install and full test suite:

   ```bash
   npm ci --no-audit --no-fund
   npm test
   ```

4. Commit `package.json` and `package-lock.json` together.

Dependabot opens monthly update pull requests for npm packages and GitHub Actions. Major-version upgrades must pass the repository validation workflow and receive a compatibility review before merging.

## Generated files and safe editing

- Edit source scripts, configuration and assets—not generated outputs that are rebuilt by `npm run build`.
- Keep the script loading order in `index.html` intact unless dependencies have been checked.
- Keep public Firebase configuration separate from private credentials. Never commit service-account keys, private tokens, passwords or student secrets.
- For account, XP, rank, RP and leaderboard changes, trace the server-authoritative data flow before changing client-side display logic.
- Keep changes focused and run `npm test` before opening a pull request.

