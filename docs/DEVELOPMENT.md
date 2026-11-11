# Development Guide

This guide covers repository development only. It does not require editing the deployed website manually.

## Requirements

- Node.js 20 or newer (GitHub Actions currently validates with Node.js 22).
- npm, included with Node.js.
- Git.

## Install build dependencies

From the repository root:

```bash
npm install --no-save --no-package-lock --prefer-offline --no-audit --no-fund
```

The exact direct build-tool versions are maintained in `package.json`. The same installation command is used by GitHub Actions.

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

- **Pull requests:** `.github/workflows/validate.yml` runs the complete test suite. It does not deploy the site.
- **Pushes to `main`:** `.github/workflows/static.yml` runs the same test suite, prepares the Pages artifact and deploys only after validation passes.
- **Version tags:** `.github/workflows/publish-release.yml` creates a GitHub Release for tags matching `vMAJOR.MINOR.PATCH`.

The production deployment and pull-request validation both call `npm test`; keep validation logic in `package.json` scripts instead of duplicating shell commands in workflow files.

## Generated files and safe editing

- Edit source scripts, configuration and assets—not generated outputs that are rebuilt by `npm run build`.
- Keep the script loading order in `index.html` intact unless dependencies have been checked.
- Keep public Firebase configuration separate from private credentials. Never commit service-account keys, private tokens, passwords or student secrets.
- For account, XP, rank, RP and leaderboard changes, trace the server-authoritative data flow before changing client-side display logic.
- Keep changes focused and run `npm test` before opening a pull request.

## Dependency updates

Dependabot checks npm dependencies and GitHub Actions monthly. Review its pull requests and confirm the validation workflow passes before merging updates.
