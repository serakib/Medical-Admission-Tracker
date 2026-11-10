# Release Process

This repository publishes GitHub Releases from semantic-version Git tags.

## Before creating a release

1. Review the changes included in the release.
2. Confirm the Validate static app workflow passes on main.
3. Confirm the GitHub Pages deployment is healthy.
4. Verify any Apps Script or Firebase changes were separately deployed and tested. A GitHub commit alone does not deploy those services.
5. Update the relevant sections of CHANGELOG.md.
6. Confirm the intended version and whether it is a prerelease.

## Version format

Use vMAJOR.MINOR.PATCH:

- MAJOR for incompatible changes.
- MINOR for backward-compatible features.
- PATCH for backward-compatible fixes.

Use a prerelease suffix when appropriate, for example v1.0.0-rc.1.

## Publish

Create and push an annotated Git tag from the reviewed commit:

    git tag -a v1.0.0 -m "Medical Admission Pro v1.0.0"
    git push origin v1.0.0

Pushing a matching v*.*.* tag starts the Publish tagged release workflow. It generates release notes using the categories in .github/release.yml and publishes the GitHub Release. A tag with a hyphenated suffix is marked as a prerelease.

Do not tag an unreviewed or unvalidated commit. Do not publish a release merely to populate an empty Releases page.

## After publishing

- Check the release page and generated notes.
- Add the published version and date to the release history in CHANGELOG.md.
- Confirm the website and any separately deployed backend are running the intended version.
