# 🚀 Deployment & Operations

এই project-এর deployment এক জায়গায় হয় না। তিনটি আলাদা অংশ মনে রাখতে হবে।

## 1. GitHub Pages frontend

Frontend-এর HTML, CSS, JavaScript ও public assets repository-তে থাকে। Default branch-এর configured GitHub Pages workflow অনুযায়ী website update হয়।

Live site: https://serakib.github.io/Medical-Admission-Tracker/

## 2. Google Apps Script backend

Backend source: **apps-script/Medical_Admission_Tracker_Backend.gs**

নতুন backend update activate করতে:

1. Existing Apps Script project খোলো।
2. Repository-র updated backend source বসিয়ে save করো।
3. Existing Script Properties, spreadsheet IDs ও permissions অক্ষত রাখো।
4. প্রয়োজন হলে setupBackend() একবার run করে execution log যাচাই করো।
5. Deploy → Manage deployments → Edit → New version নির্বাচন করে deploy করো।
6. একই Web App URL দিয়ে health/capabilities response যাচাই করো।
7. Profile, exam attempt, rewards, PB, leaderboard, Friends ও সংশ্লিষ্ট flow test করো।

**শুধু GitHub commit করলে Apps Script deployment update হয় না।**

## 3. Firebase configuration

Firebase Authentication configuration এবং Firestore Security Rules আলাদাভাবে Firebase Console-এ manage/deploy হয়।

- Registered account authentication Firebase ID token ব্যবহার করে।
- Notification-state cross-device sync-এর জন্য প্রয়োজনীয় Firestore rule merge ও deploy করতে হয়।
- Existing private student rules replace না করে প্রয়োজনীয় rule merge করতে হবে।

## Operational checks

- Apps Script execution log-এ error দেখো।
- API health endpoint ও API version যাচাই করো।
- Duplicate exam submission বা reward mismatch আছে কি না পরীক্ষা করো।
- Cached leaderboard stale হলে refresh করে current server response যাচাই করো।
- Private Sheets/Script Properties-এর access সীমিত রাখো।

বিস্তারিত technical steps: [apps-script/README.md](https://github.com/serakib/Medical-Admission-Tracker/blob/main/apps-script/README.md)।
