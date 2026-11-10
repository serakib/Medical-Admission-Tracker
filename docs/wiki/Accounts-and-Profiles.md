# 👤 Accounts & Profiles

## Account options

### Guest Account
Guest option ব্যবহার করে দ্রুত practice শুরু করা যায়। Guest identity server-issued token দিয়ে চিহ্নিত হয়, যা browser storage-এ রাখা হয়।

Browser data clear করলে বা অন্য browser/device ব্যবহার করলে Guest session পুনরুদ্ধার করা কঠিন হতে পারে। তাই গুরুত্বপূর্ণ progress-এর জন্য নিজের registered account ব্যবহার করো।

### Registered Account
Registered account Firebase Authentication দিয়ে sign-in করে। API registered account-এর Firebase ID token verify করে তারপর account-related action সম্পন্ন করে।

## Profile

Profile-এ available information-এর মধ্যে থাকতে পারে:
- Display name ও profile information।
- Exam history এবং best score।
- XP, Level, Rank ও RP।
- Streak ও preparation progress।

কোনো তথ্য পরিবর্তন করলে save confirmation দেখার পর page refresh করে update হয়েছে কি না যাচাই করো।

## Account safety

- Password ও verification code কারও সঙ্গে share কোরো না।
- Shared/public computer-এ কাজ শেষ হলে logout করো।
- Screenshot বা public report-এ email, student ID, private result বা অন্য ব্যক্তিগত তথ্য ঢেকে দাও।
- Account deletion-এর আগে প্রয়োজনীয় তথ্য export বা সংরক্ষণের ব্যবস্থা বুঝে নাও; deletion irreversible হতে পারে।

## Data source

Registered authentication Firebase দিয়ে হয়। Medical profile, reward, exam attempts ও leaderboard-এর authoritative data dedicated Apps Script + Google Sheets backend-এ থাকে। বিস্তারিত: [Architecture & Data](Architecture-and-Data)।
