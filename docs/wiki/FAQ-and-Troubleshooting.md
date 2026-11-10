# ❓ FAQ & Troubleshooting

## Website update হয়েছে, কিন্তু backend behaviour বদলায়নি কেন?
Frontend GitHub Pages থেকে publish হয়। Apps Script backend আলাদাভাবে deploy করতে হয়। GitHub commit করলেই existing Apps Script Web App নতুন source চালায় না। [Deployment Guide](Deployment-and-Operations) দেখো।

## Leaderboard পুরোনো data দেখাচ্ছে কেন?
Network বা API response delay হলে cached leaderboard দেখা যেতে পারে। Refresh করে আবার চেষ্টা করো। Exam submit করার পর reward না দেখালে একই exam পুনরায় submit কোরো না; আগে profile ও exam history যাচাই করো।

## Friends notification অন্য device-এ sync হচ্ছে না কেন?
Registered account-এর notification state Firestore-এ sync হতে পারে। প্রয়োজনীয় Firestore rule merge ও deploy না থাকলে local fallback ব্যবহার হতে পারে। [Friends & Notifications](Friends-and-Notifications) দেখো।

## Guest account অন্য browser-এ দেখাচ্ছে না কেন?
Guest identity browser storage-এ রাখা token-এর সঙ্গে যুক্ত। অন্য browser/device-এ আলাদা Guest session হতে পারে। দীর্ঘমেয়াদি continuity-এর জন্য registered account ব্যবহার করো।

## “There aren't any published security advisories” কেন দেখায়?
কারণ repository-এর জন্য বর্তমানে কোনো public security advisory প্রকাশিত নেই। এটা কোনো security scan report নয় এবং site নিরাপদ—এমন certification-ও নয়। Vulnerability report করা ও advisory publish করা আলাদা বিষয়। বিস্তারিত [Security & Privacy](Security-and-Privacy)।

## Website-এ admission marks বা duration কি official?
Website-এ প্রদর্শিত guideline পরিবর্তিত হতে পারে। সংশ্লিষ্ট শিক্ষাবর্ষের official admission circular-ই authoritative।

## Question Bank-এ নতুন প্রশ্ন কীভাবে যোগ হয়?
Question collection repository-র questions.json file-এ রাখা হয়। Source, year ও answer যাচাই ছাড়া প্রশ্ন যোগ করা উচিত নয়। [Question Bank](Question-Bank) দেখো।

## Bug report কোথায় করব?
[Bug Report form](https://github.com/serakib/Medical-Admission-Tracker/issues/new?template=bug_report.yml) ব্যবহার করো। Password, token বা private student data attach কোরো না।

## আরও সাহায্য
আগে [Getting Started](Getting-Started) ও সংশ্লিষ্ট technical guide দেখো। না মিললে নতুন Issue তৈরি করো।
