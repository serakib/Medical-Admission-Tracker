# 🧩 Architecture & Data

Medical Admission Pro-এর frontend, authentication ও backend data flow আলাদা দায়িত্ব পালন করে।

## High-level architecture

| Layer | দায়িত্ব |
|---|---|
| GitHub Pages | Static website hosting |
| HTML / CSS / JavaScript | UI, practice flow ও browser interactions |
| Firebase Authentication | Registered account sign-in |
| Google Apps Script Web App | Medical API ও server-side validation |
| Google Sheets | Medical profiles, exam attempts, rewards, Friends data |
| Firestore | Registered users-এর in-site notification state sync (যেখানে configured) |

## Source of truth

Dedicated Apps Script + Google Sheets backend authoritative for:
- Medical profile records
- Committed exam attempts
- XP, RP, Total RP ও PB
- Rank progression
- Streaks
- Friends and friend requests
- Leaderboard calculations

Firebase Authentication registered identity যাচাই করে। Browser/localStorage-এ রাখা data authoritative reward balance বা rank হিসেবে বিবেচিত হয় না।

## Important separation

- Website GitHub Pages থেকে serve হয়।
- Apps Script Web App আলাদাভাবে deploy হয়।
- Firebase Firestore Security Rules আলাদাভাবে publish হয়।
- GitHub commit নিজে থেকে Apps Script বা Firebase deploy করে না।

## Data privacy

- Private Google Sheets public share কোরো না।
- Firebase, Telegram বা অন্য secret repository-তে commit কোরো না।
- Browser log বা screenshot-এ private student data রেখো না।
- Public frontend-এ কখনো secret key/token hardcode কোরো না।

## Technical references

- [Global Leaderboard API](https://github.com/serakib/Medical-Admission-Tracker/blob/main/docs/guides/GLOBAL_LEADERBOARD_API.md)
- [Firebase Setup](https://github.com/serakib/Medical-Admission-Tracker/blob/main/docs/guides/FIREBASE_SETUP.md)
- [Firestore Rules](https://github.com/serakib/Medical-Admission-Tracker/blob/main/docs/guides/FIRESTORE_FRIENDS_RULES.md)
