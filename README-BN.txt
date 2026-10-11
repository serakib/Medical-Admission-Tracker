# Medical Admission Tracker — Feature Fix Package

## What this fixes
- Moves both new feature sections inside `<main>`, so the existing `.view-section` controller can show them.
- Replaces feature button inline `app.showView(...)` handlers with a separate navigation controller that does not depend on the global `app` variable.
- Patches the incomplete `app.showView` override after the main module loads, dynamically resolving every `view-*` section so Question Bank, Practice, Exam Intro, Previous Year, Setup, and the new pages continue to open. It retains the existing unfinished-exam navigation guard.
- Adds Medical & HSC resources and a responsive Student Life Support chat UI.
- Corrects script paths and removes broken references to `.js/app-views-fix.js` / `.js/student-ai.js`.
- Fixes the frontend syntax issue and matches its `/chat` request format with the included Worker (Worker accepts `/chat` and `/`).

## Important: preserve the existing exam engine
This package deliberately does **not** replace the original root `script.js`, `questions.json`, `style.css`, or Firebase files. The original `script.js` contains the working exam, login, results and leaderboard code. In the current repository, it already exports `window.app` and has the two feature route names in its `app.showView` map. Keep that file unchanged so existing exam/login behaviour is not destroyed.

## Upload
1. Make a backup of the current GitHub repository files.
2. Replace root `index.html` with this package's `index.html`.
3. Upload/replace `js/feature-navigation.js` and `js/student-ai.js` under the `js/` folder.
4. Keep the existing root `script.js` and all question/Firebase/theme files unchanged.
5. Do not upload or include the old `app-global-fix.js` or `app-views-fix.js` script tags.

## Student Support AI backend
The front-end defaults to `https://medical-admission-tracker.asrafuldcg.workers.dev/chat`, matching the URL intended by the current repository code. The included `worker.js` is API-compatible and supports `/chat` and `/`.

If your existing Worker does not respond correctly, deploy `worker.js` to your Cloudflare Worker. In Worker Settings → Variables and Secrets, configure:
- `OPENAI_API_KEY` as a Secret (never add this to GitHub/HTML/JS).
- `ALLOWED_ORIGINS` = `https://serakib.github.io` (origin only, no repository path).
- Optional `OPENAI_MODEL` = `gpt-5-mini`, if available for your API account.

Open `https://medical-admission-tracker.asrafuldcg.workers.dev/health` to check the Worker response. `configured: true` means the key exists, not that the provider request has been tested. AI API usage may incur separate charges and requires a properly configured API account.

## Verification performed
- JavaScript syntax checked with `node --check`.
- HTML structure/feature IDs/script URLs checked with static assertions.
- This environment cannot run your browser session or deploy to GitHub/Cloudflare, so make a backup and test after publishing. AI answers require the Worker and its API secret to be configured.
