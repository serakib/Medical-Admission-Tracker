# Security Policy

Medical Admission Pro handles student accounts, learning progress, exam history, rewards, and private backend data. Please report suspected security issues responsibly so they can be reviewed without exposing students or the service.

## Supported deployments

This project does not currently maintain a public semantic-version release matrix. The following support scope applies:

| Component | Support scope |
|---|---|
| Website frontend | Latest code on the default branch (main) and the currently published GitHub Pages site |
| Google Apps Script API | The latest backend version explicitly deployed by the maintainer |
| Firebase configuration and Firestore rules | The latest configuration explicitly deployed by the maintainer |

Older commits or deployments are not guaranteed to receive security fixes. A commit to GitHub does **not** automatically update the Apps Script Web App or Firebase rules. The live backend version must be checked independently.

## Reporting a vulnerability

**Please do not publish suspected security vulnerabilities in public Issues, Discussions, Pull Requests, screenshots, or social posts.**

Preferred route:

1. Open the repository's **Security** tab.
2. If **Report a vulnerability** is available, use GitHub's private vulnerability reporting form.
3. Include the affected component/page, a concise impact description, safe reproduction steps, and relevant environment details.
4. Do not include passwords, tokens, real student records, or other people's private data.

[Open repository Security](https://github.com/serakib/Medical-Admission-Tracker/security)

If the private reporting option is not available, contact the maintainer privately through the contact method shown on the maintainer's GitHub profile. Do not post exploit details publicly while waiting for a private route.

### Expected response

The maintainer aims to acknowledge a report within **7 calendar days**. Investigation and remediation time depends on severity, reproducibility, and maintainer availability. Where practical, the reporter will receive an update when the assessment or remediation status materially changes. This is a target, not a guaranteed service-level agreement.

## Responsible research guidelines

- Test only accounts, data, and systems that you own or are explicitly authorized to test.
- Do not access, modify, export, or disclose another student's data.
- Do not perform denial-of-service testing, destructive actions, spam, or tests that interrupt service.
- Do not bypass authentication to inspect real user records.
- Use the minimum safe proof needed to demonstrate the issue.
- Stop testing and report privately if you encounter real personal data or unexpected access to another account.
- Allow the maintainer a reasonable opportunity to investigate and prepare a fix before public disclosure.

The project does not currently advertise a bug bounty. A report does not imply permission to conduct testing beyond the responsible limits above.

## Sensitive information

Never commit or publish:

- Firebase service-account private keys or private signing credentials.
- Telegram bot tokens or other service tokens.
- Apps Script secrets or private configuration values.
- Private spreadsheet exports or production student records.
- Passwords, verification codes, session tokens, or personal account data.
- Production credentials in frontend JavaScript, screenshots, logs, or issue attachments.

Use protected backend configuration (for example, Apps Script Script Properties) for backend secrets. Treat all values shipped to the public website as public.

## Security advisories

The message **“There aren't any published security advisories”** means no public security advisory has been published for this repository at the moment. It is not a vulnerability scan, a security certification, or proof that the code has no vulnerabilities. Private reports and draft advisories are not the same as published advisories.

Only publish an advisory for a real, validated vulnerability through the coordinated disclosure process. Do not create a placeholder or fictional advisory just to remove the empty-state message.

## Private vulnerability reporting setup

GitHub Private Vulnerability Reporting is a separate repository setting; adding this file does not enable it automatically. A repository administrator can review and enable it at:

[Repository security settings](https://github.com/serakib/Medical-Admission-Tracker/settings/security_analysis)

Look for **Private vulnerability reporting** under **Settings → Code security and analysis**. Once enabled, eligible reporters can submit reports privately through GitHub.

GitHub documentation:
- [Privately reporting a security vulnerability](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately)
- [Repository security advisories](https://docs.github.com/en/code-security/concepts/vulnerability-reporting-and-management/repository-security-advisories)

## Updates

This policy may be revised as the project, deployment model, and reporting options evolve.

**Last reviewed: November 10, 2026.**
