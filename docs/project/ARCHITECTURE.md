# System Architecture

This file is a high-level entry point to the technical architecture documentation. It describes the repository's documented components; deployment details can differ from the latest source until the relevant service is separately deployed.

## Main components

- **Browser frontend:** `index.html`, `css/style.css`, `js/app.js` and supporting files provide the student-facing application. The site is published through GitHub Pages.
- **Question data:** `data/questions.json` contains the question-bank data consumed by the frontend. `data/question-bank-info.json` provides related question-bank metadata.
- **Authentication:** the frontend integrates Firebase Authentication for account sign-in.
- **Application backend:** `apps-script/Medical_Admission_Tracker_Backend.gs` contains the Google Apps Script backend. The application uses this service for server-side operations and data access.
- **Data storage:** the current project documentation describes Google Sheets-backed application records and Firebase services. Exact responsibilities and deployed configuration are documented in the backend and operations guides.
- **Automation:** `.github/workflows/` contains repository validation, static-site and release-related workflows.

## Request and data flow (conceptual)

1. A student opens the GitHub Pages frontend.
2. The frontend loads static application assets and question-bank files.
3. Account-dependent features use the configured authentication provider.
4. Operations requiring shared application data communicate with the configured Apps Script backend.
5. The backend performs the configured data operations and returns a response for the frontend to display.

This is a conceptual overview, not a guarantee that every feature follows an identical request path. Never place private service credentials in browser-delivered files.

## Detailed documentation

- [Architecture and data model](./docs/wiki/Architecture-and-Data.md)
- [Deployment and operations](./docs/wiki/Deployment-and-Operations.md)
- [Backend setup](./apps-script/README.md)
- [Firebase setup](./FIREBASE_SETUP.md)
- [Firestore friends rules](./FIRESTORE_FRIENDS_RULES.md)
- [Global leaderboard API](./GLOBAL_LEADERBOARD_API.md)
- [Security policy](./SECURITY.md)

## Deployment boundary

A Git commit and a GitHub Pages publication do not automatically deploy every external service. Google Apps Script deployments, Firebase configuration and security rules may require separate administrative publication. Confirm the live version of each service before assuming a backend change is active.
