# 🤝 Friends & Notifications

## Friends

Friends feature দিয়ে available student directory-তে শিক্ষার্থী search করা এবং friend request পাঠানো যায়।

যে action-গুলো available:
- Student search
- Friend request পাঠানো
- Incoming request accept/reject
- Pending request cancel
- Existing friend remove
- Friends leaderboard দেখা

Current backend Guest ও registered session—দুই ধরনের authenticated session সমর্থন করে।

## Data storage

বর্তমান implementation-এ friend request ও accepted friendship dedicated Google Sheets backend-এর StudentFriends tab-এ সংরক্ষিত হয়। পুরোনো Firestore friend collections current Friends UI-এর source of truth নয়।

## In-site Notifications

Bell/notification center browser-side leaderboard ও friend activity snapshot থেকে activity/trophy notification তৈরি করে।

- Registered signed-in user-এর read/unread state Firestore-এ sync হতে পারে।
- Guest notification state browser localStorage-এ থাকে।
- এটি OS/browser push notification service নয়।
- Firestore sync-এর জন্য existing rules-এর মধ্যে notification-state rule merge ও deploy করতে হয়।

বিস্তারিত: [FIRESTORE_FRIENDS_RULES.md](https://github.com/serakib/Medical-Admission-Tracker/blob/main/FIRESTORE_FRIENDS_RULES.md)।

## Privacy reminder

Student search বা leaderboard-এ কেবল public-facing fields ব্যবহার করা উচিত। Public issue, screenshot বা recording-এ অন্য শিক্ষার্থীর private information প্রকাশ কোরো না।
